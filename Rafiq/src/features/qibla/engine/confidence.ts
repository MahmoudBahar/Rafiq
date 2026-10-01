/** The compass's state as the screen shows it; first match wins (see `foldConfidence`). */
export type Confidence = 'no-location' | 'unavailable' | 'interference' | 'calibrate' | 'settling' | 'good';

/** North is trusted once its standard deviation is within this (degrees)… */
export const TRUST_SIGMA_DEG = 5;
/** …the disagreement clears after the field has agreed again for this long (seconds), so the warning does not flicker. */
export const DISAGREEMENT_CLEAR_S = 1;

export interface ConfidenceInput {
  hasCoords: boolean;
  /** No magnetometer, or no way to know which way is up. */
  unavailable: boolean;
  calibrate: boolean;
  /** The field's shape says it is bent, or the platform is in the WMM blackout zone. */
  shapeDisturbed: boolean;
  /** The magnetometer has disagreed with the gyroscope's north long enough to say so. */
  disagreement: boolean;
  /** North has been found (or, without a gyroscope, the compass has spoken). */
  seeded: boolean;
  sigmaDeg: number;
}

/**
 * One honest state from the sensor signals. Calibration comes before
 * interference: an offset riding on the phone also bends the field, and the
 * figure-eight is what fixes it. Trust, once earned, is kept by the caller
 * while the phone moves; "settling" is only for a feed that has not earned it.
 */
export function foldConfidence(i: ConfidenceInput, trusted: boolean): Confidence {
  if (!i.hasCoords) return 'no-location';
  if (i.unavailable) return 'unavailable';
  if (i.calibrate) return 'calibrate';
  if (i.shapeDisturbed || i.disagreement) return 'interference';
  if (!trusted && (!i.seeded || i.sigmaDeg > TRUST_SIGMA_DEG)) return 'settling';
  return 'good';
}
