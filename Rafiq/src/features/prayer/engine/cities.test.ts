import { describe, expect, it } from 'vitest';
import { hasMoved, nearestCity } from './cities';
import type { Coords } from './types';

const CAIRO: Coords = { latitude: 30.0444, longitude: 31.2357 };
const ALEXANDRIA: Coords = { latitude: 31.2001, longitude: 29.9187 };
const WESTERN_DESERT: Coords = { latitude: 24.5, longitude: 27 };

/** Roughly `km` north of a point. */
const north = (from: Coords, km: number): Coords => ({ ...from, latitude: from.latitude + km / 111.19 });

describe('nearestCity', () => {
  it('snaps a fix to the listed city it sits in', () => {
    expect(nearestCity(CAIRO)?.city.name).toBe('القاهرة');
    expect(nearestCity(ALEXANDRIA)?.city.name).toBe('الإسكندرية');
  });

  it('finds nothing far from every listed city', () => {
    expect(nearestCity(WESTERN_DESERT)).toBeNull();
  });
});

describe('hasMoved', () => {
  it('counts any fix as a move when nothing is stored', () => {
    expect(hasMoved(null, CAIRO)).toBe(true);
  });

  it('ignores the wander of a phone sitting still', () => {
    expect(hasMoved(CAIRO, CAIRO)).toBe(false);
    expect(hasMoved(CAIRO, north(CAIRO, 0.3))).toBe(false);
  });

  it('sees a trip across town and a trip to another city', () => {
    expect(hasMoved(CAIRO, north(CAIRO, 3))).toBe(true);
    expect(hasMoved(CAIRO, ALEXANDRIA)).toBe(true);
  });

  it('takes the threshold it is given', () => {
    expect(hasMoved(CAIRO, north(CAIRO, 3), 5)).toBe(false);
  });
});
