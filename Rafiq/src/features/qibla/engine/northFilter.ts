import { circularStats, normalizeDeg, wrap180, type CircularStats } from './angles';

/**
 * The magnetometer's heading error that no averaging removes: residual
 * calibration (soft iron, hard-iron left over), different at each tilt and
 * correlated over seconds. Phones settle at a few degrees; 3° is the 1σ
 * this filter assumes for a healthy field.
 */
export const SIGMA_SYS_DEG = 3;
/**
 * Because that error is correlated, the magnetometer is fed to the filter
 * as one averaged measurement per 100 ms rather than at its raw 50 Hz:
 * fifty correlated readings are not fifty independent ones, and treating
 * them so would make the filter far more certain than it is.
 */
export const UPDATE_S = 0.1;
/**
 * The filter's time constant on a healthy field. This is a tuning choice,
 * stated as one: long enough to average the magnetometer's wander out of the
 * heading, short enough that a drifting gyro reference is pulled back well
 * within a reading. The gyroscope supplies everything faster.
 */
export const TAU_S = 2;
/** Process noise, degrees²/s: the random walk that gives a 2 s time constant against a 3° measurement. */
export const Q_DEG2_PER_S = (SIGMA_SYS_DEG * SIGMA_SYS_DEG * UPDATE_S) / (TAU_S * TAU_S);
/**
 * A phone gyroscope's scale error, up to ~2 %. It is systematic: a 360°
 * spin is off by up to 7° in one direction, not by 2 % of each step
 * independently. So it is added to the variance as a total over the turn
 * made since the last accepted update, which lets the gate open for the
 * correction after a spin instead of rejecting it.
 */
export const GYRO_SCALE_ERROR = 0.02;
/** The filter never claims to know north better than 1°. */
export const P_FLOOR_DEG2 = 1;
/** An innovation beyond this many standard deviations is rejected as disagreement. */
export const GATE_SIGMA = 3;
/** The first reading after a start or a gap is averaged over this long, ungated. */
export const SEED_S = 0.3;
/** A consistent disagreement this long is shown as interference: the field changed while the phone, per the gyroscope, did not turn. */
export const SHOW_DISAGREEMENT_S = 2;
/** A disagreement that persists this long is a changed environment, not a passing object: the filter follows the magnetometer. */
export const REACQUIRE_S = 8;
/** The disagreeing field must be healthier than the one north was taken from by this much (degrees of implied error) to be followed at once. */
export const BETTER_FIELD_DEG = 3;
/** …after holding this long. */
export const BETTER_FIELD_S = 0.5;
/** After the platform re-estimates the magnetometer's bias, a disagreement within this window is the recalibration, followed at once. */
export const BIAS_EPOCH_WINDOW_S = 2;
/** A disagreement whose readings scatter more than this (degrees) is something moving nearby; its clock restarts. */
const RUN_SCATTER_DEG = 6;

export interface NorthMeasurement {
  t: number;
  /** Azimuth of the horizontal field in the gyro-carried frame, degrees. */
  thetaDeg: number;
  /** Measurement variance, degrees². */
  rDeg2: number;
  /** How bent the field looks, as an implied heading error (degrees); lower is healthier. */
  scoreDeg: number;
}

export interface NorthState {
  seeded: boolean;
  /** Where magnetic north lies in the gyro frame, degrees; NaN until seeded. */
  thetaDeg: number;
  /** Its variance, degrees². */
  pDeg2: number;
  /** The last update's innovation, degrees. */
  innovationDeg: number;
  /** How long the magnetometer has consistently disagreed with the gyro-carried north, seconds. */
  disagreementS: number;
  reacquisitions: number;
}

export interface NorthFilter {
  /** Account for a turn about the vertical (degrees, either sign) made since the last call. */
  turned(deg: number): void;
  /** Feed one magnetometer reading. */
  measure(m: NorthMeasurement): void;
  /** The platform recalibrated the magnetometer at `t`. */
  biasEpoch(t: number): void;
  /** The gyro reference was lost (a gap): north must be found again. */
  reseed(): void;
  state(): NorthState;
}

interface Pool {
  start: number;
  angles: CircularStats;
  r: number;
  score: number;
}

function pool(start: number): Pool {
  return { start, angles: circularStats(), r: 0, score: 0 };
}

function add(p: Pool, m: NorthMeasurement) {
  p.angles.add(m.thetaDeg);
  p.r += m.rDeg2;
  p.score += m.scoreDeg;
}

