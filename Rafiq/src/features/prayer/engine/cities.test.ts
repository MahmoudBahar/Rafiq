import { describe, expect, it } from 'vitest';
import { UNKNOWN_PLACE, distanceKm, hasMoved, judgeFix, nearestCity, retryDelay, type Fix } from './cities';
import type { Coords } from './types';

const CAIRO: Coords = { latitude: 30.0444, longitude: 31.2357 };
const ALEXANDRIA: Coords = { latitude: 31.2001, longitude: 29.9187 };
const WESTERN_DESERT: Coords = { latitude: 24.5, longitude: 27 };

/** Roughly `km` north of a point. */
const north = (from: Coords, km: number): Coords => ({
  ...from,
  latitude: from.latitude + km / 111.19,
});

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

  it('does not count exactly the threshold as a move', () => {
    const there = north(CAIRO, 1);
    expect(hasMoved(CAIRO, there, 1.01)).toBe(false);
    expect(hasMoved(CAIRO, there, 0.99)).toBe(true);
    expect(hasMoved(CAIRO, ALEXANDRIA, distanceKm(CAIRO, ALEXANDRIA))).toBe(false);
  });
});

describe('judgeFix', () => {
  const fix = (at: Coords, over: Partial<Fix> = {}): Fix => ({
    ...at,
    accuracyKm: 0.02,
    ...over,
  });
  const inCairo = { coords: CAIRO, city: 'القاهرة' };

  it('takes any fix when nothing is saved', () => {
    expect(judgeFix({ coords: null, city: null }, fix(CAIRO))).toBe('moved');
  });

  it('leaves a well-named place that has not moved', () => {
    expect(judgeFix(inCairo, fix(north(CAIRO, 0.3)))).toBe('unmoved');
  });

  it('sees a trip to another city', () => {
    expect(judgeFix(inCairo, fix(ALEXANDRIA))).toBe('moved');
  });

  it('falls back to the kilometre when the fix does not know how sure it is', () => {
    // Android reports 0 for unknown, iOS -1 for invalid.
    for (const accuracyKm of [0, -0.001]) {
      expect(judgeFix(inCairo, fix(north(CAIRO, 0.5), { accuracyKm }))).toBe('unmoved');
      expect(judgeFix(inCairo, fix(north(CAIRO, 1.5), { accuracyKm }))).toBe('moved');
    }
  });

  it('ignores a jump smaller than the fix is sure of', () => {
    expect(judgeFix(inCairo, fix(north(CAIRO, 4), { accuracyKm: 8 }))).toBe('unmoved');
    expect(judgeFix(inCairo, fix(north(CAIRO, 4), { accuracyKm: 0.05 }))).toBe('moved');
    expect(judgeFix(inCairo, fix(ALEXANDRIA, { accuracyKm: 8 }))).toBe('moved');
  });

  it('mends a name that is not the nearest listed city', () => {
    expect(judgeFix({ coords: CAIRO, city: 'Cairo' }, fix(CAIRO))).toBe('relabel');
    expect(judgeFix({ coords: CAIRO, city: UNKNOWN_PLACE }, fix(CAIRO))).toBe('relabel');
  });

  it('mends the placeholder of a failed geocode away from every listed city', () => {
    expect(judgeFix({ coords: WESTERN_DESERT, city: UNKNOWN_PLACE }, fix(WESTERN_DESERT))).toBe('relabel');
    expect(judgeFix({ coords: WESTERN_DESERT, city: null }, fix(WESTERN_DESERT))).toBe('relabel');
    expect(judgeFix({ coords: WESTERN_DESERT, city: 'الداخلة' }, fix(WESTERN_DESERT))).toBe('unmoved');
  });
});

describe('retryDelay', () => {
  it('backs off over five retries, then stops', () => {
    expect([1, 2, 3, 4, 5].map(retryDelay)).toEqual([30_000, 60_000, 120_000, 300_000, 300_000]);
    expect(retryDelay(6)).toBeNull();
    expect(retryDelay(50)).toBeNull();
  });
});
