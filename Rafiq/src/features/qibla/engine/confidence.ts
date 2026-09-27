/**
 * Earth's field at the surface is 22–67 µT; a phone's magnetometer adds its
 * own error, and a charging cable or a desk lifts the magnitude a little
 * without bending the direction (a Samsung on a desk read 65 µT while its
 * heading agreed with the platform compass). Only a magnitude well outside
 * that says something magnetic is close enough to matter.
 */
export const FIELD_MIN_UT = 20;
export const FIELD_MAX_UT = 90;
/** An out-of-band field must hold this long before it counts: a passing excursion is noise. */
export const FIELD_PERSIST_MS = 1000;
/** With no accuracy from the platform, this long a still heading is trusted. */
export const SETTLE_MS = 3000;

export type Confidence = 'no-location' | 'unavailable' | 'interference' | 'calibrate' | 'settling' | 'good';

export interface ConfidenceInput {
  hasCoords: boolean;
  sensorsAvailable: boolean;
  /** The field has been out of the Earth band for a while (see `createFieldWatch`). */
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

export interface FieldWatch {
  /** Feed a field magnitude (µT); true once it has been out of the band for `FIELD_PERSIST_MS`. */
  push(microTesla: number, tMs: number): boolean;
}

/** Watches the field magnitude for a sustained departure from what the Earth alone would give. */
export function createFieldWatch(): FieldWatch {
  let outSince: number | null = null;
  return {
    push(microTesla, tMs) {
      const out = microTesla < FIELD_MIN_UT || microTesla > FIELD_MAX_UT;
      if (!out) {
        outSince = null;
        return false;
      }
      if (outSince === null) outSince = tMs;
      return tMs - outSince >= FIELD_PERSIST_MS;
    },
  };
}
