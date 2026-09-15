import { sincos } from 'astronomia/base';
import { deltaT } from 'astronomia/deltat';
import { Calendar } from 'astronomia/julian';
import { apparent as siderealApparent } from 'astronomia/sidereal';
import type { Coords } from './types';

/** Shared astronomia helpers (React-free). Longitudes here are east-positive. */

export const D2R = Math.PI / 180;
export const TWO_PI = 2 * Math.PI;

export interface JulianDay {
  /** Julian day (UT). */
  jd: number;
  /** Julian ephemeris day (TT). */
  jde: number;
  /** ΔT in seconds. */
  dT: number;
}

export function julianDay(ms: number): JulianDay {
  const cal = new Calendar().fromDate(new Date(ms));
  const jd = cal.toJD();
  const dT = deltaT(cal.toYear());
  return { jd, jde: jd + dT / 86_400, dT };
}

/** Geometric altitude (radians, no refraction) of a body at `ra`/`dec` for an observer at `jd`. */
export function altitude(coords: Coords, jd: number, ra: number, dec: number): number {
  const theta = (siderealApparent(jd) / 86_400) * TWO_PI; // Greenwich apparent sidereal time
  const hourAngle = theta + coords.longitude * D2R - ra;
  const [sLat, cLat] = sincos(coords.latitude * D2R);
  const [sDec, cDec] = sincos(dec);
  return Math.asin(sLat * sDec + cLat * cDec * Math.cos(hourAngle));
}
