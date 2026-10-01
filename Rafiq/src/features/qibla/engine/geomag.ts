import { model } from 'geomagnetism';
import type { Coords } from './types';

/** Below this horizontal field (µT) the WMM report calls a compass unusable: its "blackout zone". */
export const BLACKOUT_H_UT = 2;
/** Below this the WMM report advises caution: the horizontal field is weak and easily bent. */
export const CAUTION_H_UT = 6;

export type FieldZone = 'normal' | 'caution' | 'blackout';

/** What the Earth's field should be here, from the World Magnetic Model. */
export interface EarthField {
  /** Magnetic declination: true north minus magnetic north, degrees, east positive. */
  declination: number;
  /** Total intensity, µT. */
  totalUt: number;
  /** Horizontal intensity, µT: what a compass actually points with. */
  horizontalUt: number;
  /** Inclination (dip) below the horizontal, degrees: positive in the northern magnetic hemisphere. */
  dipDeg: number;
  zone: FieldZone;
  /** The date lies outside the model's validity (WMM2025: Nov 2024 – Nov 2029); the nearest model stands in. */
  outOfModel: boolean;
}

/**
 * The WMM2025 field at `coords` (sea level) on `date`. Altitude changes the
 * field by about 0.05 % per km: nothing a phone can see. Outside the model's
 * years the nearest model is used and flagged; the secular drift of the
 * declination is a fraction of a degree per year in most places.
 */
export function earthField(coords: Coords, date: Date): EarthField {
  let outOfModel = false;
  let m;
  try {
    m = model(date);
  } catch {
    outOfModel = true;
    m = model(date, { allowOutOfBoundsModel: true });
  }
  const p = m.point([coords.latitude, coords.longitude]);
  const horizontalUt = p.h / 1000;
  return {
    declination: p.decl,
    totalUt: p.f / 1000,
    horizontalUt,
    dipDeg: p.incl,
    zone: horizontalUt < BLACKOUT_H_UT ? 'blackout' : horizontalUt < CAUTION_H_UT ? 'caution' : 'normal',
    outOfModel,
  };
}
