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
/**
 * The filter never *claims* to know north better than 1°: the reported σ is floored here. The
 * filter's own variance is not, so it settles where Q and R put it (~0.44°², steady state) and
 * the time constant is the τ above. Flooring the variance itself made the gain ~0.09 per bin and
 * τ ~1.2 s instead of 2 s.
 */
export const P_FLOOR_DEG2 = 1;
/** An innovation beyond this many standard deviations is rejected as disagreement. */
export const GATE_SIGMA = 3;
/** The first reading after a start or a gap is averaged over this long, ungated. */
export const SEED_S = 0.3;
/**
 * North is not first taken from a reading that looks nothing like the Earth's field: one whose
 * implied heading error (see `fieldCheck`) is beyond this. After the sensors restart, a phone
 * has been seen to report a few readings dipping −43° against the model's +45°: the field
 * upside down, a glitch, not the room.
 */
export const SEED_MAX_SCORE_DEG = 30;
/** …unless nothing better has come for this long: a spot that really is that disturbed still gets a north, with its doubt. */
export const SEED_GIVE_UP_S = 3;
/** A consistent disagreement this long is shown as interference: the field changed while the phone, per the gyroscope, did not turn. */
export const SHOW_DISAGREEMENT_S = 2;
/** A disagreement that persists this long is a changed environment, not a passing object: the filter follows the magnetometer. */
export const REACQUIRE_S = 8;
/** The disagreeing field must be healthier than the one north was taken from by this much (degrees of implied error) to be followed at once. */
export const BETTER_FIELD_DEG = 3;
/** …after holding this long. */
export const BETTER_FIELD_S = 0.5;
/** After the platform re-estimates the magnetometer's bias, a disagreement within this window is the recalibration, followed at once… */
export const BIAS_EPOCH_WINDOW_S = 2;
/**
 * …provided it is no larger than a recalibration plausibly moves north (a re-estimated hard-iron
 * offset of up to ~10 µT against Cairo's 31 µT horizontal field turns it by up to ~20°), and the
 * new field is no less healthy than the old. A bigger step, or a bent field, takes the ordinary
 * path: held, warned about after 2 s, followed after 8 s. Samsung's calibrator re-estimates
 * while a nearby magnet is being absorbed, which must not hand north to the magnet.
 */
export const RECAL_MAX_STEP_DEG = 20;
/**
 * A recalibration moves the readings in one step, at the moment it happens. So the disagreement
 * must begin at a recalibration (within this window around it, seconds: the epoch is reported with
 * its batch, the step closes the first disagreeing 100 ms bin)…
 */
export const RECAL_STEP_WINDOW_S: readonly [number, number] = [-0.1, 0.2];
/** …and hold still for this long (s)… */
export const RECAL_HOLD_S = 0.3;
/** …moving no more than this (degrees) between its first reading and its latest: a step, not a ramp. Something approaching builds up; a recalibration does not. */
export const RECAL_STEADY_DEG = 3;
/** A disagreement whose readings scatter more than this (degrees) is something moving nearby; its clock restarts. */
const RUN_SCATTER_DEG = 6;
/**
 * North learned from readings the platform did not vouch for (its calibration low or unreliable)
 * is provisional: whatever the filter's own variance says, it is reported at least this unsure, so
 * it is never called steady and the dial stays faint. The first readings the platform does vouch
 * for replace it outright.
 */
export const PROVISIONAL_SIGMA_DEG = 25;

export interface NorthMeasurement {
  t: number;
  /** Azimuth of the horizontal field in the gyro-carried frame, degrees. */
  thetaDeg: number;
  /** Measurement variance, degrees². */
  rDeg2: number;
  /** How bent the field looks, as an implied heading error (degrees); lower is healthier. */
  scoreDeg: number;
  /** The platform vouches for this reading's calibration (accuracy medium or high, or unknown, or overridden by a healthy field). */
  vouched: boolean;
}

export interface NorthState {
  seeded: boolean;
  /** Where magnetic north lies in the gyro frame, degrees; NaN until seeded. */
  thetaDeg: number;
  /** Its variance, degrees² (at least PROVISIONAL_SIGMA_DEG² while provisional). */
  pDeg2: number;
  /** North rests on readings the platform did not vouch for. */
  provisional: boolean;
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
  /**
   * Let time pass to `t` (called on every gyro sample): north's doubt grows with the gyro's
   * drift whether or not the magnetometer is being listened to, so out of posture σ is honest.
   */
  advance(t: number): void;
  /** The platform recalibrated the magnetometer at `t`. */
  biasEpoch(t: number): void;
  /** The gyro reference was lost (a gap): north must be found again. */
  reseed(): void;
  /**
   * The phone left the posture north is learned in: a disagreement in progress is set aside (it
   * cannot be judged while no reading is taken) and starts afresh when the phone is back.
   */
  pause(): void;
  state(): NorthState;
}

