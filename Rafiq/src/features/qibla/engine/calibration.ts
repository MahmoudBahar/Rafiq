import { DEG, RAD } from './angles';
import { qAngle, qConj, qMul, type Quat } from './vec';

/** The platform's accuracy must read low this long before it counts. */
export const ACCURACY_LOW_S = 1;
/** Rotation slower than this (rad/s, ~30°/s) is "in place": the readings then differ only by orientation. */
export const STILL_RATE = 30 * DEG;
/** The invariance check needs the phone to have been seen across at least this much rotation. */
export const COVERAGE_DEG = 90;
/** …within this window. */
export const WINDOW_S = 5;
/** |B| varying by more than this share of the model's strength across orientations… */
export const SPREAD_ENTER = 0.12;
/** …together with the dip varying by more than this (degrees), is an offset riding on the phone. */
export const DIP_RANGE_ENTER_DEG = 8;
export const SPREAD_LEAVE = 0.08;
export const DIP_RANGE_LEAVE_DEG = 5;

interface Point {
  t: number;
  q: Quat;
  magnitudeUt: number;
  dipDeg: number;
}

export interface CalibrationWatch {
  /** The platform's accuracy, 0–3 or -1 unknown. */
  accuracy(value: number, t: number): void;
  /** A field reading with the attitude it was taken at and the rotation rate (rad/s) at the time. */
  reading(t: number, q: Quat, magnitudeUt: number, dipDeg: number, rate: number): void;
  /** Whether the magnetometer needs calibrating. */
  needed(): boolean;
  /** Diagnostics: the last window's |B| spread (share of the model) and dip range (degrees), when it covered enough rotation. */
  readonly spread: number;
  readonly dipRange: number;
  reset(): void;
}

/**
 * Two independent signs that the magnetometer needs a figure-eight.
 *
 * The platform's own accuracy, where it can be believed: on iOS it is
 * CoreMotion's calibration state. Android's is not trusted on its own, as
 * some devices report 0 forever and a Samsung reported 3 while 40° off.
 *
 * And a physical invariant that holds on every phone: a calibrated sensor in
 * a uniform field reads the same |B| and the same dip whichever way it is
 * turned. An offset riding on the phone (an uncompensated bias, a magnetic
 * case) turns with it, so |B| and the dip change with orientation. Steel
 * nearby does not turn with the phone, so turning in place leaves them
 * alone: that is interference, not calibration, and is not reported here.
 */
export function createCalibrationWatch(totalUt: number, trustAccuracy: boolean): CalibrationWatch {
  let lowSince: number | null = null;
  let accuracyLow = false;
  let offset = false;
  let points: Point[] = [];
  let spread = 0;
  let dipRange = 0;

  function evaluate() {
    if (points.length < 5) return;
    const ref = points[0].q;
    let coverage = 0;
    let sum = 0;
    let sumSq = 0;
    let dipMin = Infinity;
    let dipMax = -Infinity;
    for (const p of points) {
      coverage = Math.max(coverage, qAngle(qMul(p.q, qConj(ref))) * RAD);
      sum += p.magnitudeUt;
      sumSq += p.magnitudeUt * p.magnitudeUt;
      dipMin = Math.min(dipMin, p.dipDeg);
      dipMax = Math.max(dipMax, p.dipDeg);
    }
    if (coverage < COVERAGE_DEG) return;
    const n = points.length;
    const mean = sum / n;
    const sd = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
    spread = totalUt > 0 ? sd / totalUt : 0;
    dipRange = dipMax - dipMin;
    if (!offset && spread > SPREAD_ENTER && dipRange > DIP_RANGE_ENTER_DEG) offset = true;
    else if (offset && spread < SPREAD_LEAVE && dipRange < DIP_RANGE_LEAVE_DEG) offset = false;
  }

  return {
    accuracy(value, t) {
      if (!trustAccuracy) return;
      if (value >= 2) {
        lowSince = null;
        accuracyLow = false;
        return;
      }
      if (value < 0) return; // Unknown says nothing either way.
      if (lowSince === null) lowSince = t;
      if (t - lowSince >= ACCURACY_LOW_S) accuracyLow = true;
    },
    reading(t, q, magnitudeUt, dipDeg, rate) {
      while (points.length > 0 && t - points[0].t > WINDOW_S) points.shift();
      if (rate > STILL_RATE) return;
      points.push({ t, q, magnitudeUt, dipDeg });
      evaluate();
    },
    needed() {
      return accuracyLow || offset;
    },
    get spread() {
      return spread;
    },
    get dipRange() {
      return dipRange;
    },
    reset() {
      lowSince = null;
      accuracyLow = false;
      offset = false;
      points = [];
      spread = 0;
      dipRange = 0;
    },
  };
}
