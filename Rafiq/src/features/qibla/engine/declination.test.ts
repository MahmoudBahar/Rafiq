import { describe, expect, it } from 'vitest';
import { declinationFromHeading, declinationFromModel, magneticToTrue } from './declination';

describe('declinationFromHeading', () => {
  it('is the platform true-minus-magnetic difference', () => {
    expect(declinationFromHeading(140, 135)).toBeCloseTo(5, 6);
  });
  it('is signed and wraps across north', () => {
    expect(declinationFromHeading(2, 358)).toBeCloseTo(4, 6);
    expect(declinationFromHeading(358, 2)).toBeCloseTo(-4, 6);
  });
  it('is null when the platform has no true heading', () => {
    expect(declinationFromHeading(-1, 135)).toBeNull();
  });
});

describe('declinationFromModel', () => {
  it('gives Cairo about +5° east in 2026 (WMM2025)', () => {
    const d = declinationFromModel({ latitude: 30.0444, longitude: 31.2357 }, new Date('2026-09-27'));
    expect(d).toBeGreaterThan(4);
    expect(d).toBeLessThan(6);
  });
  it('gives New York a west (negative) declination', () => {
    expect(declinationFromModel({ latitude: 40.7128, longitude: -74.006 }, new Date('2026-09-27'))).toBeLessThan(-10);
  });
  it('still answers for a date past the model span', () => {
    expect(Number.isFinite(declinationFromModel({ latitude: 30, longitude: 31 }, new Date('2040-01-01')))).toBe(true);
  });
});

describe('magneticToTrue', () => {
  it('adds the declination and wraps', () => {
    expect(magneticToTrue(358, 5)).toBeCloseTo(3, 6);
    expect(magneticToTrue(2, -5)).toBeCloseTo(357, 6);
  });
});
