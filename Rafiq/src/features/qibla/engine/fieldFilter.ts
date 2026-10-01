import { add, norm, rotate, scale, sub, unit, type Vec3 } from './vec';

/**
 * How long the magnetometer takes to pull the estimate onto itself. The
 * gyroscope's bias after the platform's compensation is under 1°/s, so the
 * estimate can lag the truth by at most bias × τ = 0.5°; and the magnetometer's
 * grain (1–2° RMS at 50 Hz) is cut by √(dt / 2τ) ≈ 7×.
 */
export const FILTER_TAU_S = 0.5;
/** A longer gap between gyroscope samples would integrate a stale rate; the turn is left to the magnetometer. */
export const MAX_DT_S = 0.25;
/** After this long without a sample the estimate is stale and the next magnetometer reading restarts it. */
export const GAP_RESET_S = 1;

const DEG = Math.PI / 180;

export interface FieldFilter {
  /** The gyroscope says the phone turned: rotate the estimate the other way. `omega` in deg/s, device frame. */
  rotate(omegaDegS: Vec3, tS: number): void;
  /** The magnetometer says where the field is: pull the estimate toward it. Returns the estimate. */
  correct(mag: Vec3, tS: number): Vec3;
  /** The filtered field, device frame, or null before the magnetometer has spoken. */
  value(): Vec3 | null;
  reset(): void;
}

/**
 * The magnetic field vector, smoothed, in the device frame. The Earth's field
 * is fixed; what moves is the phone, and the gyroscope says exactly how. So
 * between magnetometer readings the estimate is rotated by the gyroscope
 * (exact, Rodrigues), and on each reading it is pulled toward the measurement
 * with the time constant τ. The output turns with the hand at the gyroscope's
 * rate and settles on the magnetometer's truth, without a step at any angle:
 * nothing here is an angle. Every heading, for any device axis and any
 * posture, is read off this vector and gravity afterwards.
 */
export function createFieldFilter(opts: { tauS?: number } = {}): FieldFilter {
  const tau = opts.tauS ?? FILTER_TAU_S;
  let estimate: Vec3 | null = null;
  let lastGyro: number | null = null;
  let lastMag: number | null = null;
  let stale = false;

  return {
    rotate(omegaDegS, tS) {
      if (lastGyro !== null && estimate !== null) {
        const dt = tS - lastGyro;
        if (dt > GAP_RESET_S) {
          stale = true;
        } else if (dt > 0) {
          const rate = norm(omegaDegS);
          const axis = unit(omegaDegS);
          if (axis && rate > 0) {
            // A vector fixed in the world turns the opposite way in a frame that rotates with ω.
            estimate = rotate(estimate, axis, -rate * DEG * Math.min(dt, MAX_DT_S));
          }
        }
      }
      lastGyro = tS;
    },
    correct(mag, tS) {
      const gap = lastMag === null || tS - lastMag > GAP_RESET_S;
      if (estimate === null || stale || gap) {
        estimate = mag;
        stale = false;
      } else {
        const dt = Math.max(0, tS - (lastMag as number));
        estimate = add(estimate, scale(sub(mag, estimate), Math.min(dt, tau) / tau));
      }
      lastMag = tS;
      return estimate;
    },
    value() {
      return estimate;
    },
    reset() {
      estimate = null;
      lastGyro = null;
      lastMag = null;
      stale = false;
    },
  };
}
