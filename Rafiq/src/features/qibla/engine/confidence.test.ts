import { describe, expect, it } from 'vitest';
import {
  FIELD_MAX_UT,
  FIELD_MIN_UT,
  FIELD_PERSIST_MS,
  SETTLE_MS,
  confidence,
  createFieldWatch,
  type ConfidenceInput,
} from './confidence';

describe('createFieldWatch', () => {
  it('accepts a charging phone on a desk (mid 60s µT) as normal', () => {
    const w = createFieldWatch();
    expect(w.push(66, 0)).toBe(false);
    expect(w.push(66, 5000)).toBe(false);
  });
  it('ignores a brief excursion out of the band', () => {
    const w = createFieldWatch();
    w.push(45, 0);
    expect(w.push(120, 200)).toBe(false);
    expect(w.push(45, 400)).toBe(false);
  });
  it('flags a field that stays out of the band', () => {
    const w = createFieldWatch();
    w.push(45, 0);
    w.push(120, 200);
    expect(w.push(120, 200 + FIELD_PERSIST_MS)).toBe(true);
    expect(w.push(120, 5000)).toBe(true);
  });
  it('flags a field that is far too weak as well', () => {
    const w = createFieldWatch();
    w.push(10, 0);
    expect(w.push(10, FIELD_PERSIST_MS)).toBe(true);
  });
  it('clears as soon as the field is back in the band', () => {
    const w = createFieldWatch();
    w.push(120, 0);
    w.push(120, FIELD_PERSIST_MS);
    expect(w.push(50, FIELD_PERSIST_MS + 100)).toBe(false);
  });
  it('spans a band wide enough for the Earth and a phone’s error', () => {
    expect(FIELD_MIN_UT).toBeLessThanOrEqual(22);
    expect(FIELD_MAX_UT).toBeGreaterThanOrEqual(80);
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
