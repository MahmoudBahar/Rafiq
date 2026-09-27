import { describe, expect, it } from 'vitest';
import { distanceToMeccaKm, qiblaBearing } from './bearing';

// Reference bearings (degrees clockwise from true north) as published by the
// usual Qibla services; the great circle, never the rhumb line.
describe('qiblaBearing', () => {
  it('gives Cairo 136.14°', () => {
    expect(qiblaBearing({ latitude: 30.0444, longitude: 31.2357 })).toBeCloseTo(136.14, 1);
  });
  it('gives London 118.98°', () => {
    expect(qiblaBearing({ latitude: 51.5074, longitude: -0.1278 })).toBeCloseTo(118.98, 1);
  });
  it('gives New York 58.48°', () => {
    expect(qiblaBearing({ latitude: 40.7128, longitude: -74.006 })).toBeCloseTo(58.48, 1);
  });
  it('gives Jakarta a west-north-west bearing', () => {
    const b = qiblaBearing({ latitude: -6.2088, longitude: 106.8456 });
    expect(b).toBeGreaterThan(294);
    expect(b).toBeLessThan(296);
  });
  it('is always in [0, 360)', () => {
    for (const [latitude, longitude] of [[21.5, 39.9], [21.4, 39.8], [-33.9, 18.4], [64, -22]]) {
      const b = qiblaBearing({ latitude, longitude });
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(360);
    }
  });
});

describe('distanceToMeccaKm', () => {
  it('puts Cairo about 1,280 km from the Kaaba', () => {
    const d = distanceToMeccaKm({ latitude: 30.0444, longitude: 31.2357 });
    expect(d).toBeGreaterThan(1250);
    expect(d).toBeLessThan(1310);
  });
  it('is zero at the Kaaba', () => {
    expect(distanceToMeccaKm({ latitude: 21.4225241, longitude: 39.8261818 })).toBeCloseTo(0, 3);
  });
});