/**
 * Where magnetic north lies in the gyroscope's frame: one angle, θ, and a
 * scalar Kalman filter on it. The gyroscope carries the heading through
 * every turn; the magnetometer only ever corrects θ, slowly, and only when
 * it agrees with where the gyroscope says north should still be.
 *
 * A reading that disagrees beyond the gate is not followed. While the phone
 * did not turn, a field that changes is something magnetic nearby, and the
 * gyroscope's north is kept. It is let go when holding it is no longer the
 * better bet: the new field looks healthier than the one north came from,
 * the platform has just recalibrated, or the disagreement has lasted long
 * enough to be the new surroundings rather than a passing object.
 */
export function createNorthFilter(): NorthFilter {
  let seeded = false;
  let theta = NaN;
  let p = 0;
  let established = 0;
  let lastT: number | null = null;
  let turnedSince = 0;
  let innovation = 0;
  let reacquisitions = 0;
  let epochAt = -Infinity;
  let seed: Pool | null = null;
  let bin: Pool | null = null;
  let run: Pool | null = null;
  let runEnd = 0;

  function update(t: number, z: number, r: number, score: number) {
    const s = p + r;
    const nu = wrap180(z, theta);
    innovation = nu;
    if (Math.abs(nu) <= GATE_SIGMA * Math.sqrt(s)) {
      const k = p / s;
      theta = normalizeDeg(theta + k * nu);
      p = Math.max(P_FLOOR_DEG2, (1 - k) * p);
      turnedSince = 0;
      // What north now rests on, as a slow average of the fields it was taken from.
      established += 0.05 * (score - established);
      run = null;
      return;
    }
    // Disagreement: hold the gyroscope's north and watch what the field does.
    if (!run) run = pool(t);
    else {
      const mean = run.angles.mean();
      if (Number.isFinite(mean) && Math.abs(wrap180(z, mean)) > Math.max(RUN_SCATTER_DEG, 2 * Math.sqrt(r))) run = pool(t);
    }
    add(run, { t, thetaDeg: z, rDeg2: r, scoreDeg: score });
    runEnd = t;
    const held = t - run.start;
    const n = run.angles.count;
    const runScore = run.score / n;
    const healthier = held >= BETTER_FIELD_S && runScore + BETTER_FIELD_DEG < established;
    const recalibrated = t - epochAt <= BIAS_EPOCH_WINDOW_S;
    if (healthier || recalibrated || held >= REACQUIRE_S) {
      theta = run.angles.mean();
      p = Math.max(P_FLOOR_DEG2, run.r / n);
      established = runScore;
      turnedSince = 0;
      reacquisitions++;
      run = null;
    }
  }

  return {
    turned(deg) {
      if (!seeded) return;
      const a = Math.abs(deg);
      const k2 = GYRO_SCALE_ERROR * GYRO_SCALE_ERROR;
      p += k2 * ((turnedSince + a) ** 2 - turnedSince ** 2);
      turnedSince += a;
    },
    measure(m) {
      if (lastT !== null && m.t > lastT && seeded) p += Q_DEG2_PER_S * (m.t - lastT);
      lastT = m.t;
      if (!seeded) {
        if (!seed) seed = pool(m.t);
        add(seed, m);
        if (m.t - seed.start >= SEED_S) {
          const n = seed.angles.count;
          theta = seed.angles.mean();
          if (Number.isFinite(theta)) {
            seeded = true;
            p = Math.max(P_FLOOR_DEG2, seed.r / n, seed.angles.spread() ** 2);
            established = seed.score / n;
            turnedSince = 0;
          }
          seed = null;
          bin = null;
        }
        return;
      }
      if (!bin) bin = pool(m.t);
      add(bin, m);
      if (m.t - bin.start >= UPDATE_S - 1e-6) {
        const n = bin.angles.count;
        const z = bin.angles.mean();
        if (Number.isFinite(z)) update(m.t, z, bin.r / n, bin.score / n);
        bin = null;
      }
    },
    biasEpoch(t) {
      epochAt = t;
    },
    reseed() {
      seeded = false;
      theta = NaN;
      p = 0;
      seed = null;
      bin = null;
      run = null;
      turnedSince = 0;
      innovation = 0;
    },
    state() {
      return {
        seeded,
        thetaDeg: theta,
        pDeg2: p,
        innovationDeg: innovation,
        disagreementS: run ? runEnd - run.start : 0,
        reacquisitions,
      };
    },
  };
}
