import { RAD } from './angles';
import { qAxisAngle, qBetween, qConj, qFromRate, qMul, qNormalize, qRotate, twistZ, unit, type Quat, type Vec3 } from './vec';

const UP: Vec3 = [0, 0, 1];

/** How quickly the tilt is pulled onto the platform's gravity. The platform's own fusion already removed the hand's acceleration, so this only has to hide its latency against the gyro. */
export const TILT_TAU_S = 0.1;
/** A gyro silence longer than this is a gap: whatever the phone turned meanwhile is unknown. */
export const GYRO_GAP_S = 0.1;
/** Within this, a reading between two gyro samples is brought forward with the last rate. */
const EXTRAPOLATE_MAX_S = 0.05;

export interface Orientation {
  /** Feed one gyroscope sample (rad/s, device frame). Returns the turn about the vertical it made, degrees counter-clockwise, or null when it could not be integrated (before the first tilt, or across a gap). */
  gyro(t: number, w: Vec3): number | null;
  /** Feed one Earth-up sample (device frame, any length). */
  up(t: number, u: Vec3): void;
  /** The device→world attitude at time `t`, brought forward from the last gyro sample when close; null before the first tilt. */
  at(t: number): Quat | null;
  /**
   * The attitude carried on through gyro samples that have arrived but are
   * not yet committed (the merger holds them back to keep the streams in
   * order), without changing any state: what the screen should show now.
   */
  ahead(pending: readonly { t: number; v: Vec3 }[]): { q: Quat; t: number } | null;
  /** The last gyro sample left a gap (silence > GYRO_GAP_S): the heading's reference is lost. */
  readonly gaps: number;
  /** Mean angle between predicted and measured up before each correction, degrees: small when the gyro conventions are right. */
  readonly tiltResidualDeg: number;
  reset(): void;
}

/**
 * The phone's attitude, carried by the gyroscope and held level by gravity.
 *
 * The gyroscope is integrated in full 3D (q ← q · exp(ω dt / 2)), so turns
 * about any axis, upright or face down, are tracked without Euler angles.
 * Gravity from the platform's fusion pulls the tilt back: the correction is
 * the shortest rotation taking the predicted up onto the measured one, whose
 * axis is horizontal, so it can never turn the heading. The heading's
 * reference is therefore the gyroscope's alone, never the platform's yaw,
 * and where north lies in this frame is the north filter's business.
 */
export function createOrientation(): Orientation {
  let q: Quat | null = null;
  let lastGyro: { t: number; w: Vec3 } | null = null;
  let lastUpT: number | null = null;
  let gaps = 0;
  let residual = 0;

  function extrapolated(t: number): Quat | null {
    if (!q) return null;
    if (!lastGyro) return q;
    const dt = t - lastGyro.t;
    if (dt <= 0 || dt > EXTRAPOLATE_MAX_S) return q;
    return qNormalize(qMul(q, qFromRate(lastGyro.w, dt)));
  }

  return {
    gyro(t, w) {
      const prev = lastGyro;
      lastGyro = { t, w };
      if (!q || !prev) return null;
      const dt = t - prev.t;
      if (dt <= 0) return null;
      if (dt > GYRO_GAP_S) {
        gaps++;
        return null;
      }
      // Trapezoid: the mean of the two rates over the interval.
      const mean: Vec3 = [(prev.w[0] + w[0]) / 2, (prev.w[1] + w[1]) / 2, (prev.w[2] + w[2]) / 2];
      const before = q;
      q = qNormalize(qMul(q, qFromRate(mean, dt)));
      // The step in the world frame, q_k · q_{k-1}*: its twist about the vertical is the turn.
      return twistZ(qMul(q, qConj(before))) * RAD;
    },
    up(t, u) {
      const measured = unit(u);
      if (!measured) return;
      if (!q) {
        // First tilt: level the frame, yaw arbitrary (the north filter finds north).
        q = qBetween(measured, UP);
        lastUpT = t;
        return;
      }
      const now = extrapolated(t) ?? q;
      const predicted = qRotate(now, measured);
      const c = qBetween(predicted, UP);
      const angle = 2 * Math.acos(Math.min(1, Math.abs(c[3])));
      residual += 0.05 * (angle * RAD - residual);
      const dt = lastUpT === null ? 0 : Math.max(0, Math.min(0.5, t - lastUpT));
      lastUpT = t;
      const k = 1 - Math.exp(-dt / TILT_TAU_S);
      if (angle < 1e-9 || k <= 0) return;
      // A fraction k of the correction, about the same horizontal axis.
      const s = Math.sin(angle / 2);
      const axis: Vec3 = [c[0] / s, c[1] / s, c[2] / s];
      q = qNormalize(qMul(qAxisAngle(axis, angle * k), q));
    },
    at(t) {
      return extrapolated(t);
    },
    ahead(pending) {
      if (!q || !lastGyro) return null;
      let qa = q;
      let prev = lastGyro;
      for (const s of pending) {
        const dt = s.t - prev.t;
        if (dt <= 0) continue;
        if (dt > GYRO_GAP_S) break;
        const mean: Vec3 = [(prev.w[0] + s.v[0]) / 2, (prev.w[1] + s.v[1]) / 2, (prev.w[2] + s.v[2]) / 2];
        qa = qMul(qa, qFromRate(mean, dt));
        prev = { t: s.t, w: s.v };
      }
      return { q: qNormalize(qa), t: prev.t };
    },
    get gaps() {
      return gaps;
    },
    get tiltResidualDeg() {
      return residual;
    },
    reset() {
      q = null;
      lastGyro = null;
      lastUpT = null;
      gaps = 0;
      residual = 0;
    },
  };
}

