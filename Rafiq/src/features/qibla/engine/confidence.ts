/** With no accuracy from the platform, a phone this long still is trusted. */
export const SETTLE_S = 2;

export type Confidence = 'no-location' | 'unavailable' | 'interference' | 'calibrate' | 'settling' | 'good';

export interface ConfidenceInput {
  hasCoords: boolean;
  sensorsAvailable: boolean;
  /** The field looks wrong against the model, or moved while the phone did not (see health.ts). */
  interference: boolean;
  /** The field and gravity gave a usable frame on the latest sample. */
  fieldUsable: boolean;
  /** The platform's compass accuracy 0–3; null or -1 when it gives none. */
  accuracy: number | null;
  stillForS: number;
}

/** Folds the sensor signals into one state, first match wins. */
export function confidence(i: ConfidenceInput): Confidence {
  if (!i.hasCoords) return 'no-location';
  if (!i.sensorsAvailable) return 'unavailable';
  if (i.interference) return 'interference';
  if (!i.fieldUsable) return 'settling';
  if (i.accuracy !== null && i.accuracy >= 0) return i.accuracy <= 1 ? 'calibrate' : 'good';
  return i.stillForS >= SETTLE_S ? 'good' : 'settling';
}
