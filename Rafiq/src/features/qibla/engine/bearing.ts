import { Coordinates, Qibla } from 'adhan';
import { distanceKm } from '@/features/prayer/engine/cities';
import { normalizeDeg } from './smooth';
import type { Coords } from './types';

/** The Kaaba (WGS84). */
export const KAABA: Coords = { latitude: 21.4225241, longitude: 39.8261818 };

/**
 * Initial great-circle bearing from `coords` to the Kaaba, degrees clockwise
 * from true north in [0, 360). Never a rhumb line: over long distances the two
 * differ by tens of degrees.
 */
export function qiblaBearing(coords: Coords): number {
  return normalizeDeg(Qibla(new Coordinates(coords.latitude, coords.longitude)));
}

export function distanceToMeccaKm(coords: Coords): number {
  return distanceKm(coords, KAABA);
}
