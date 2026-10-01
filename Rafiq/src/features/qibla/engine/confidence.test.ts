import { describe, expect, it } from 'vitest';
import {
  FIELD_DIP_TOLERANCE_DEG,
  FIELD_MAGNITUDE_TOLERANCE,
  FIELD_PERSIST_MS,
  SETTLE_MS,
  confidence,
  createFieldWatch,
  fieldHealth,
  type ConfidenceInput,
} from './confidence';

// Cairo per the WMM: 44 µT, dipping 45°.
const CAIRO = { magnitudeUt: 44, dipDeg: 45 };

describe('fieldHealth', () => {
  it('is 1 for a field close to the model', () => {
    expect(fieldHealth({ magnitudeUt: 45, dipDeg: 44 }, CAIRO)).toBe(1);
    expect(fieldHealth({ magnitudeUt: 48, dipDeg: 48 }, CAIRO)).toBe(1);
  });
  it('is 0 at the anomaly thresholds and beyond', () => {
    expect(fieldHealth({ magnitudeUt: 66, dipDeg: 45 }, CAIRO)).toBe(0);
    expect(fieldHealth({ magnitudeUt: 44, dipDeg: 57 }, CAIRO)).toBe(0);
    expect(fieldHealth({ magnitudeUt: 120, dipDeg: 80 }, CAIRO)).toBe(0);
  });
  it('is low on the rebar floor (44 µT but dipping 35°): the gyro should carry the heading there', () => {
    const h = fieldHealth({ magnitudeUt: 43.8, dipDeg: 34.9 }, CAIRO);
    expect(h).toBeGreaterThan(0);
    expect(h).toBeLessThan(0.35);
  });
  it('is the weaker of the size and dip verdicts', () => {
    expect(fieldHealth({ magnitudeUt: 44, dipDeg: 50 }, CAIRO)).toBeLessThan(fieldHealth({ magnitudeUt: 44, dipDeg: 47 }, CAIRO));
    expect(fieldHealth({ magnitudeUt: 60, dipDeg: 45 }, CAIRO)).toBeLessThan(fieldHealth({ magnitudeUt: 50, dipDeg: 45 }, CAIRO));
  });
});

describe('createFieldWatch', () => {
  it('accepts a phone reading close to the model', () => {
    const w = createFieldWatch(CAIRO);
    expect(w.push({ magnitudeUt: 47, dipDeg: 43 }, 0)).toBe(false);
    expect(w.push({ magnitudeUt: 47, dipDeg: 43 }, 5000)).toBe(false);
  });
  it('accepts the mild lift a cable gives (desk: 65 µT, dip 43°)', () => {
    const w = createFieldWatch(CAIRO);
    w.push({ magnitudeUt: 65, dipDeg: 43 }, 0);
    expect(w.push({ magnitudeUt: 65, dipDeg: 43 }, 5000)).toBe(false);
  });
  it('flags a field far too strong, once it persists', () => {
    const w = createFieldWatch(CAIRO);
    w.push({ magnitudeUt: 45, dipDeg: 45 }, 0);
    expect(w.push({ magnitudeUt: 120, dipDeg: 45 }, 200)).toBe(false);
    expect(w.push({ magnitudeUt: 120, dipDeg: 45 }, 200 + FIELD_PERSIST_MS)).toBe(true);
  });
  it('flags a field far too weak', () => {
    const w = createFieldWatch(CAIRO);
    w.push({ magnitudeUt: 12, dipDeg: 45 }, 0);
    expect(w.push({ magnitudeUt: 12, dipDeg: 45 }, FIELD_PERSIST_MS)).toBe(true);
  });
  it('flags a field pointing the wrong way down (desk by the laptop: 78 µT, dip 61°)', () => {
    const w = createFieldWatch(CAIRO);
    w.push({ magnitudeUt: 78, dipDeg: 61 }, 0);
    expect(w.push({ magnitudeUt: 78, dipDeg: 61 }, FIELD_PERSIST_MS)).toBe(true);
  });
  it('ignores a brief excursion', () => {
    const w = createFieldWatch(CAIRO);
    w.push({ magnitudeUt: 45, dipDeg: 45 }, 0);
    expect(w.push({ magnitudeUt: 120, dipDeg: 45 }, 200)).toBe(false);
    expect(w.push({ magnitudeUt: 45, dipDeg: 45 }, 400)).toBe(false);
  });
  it('clears as soon as the field is back to normal', () => {
    const w = createFieldWatch(CAIRO);
    w.push({ magnitudeUt: 120, dipDeg: 45 }, 0);
    w.push({ magnitudeUt: 120, dipDeg: 45 }, FIELD_PERSIST_MS);
    expect(w.push({ magnitudeUt: 50, dipDeg: 45 }, FIELD_PERSIST_MS + 100)).toBe(false);
  });
  it('tolerances: half again on magnitude, 12° on dip', () => {
    expect(FIELD_MAGNITUDE_TOLERANCE).toBeCloseTo(0.5, 6);
    expect(FIELD_DIP_TOLERANCE_DEG).toBe(12);
  });
});

const good: ConfidenceInput = {
  hasCoords: true,
  sensorsAvailable: true,
  fieldAnomaly: false,
  jump: false,
  accuracy: 3,
  stableForMs: 0,
};

describe('confidence', () => {
  it('is good with a fix, sensors, a normal field and high accuracy', () => {
    expect(confidence(good)).toBe('good');
  });
  it('needs a location before anything else', () => {
    expect(confidence({ ...good, hasCoords: false, sensorsAvailable: false })).toBe('no-location');
  });
  it('is unavailable without sensors', () => {
    expect(confidence({ ...good, sensorsAvailable: false })).toBe('unavailable');
  });
  it('reports interference on a sustained field anomaly', () => {
    expect(confidence({ ...good, fieldAnomaly: true })).toBe('interference');
  });
  it('reports interference on a jump while still, even at high accuracy', () => {
    expect(confidence({ ...good, jump: true })).toBe('interference');
  });
  it('asks for calibration at low accuracy', () => {
    expect(confidence({ ...good, accuracy: 1 })).toBe('calibrate');
    expect(confidence({ ...good, accuracy: 0 })).toBe('calibrate');
  });
  it('accepts medium accuracy as good', () => {
    expect(confidence({ ...good, accuracy: 2 })).toBe('good');
  });
  it('settles for a while when the platform reports no accuracy, then trusts stillness', () => {
    expect(confidence({ ...good, accuracy: null, stableForMs: 0 })).toBe('settling');
    expect(confidence({ ...good, accuracy: -1, stableForMs: SETTLE_MS - 1 })).toBe('settling');
    expect(confidence({ ...good, accuracy: null, stableForMs: SETTLE_MS })).toBe('good');
  });
});
