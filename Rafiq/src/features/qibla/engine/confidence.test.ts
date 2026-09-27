import { describe, expect, it } from 'vitest';
import { FIELD_MAX_UT, FIELD_MIN_UT, SETTLE_MS, confidence, type ConfidenceInput } from './confidence';

const good: ConfidenceInput = {
  hasCoords: true,
  sensorsAvailable: true,
  fieldMicroTesla: 45,
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
  it('reports interference when the field is outside the Earth band', () => {
    expect(confidence({ ...good, fieldMicroTesla: FIELD_MAX_UT + 10 })).toBe('interference');
    expect(confidence({ ...good, fieldMicroTesla: FIELD_MIN_UT - 5 })).toBe('interference');
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
  it('treats an unknown field as normal', () => {
    expect(confidence({ ...good, fieldMicroTesla: null })).toBe('good');
  });
});
