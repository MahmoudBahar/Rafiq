import { describe, expect, it } from 'vitest';
import { createShapeWatch, impliedHeadingError, judgeField } from './fieldCheck';
import { earthField } from './geomag';

const cairo = earthField({ latitude: 30.0444, longitude: 31.2357 }, new Date('2026-10-01'));

describe('the WMM at Cairo', () => {
  it('is 44 µT dipping 45°, declination about +4.8°', () => {
    expect(cairo.totalUt).toBeCloseTo(44, 0);
    expect(cairo.dipDeg).toBeCloseTo(45, 0);
    expect(cairo.declination).toBeCloseTo(4.8, 0);
    expect(cairo.zone).toBe('normal');
  });
});

describe('earthField at the edges', () => {
  it('a date past the model is clamped into it and flagged, without the package logging an error', () => {
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...a: unknown[]) => errors.push(a);
    try {
      const late = earthField({ latitude: 30.0444, longitude: 31.2357 }, new Date('2031-06-01'));
      expect(late.outOfModel).toBe(true);
      expect(late.totalUt).toBeCloseTo(44, 0);
      const early = earthField({ latitude: 30.0444, longitude: 31.2357 }, new Date('2001-01-01'));
      expect(early.outOfModel).toBe(true);
      expect(Number.isFinite(early.declination)).toBe(true);
    } finally {
      console.error = original;
    }
    expect(errors).toEqual([]);
  });

  // The package switches method at the poles itself (model.js), so nothing needs guarding: kept as a check.
  it('a coordinate exactly at a pole does not throw', () => {
    expect(() => earthField({ latitude: 90, longitude: 0 }, new Date('2026-10-01'))).not.toThrow();
    expect(() => earthField({ latitude: -90, longitude: 0 }, new Date('2026-10-01'))).not.toThrow();
  });

  it('a date inside the model is not flagged', () => {
    expect(cairo.outOfModel).toBe(false);
  });
});

describe('judgeField against the measurements on a Samsung S24 Ultra in Cairo', () => {
  it('desk with a charging cable (65 µT, dip 43°, heading right): no implied error', () => {
    const v = judgeField({ magnitudeUt: 65, dipDeg: 43 }, cairo);
    expect(v.impliedDeg).toBe(0);
    expect(v.ratio).toBeCloseTo(1.48, 1);
  });
  it('laptop corner (78 µT, dip 61°, heading wrong): ~15.6° implied', () => {
    const v = judgeField({ magnitudeUt: 78, dipDeg: 61 }, cairo);
    expect(v.impliedDeg).toBeGreaterThan(14);
    expect(v.impliedDeg).toBeLessThan(17);
  });
  it('a field matching the model costs nothing', () => {
    const v = judgeField({ magnitudeUt: 45, dipDeg: 46 }, cairo);
    expect(v.scoreDeg).toBe(0);
    expect(v.rDeg2).toBe(0);
  });
});

describe('impliedHeadingError', () => {
  it('grows where the field is steep: the same dip push turns a weak horizontal field further', () => {
    expect(impliedHeadingError(85, { dipDeg: 73 })).toBeGreaterThan(impliedHeadingError(57, { dipDeg: 45 }));
  });
  it('allows 5° of dip error before counting', () => {
    expect(impliedHeadingError(49.9, { dipDeg: 45 })).toBe(0);
  });
});

describe('createShapeWatch', () => {
  const bent = judgeField({ magnitudeUt: 78, dipDeg: 61 }, cairo);
  const fine = judgeField({ magnitudeUt: 44, dipDeg: 45 }, cairo);
  it('reports a bent field only after it held for a second, and clears after a second and a half', () => {
    const w = createShapeWatch('normal');
    expect(w.push(bent, 0)).toBe(false);
    expect(w.push(bent, 0.9)).toBe(false);
    expect(w.push(bent, 1.0)).toBe(true);
    expect(w.push(fine, 1.1)).toBe(true);
    expect(w.push(fine, 2.5)).toBe(true);
    expect(w.push(fine, 2.6)).toBe(false);
  });
  it('a bent reading that comes and goes never reports', () => {
    const w = createShapeWatch('normal');
    for (let t = 0; t < 5; t += 0.1) expect(w.push(Math.round(t * 10) % 2 ? bent : fine, t)).toBe(false);
  });
  it('the blackout zone always reports', () => {
    expect(createShapeWatch('blackout').push(fine, 0)).toBe(true);
  });
  it('a field twice the model is reported whatever its direction', () => {
    const w = createShapeWatch('normal');
    const strong = judgeField({ magnitudeUt: 95, dipDeg: 45 }, cairo);
    w.push(strong, 0);
    expect(w.push(strong, 1)).toBe(true);
  });
});
