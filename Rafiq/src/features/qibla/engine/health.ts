import type { FieldShape } from './field';
import { unwrap } from './smooth';
import { add, cross, dot, norm, rotate, scale, sub, unit, type Vec3 } from './vec';

// ─── Stillness ───────────────────────────────────────────────────────────────

/**
 * Below this rate the phone is still. The gyroscope's grain is ~0.1°/s RMS,
 * so this is well clear of noise, while a hand sweeping a few degrees a
 * second (what the platform's own 2° deadband would notice) is not still.
 */
export const STILL_RATE_DEG_S = 3;
/** The rate must stay under the threshold this long before the phone counts as still. */
export const STILL_HOLD_S = 1;

export interface StillReading {
  still: boolean;
  /** How long the phone has been quiet, 0 while it moves. */
  stillForS: number;
}

export interface GyroStillness {
  push(rateDegS: number, tS: number): StillReading;
}

/** Stillness from the gyroscope, which cannot be fooled by a magnet. */
export function createGyroStillness(): GyroStillness {
  let quietSince: number | null = null;
  return {
    push(rateDegS, tS) {
      if (rateDegS >= STILL_RATE_DEG_S) quietSince = null;
      else if (quietSince === null) quietSince = tS;
      const stillForS = quietSince === null ? 0 : tS - quietSince;
      return { still: stillForS >= STILL_HOLD_S, stillForS };
    },
  };
}

export interface HeadingStillness {
  push(headingDeg: number, tS: number): StillReading;
}

/**
 * Stillness from the heading alone, for a phone without a gyroscope: still
 * when the last `windowS` of headings spread no more than `rangeDeg`.
 */
export function createHeadingStillness(windowS: number, rangeDeg: number): HeadingStillness {
  let samples: { t: number; h: number }[] = [];
  let stillSince: number | null = null;
  return {
    push(headingDeg, tS) {
      const last = samples[samples.length - 1];
      samples.push({ t: tS, h: last ? unwrap(last.h, headingDeg) : headingDeg });
      // Keep one sample at or before the cutoff, so the window spans the full length once filled.
      const cutoff = tS - windowS;
      while (samples.length > 2 && samples[1].t <= cutoff) samples.shift();
      let min = Infinity;
      let max = -Infinity;
      for (const s of samples) {
        if (s.h < min) min = s.h;
        if (s.h > max) max = s.h;
      }
      const still = tS - samples[0].t >= windowS && max - min <= rangeDeg;
      if (!still) stillSince = null;
      else if (stillSince === null) stillSince = tS;
      return { still, stillForS: stillSince === null ? 0 : tS - stillSince };
    },
  };
}

// ─── The field's shape against the model ─────────────────────────────────────

/**
 * What the magnetometer should read is known from the World Magnetic Model:
 * in Cairo 44 µT dipping 45°. A calibrated phone in a clean room reads within
 * ±15% of that. Measured on a Samsung S24 Ultra: a desk with a charging cable
 * read 65 µT at 43° with the heading still right (+48%, must pass); the same
 * desk by a laptop read 78 µT at 61° with the heading wrong (+77%, must fail).
 * Android's own notion of an Earth field is 30–60 µT. So the magnitude band is
 * wide, the dip band moderate, and both have hysteresis and persistence so
 * the card neither flickers nor fires on a passing excursion.
 */
export const FIELD_ENTER_LOW = 0.65;
export const FIELD_ENTER_HIGH = 1.5;
export const FIELD_CLEAR_LOW = 0.75;
export const FIELD_CLEAR_HIGH = 1.35;
export const DIP_ENTER_DEG = 20;
export const DIP_CLEAR_DEG = 15;
/** An abnormal field must hold this long to count. */
export const FIELD_ENTER_S = 2;
/** And a normal one this long to clear. */
export const FIELD_CLEAR_S = 1;

export interface FieldWatch {
  /** Feed the measured field; true while it has looked wrong for a while. */
  push(measured: FieldShape, tS: number): boolean;
}

