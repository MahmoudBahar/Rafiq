/** Earth's field at the surface stays within this band; a magnet or steel nearby pushes it out. */
export const FIELD_MIN_UT = 25;
export const FIELD_MAX_UT = 65;
/** With no accuracy from the platform, this long a still heading is trusted. */
export const SETTLE_MS = 3000;

export type Confidence = 'no-location' | 'unavailable' | 'interference' | 'calibrate' | 'settling' | 'good';

export interface ConfidenceInput {
  hasCoords: boolean;
  sensorsAvailable: boolean;
  /** Magnetic field magnitude, null when the magnetometer has not reported. */
  fieldMicroTesla: number | null;
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
  const field = i.fieldMicroTesla;
  if (i.jump || (field !== null && (field < FIELD_MIN_UT || field > FIELD_MAX_UT))) return 'interference';
  if (i.accuracy !== null && i.accuracy >= 0) return i.accuracy <= 1 ? 'calibrate' : 'good';
  return i.stableForMs >= SETTLE_MS ? 'good' : 'settling';
}