interface Pool {
  start: number;
  angles: CircularStats;
  r: number;
  score: number;
  unvouched: number;
  /** The first angle added. */
  first: number;
}

function pool(start: number): Pool {
  return { start, angles: circularStats(), r: 0, score: 0, unvouched: 0, first: NaN };
}

function add(p: Pool, m: NorthMeasurement) {
  if (Number.isNaN(p.first)) p.first = m.thetaDeg;
  p.angles.add(m.thetaDeg);
  p.r += m.rDeg2;
  p.score += m.scoreDeg;
  if (!m.vouched) p.unvouched++;
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
  /** Recent recalibrations (sensor time), newest last; older than BIAS_EPOCH_WINDOW_S are dropped. */
  let epochs: number[] = [];
  let seed: Pool | null = null;
  let seekingSince: number | null = null;
  let bin: Pool | null = null;
  let run: Pool | null = null;
  let runEnd = 0;
  let provisional = false;

  function update(t: number, z: number, r: number, score: number, vouched: boolean) {
    const s = p + r;
    const nu = wrap180(z, theta);
    innovation = nu;
    if (Math.abs(nu) <= GATE_SIGMA * Math.sqrt(s)) {
      const k = p / s;
      theta = normalizeDeg(theta + k * nu);
      p = (1 - k) * p;
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
    add(run, { t, thetaDeg: z, rDeg2: r, scoreDeg: score, vouched });
    runEnd = t;
    const held = t - run.start;
    const n = run.angles.count;
    const runScore = run.score / n;
    const healthier = held >= BETTER_FIELD_S && runScore + BETTER_FIELD_DEG < established;
    epochs = epochs.filter((e) => t - e <= BIAS_EPOCH_WINDOW_S);
    const start = run.start;
    const recalibrated =
      epochs.some((e) => start - e >= RECAL_STEP_WINDOW_S[0] && start - e <= RECAL_STEP_WINDOW_S[1]) &&
      held >= RECAL_HOLD_S &&
      Math.abs(wrap180(z, run.first)) <= RECAL_STEADY_DEG &&
      Math.abs(wrap180(run.angles.mean(), theta)) <= RECAL_MAX_STEP_DEG &&
      runScore <= established + BETTER_FIELD_DEG;
    if (healthier || recalibrated || held >= REACQUIRE_S) {
      theta = run.angles.mean();
      p = Math.max(P_FLOOR_DEG2, run.r / n);
      established = runScore;
      turnedSince = 0;
      reacquisitions++;
      provisional = run.unvouched > 0;
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
    advance(t) {
      if (lastT !== null && t > lastT && seeded) p += Q_DEG2_PER_S * (t - lastT);
      if (lastT === null || t > lastT) lastT = t;
    },
    measure(m) {
      this.advance(m.t);
      if (!seeded) {
        if (seekingSince === null) seekingSince = m.t;
        if (m.scoreDeg > SEED_MAX_SCORE_DEG && m.t - seekingSince < SEED_GIVE_UP_S) return;
        if (!seed) seed = pool(m.t);
        add(seed, m);
        if (m.t - seed.start >= SEED_S) {
          const n = seed.angles.count;
          theta = seed.angles.mean();
          if (Number.isFinite(theta)) {
            seeded = true;
            seekingSince = null;
            p = Math.max(P_FLOOR_DEG2, seed.r / n, seed.angles.spread() ** 2);
            established = seed.score / n;
            turnedSince = 0;
            provisional = seed.unvouched > 0;
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
        if (Number.isFinite(z)) {
          if (provisional && bin.unvouched === 0) {
            // The platform now vouches for its calibration: north learned before it did is dropped
            // and taken from this reading, however far it moves (a calibration can move it by more
            // than any gate would let through).
            theta = z;
            p = Math.max(P_FLOOR_DEG2, bin.r / n);
            established = bin.score / n;
            turnedSince = 0;
            reacquisitions++;
            provisional = false;
            run = null;
          } else update(m.t, z, bin.r / n, bin.score / n, bin.unvouched === 0);
        }
        bin = null;
      }
    },
    biasEpoch(t) {
      epochs = epochs.filter((e) => t - e <= BIAS_EPOCH_WINDOW_S);
      epochs.push(t);
    },
    pause() {
      run = null;
      bin = null;
      // A seed half-gathered before the phone left is not finished by one reading after it returns,
      // and the give-up clock counts only time spent looking.
      seed = null;
      seekingSince = null;
    },
    reseed() {
      seeded = false;
      provisional = false;
      seekingSince = null;
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
        pDeg2: Math.max(p, provisional ? PROVISIONAL_SIGMA_DEG ** 2 : P_FLOOR_DEG2),
        provisional,
        innovationDeg: innovation,
        disagreementS: run ? runEnd - run.start : 0,
        reacquisitions,
      };
    },
  };
}
