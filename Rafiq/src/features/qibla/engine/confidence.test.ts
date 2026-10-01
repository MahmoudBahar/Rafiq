import { describe, expect, it } from 'vitest';
import { SETTLE_S, confidence, type ConfidenceInput } from './confidence';

const good: ConfidenceInput = {
  hasCoords: true,
  sensorsAvailable: true,
  interference: false,
  fieldUsable: true,
  accuracy: 3,
  stillForS: 0,
};

describe('confidence', () => {
  it('is good with a fix, sensors, a usable field and high accuracy', () => {
    expect(confidence(good)).toBe('good');
  });
  it('needs a location before anything else', () => {
    expect(confidence({ ...good, hasCoords: false, sensorsAvailable: false })).toBe('no-location');
  });
  it('is unavailable without sensors', () => {
    expect(confidence({ ...good, sensorsAvailable: false })).toBe('unavailable');
  });
  it('reports interference ahead of the platform accuracy', () => {
    expect(confidence({ ...good, interference: true })).toBe('interference');
  });
  it('never claims good without a usable frame', () => {
    expect(confidence({ ...good, fieldUsable: false })).toBe('settling');
    expect(confidence({ ...good, fieldUsable: false, accuracy: null, stillForS: 10 })).toBe('settling');
  });
  it('asks for calibration at low accuracy', () => {
    expect(confidence({ ...good, accuracy: 1 })).toBe('calibrate');
    expect(confidence({ ...good, accuracy: 0 })).toBe('calibrate');
  });
  it('accepts medium accuracy as good', () => {
    expect(confidence({ ...good, accuracy: 2 })).toBe('good');
  });
  it('settles for a while when the platform reports no accuracy, then trusts stillness', () => {
    expect(confidence({ ...good, accuracy: null, stillForS: 0 })).toBe('settling');
    expect(confidence({ ...good, accuracy: -1, stillForS: SETTLE_S - 0.1 })).toBe('settling');
    expect(confidence({ ...good, accuracy: null, stillForS: SETTLE_S })).toBe('good');
  });
});