export function createFieldWatch(expected: FieldShape): FieldWatch {
  let anomalous = false;
  let since: number | null = null;
  return {
    push(measured, tS) {
      const ratio = measured.magnitudeUt / expected.magnitudeUt;
      const dipOff = Math.abs(measured.dipDeg - expected.dipDeg);
      const outside = anomalous
        ? ratio < FIELD_CLEAR_LOW || ratio > FIELD_CLEAR_HIGH || dipOff > DIP_CLEAR_DEG
        : ratio < FIELD_ENTER_LOW || ratio > FIELD_ENTER_HIGH || dipOff > DIP_ENTER_DEG;
      // `since` marks how long the field has been on the other side of the current state.
      if (outside === anomalous) {
        since = null;
        return anomalous;
      }
      if (since === null) since = tS;
      if (tS - since >= (anomalous ? FIELD_CLEAR_S : FIELD_ENTER_S)) {
        anomalous = !anomalous;
        since = null;
      }
      return anomalous;
    },
  };
}

// ─── The gyroscope against the magnetometer ──────────────────────────────────

/**
 * A magnet brought near turns the measured field; so does turning the phone.
 * The magnetometer cannot tell the two apart; the gyroscope can, since no
 * magnet moves it. A second copy of the field is dead-reckoned from the
 * gyroscope alone and pulled onto the measurement only slowly (τ = 3 s: a
 * 1°/s gyroscope bias then costs 3° at most). When the measurement swings
 * away from that copy by more than the threshold and stays there, the field
 * moved, not the phone.
 */
export const DISAGREE_TAU_S = 3;
/** Sensor lag at an ordinary turn (≤ 50 ms × 180°/s = 9°) stays well under this. */
export const DISAGREE_DEG = 20;
export const DISAGREE_PERSIST_S = 0.25;
/** A flick: the lag alone could reach the threshold, so the comparison is suspended. */
export const DISAGREE_MAX_RATE_DEG_S = 180;
/** How long after a flick the comparison stays suspended. */
const FLICK_HOLD_S = 0.2;

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export interface DisagreementWatch {
  pushGyro(omegaDegS: Vec3, tS: number): void;
  /** Feed the measured field with gravity; true while the measurement disagrees with the dead-reckoned copy. */
  pushMeasured(mag: Vec3, down: Vec3, tS: number): boolean;
  reset(): void;
}

export function createDisagreementWatch(): DisagreementWatch {
  let copy: Vec3 | null = null;
  let lastGyro: number | null = null;
  let lastMag: number | null = null;
  let flickUntil = -Infinity;
  let offSince: number | null = null;

  return {
    pushGyro(omegaDegS, tS) {
      const rate = norm(omegaDegS);
      if (rate > DISAGREE_MAX_RATE_DEG_S) flickUntil = tS + FLICK_HOLD_S;
      if (lastGyro !== null && copy !== null) {
        const dt = tS - lastGyro;
        const axis = unit(omegaDegS);
        if (dt > 0 && dt <= 1 && axis && rate > 0) copy = rotate(copy, axis, -rate * DEG * dt);
      }
      lastGyro = tS;
    },
    pushMeasured(mag, down, tS) {
      if (copy === null || lastMag === null || tS - lastMag > 1) {
        copy = mag;
        lastMag = tS;
        offSince = null;
        return false;
      }
      const dt = Math.max(0, tS - lastMag);
      lastMag = tS;
      const up = unit(scale(down, -1));
      let off = false;
      if (up && tS >= flickUntil) {
        // The angle between the two fields' horizontal parts: the heading they would each give.
        const a = sub(copy, scale(up, dot(copy, up)));
        const b = sub(mag, scale(up, dot(mag, up)));
        const angle = Math.atan2(norm(cross(a, b)), dot(a, b)) * RAD;
        off = angle > DISAGREE_DEG;
      }
      copy = add(copy, scale(sub(mag, copy), Math.min(dt, DISAGREE_TAU_S) / DISAGREE_TAU_S));
      if (!off) {
        offSince = null;
        return false;
      }
      if (offSince === null) offSince = tS;
      return tS - offSince >= DISAGREE_PERSIST_S;
    },
    reset() {
      copy = null;
      lastGyro = null;
      lastMag = null;
      flickUntil = -Infinity;
      offSince = null;
    },
  };
}
