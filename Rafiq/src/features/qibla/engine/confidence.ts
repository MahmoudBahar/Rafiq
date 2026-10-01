/**
 * The field the magnetometer should see is known from the World Magnetic
 * Model: in Cairo 44 µT, dipping 45° below the horizontal. Steel and magnets
 * change it; a charging cable lifts the magnitude a little without bending
 * the direction (a Samsung on a desk read 65 µT, dip 43°, with a correct
 * heading), while the same desk by a laptop read 78 µT at 61° with the
 * compass wrong. So both the size and the dip are judged, with room for a
 * phone's own error.
 */
export const FIELD_MAGNITUDE_TOLERANCE = 0.5;
export const FIELD_DIP_TOLERANCE_DEG = 12;
/** An abnormal field must hold this long before it counts: a passing excursion is noise. */
export const FIELD_PERSIST_MS = 1000;
/** With no accuracy from the platform, this long a still heading is trusted. */
export const SETTLE_MS = 3000;

export type Confidence = 'no-location' | 'unavailable' | 'interference' | 'calibrate' | 'settling' | 'good';

export interface ConfidenceInput {
  hasCoords: boolean;
  sensorsAvailable: boolean;
  /** The field has looked wrong for a while (see `createFieldWatch`). */
  fieldAnomaly: boolean;
  /** A leap from a still heading (see `createStillness`). */
  jump: boolean;
  /** The platform's compass accuracy 0–3; null or -1 when it gives none. */
  accuracy: number | null;
  stableForMs: number;
}

/** Folds the sensor signals into one state, first match wins. */
export function confidence(i: ConfidenceInput): Confidence {
  if (!i.hasCoords) return 'no-location';
  if (!i.sensorsAvailable) return 'unavailable';
  if (i.jump || i.fieldAnomaly) return 'interference';
  if (i.accuracy !== null && i.accuracy >= 0) return i.accuracy <= 1 ? 'calibrate' : 'good';
  return i.stableForMs >= SETTLE_MS ? 'good' : 'settling';
}

export interface FieldShape {
  magnitudeUt: number;
  dipDeg: number;
}

/** Within these the field is taken as Earth's alone; at the anomaly thresholds it counts for nothing. */
export const FIELD_HEALTHY_SIZE = 0.1;
export const FIELD_HEALTHY_DIP_DEG = 3;

/**
 * How much the compass should be believed right now, 0..1: 1 when the field
 * matches the model, falling to 0 at the anomaly thresholds, the weaker of
 * size and dip. A concrete floor's rebar bent the field to a 35° dip with a
 * normal size: the compass read 50° off while the gyro-held fusion was right.
 * With a low score the fuser lets the fused motion carry the heading, as a
 * fused sensor would, instead of following the bent field.
 */
export function fieldHealth(measured: FieldShape, expected: FieldShape): number {
  const sizeOff = Math.abs(measured.magnitudeUt - expected.magnitudeUt) / expected.magnitudeUt;
  const dipOff = Math.abs(measured.dipDeg - expected.dipDeg);
  const size = 1 - (sizeOff - FIELD_HEALTHY_SIZE) / (FIELD_MAGNITUDE_TOLERANCE - FIELD_HEALTHY_SIZE);
  const dip = 1 - (dipOff - FIELD_HEALTHY_DIP_DEG) / (FIELD_DIP_TOLERANCE_DEG - FIELD_HEALTHY_DIP_DEG);
  const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
  return Math.min(clamp(size), clamp(dip));
}

export interface FieldWatch {
  /** Feed the measured field; true once it has looked wrong for `FIELD_PERSIST_MS`. */
  push(measured: FieldShape, tMs: number): boolean;
}

/** Watches the field for a sustained departure from what the model says the Earth gives here. */
export function createFieldWatch(expected: FieldShape): FieldWatch {
  let outSince: number | null = null;
  return {
    push(measured, tMs) {
      const sizeOff = Math.abs(measured.magnitudeUt - expected.magnitudeUt) / expected.magnitudeUt;
      const dipOff = Math.abs(measured.dipDeg - expected.dipDeg);
      const out = sizeOff > FIELD_MAGNITUDE_TOLERANCE || dipOff > FIELD_DIP_TOLERANCE_DEG;
      if (!out) {
        outSince = null;
        return false;
      }
      if (outSince === null) outSince = tMs;
      return tMs - outSince >= FIELD_PERSIST_MS;
    },
  };
}
