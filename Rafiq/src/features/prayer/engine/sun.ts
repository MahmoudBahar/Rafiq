import { apparentEquatorial } from 'astronomia/solar';
import { altitude, D2R, julianDay } from './astro';
import type { Coords } from './types';

/** Geometric altitude of the Sun's centre in degrees (negative below the horizon). */
export function sunAltitude(coords: Coords, now: Date): number {
  const { jd, jde } = julianDay(now.getTime());
  const { ra, dec } = apparentEquatorial(jde);
  return altitude(coords, jd, ra, dec) / D2R;
}
