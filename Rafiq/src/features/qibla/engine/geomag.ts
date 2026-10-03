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

/** A date inside WMM2025 (valid Nov 2024 – Nov 2029): its model's own bounds are read from it. */
const LATEST_MODEL_DATE = new Date(Date.UTC(2025, 6, 1));
/** A date inside the oldest model the package carries (WMM2015). */
const EARLIEST_MODEL_DATE = new Date(Date.UTC(2015, 6, 1));
const DAY_MS = 86400000;

/**
 * The WMM field at `coords` (sea level) on `date`. Altitude changes the field
 * by about 0.05 % per km: nothing a phone can see.
 *
 * Outside the models' years (a phone with a wrong clock, or after Nov 2029)
 * the date is clamped into the nearest model's validity and the result is
 * flagged `outOfModel`; the declination drifts by a fraction of a degree a
 * year in most places, so the nearest model is still a fair answer. The
 * package's own out-of-bounds option is not used: it reports through
 * `console.error`, a red error in development builds.
 */
export function earthField(coords: Coords, date: Date): EarthField {
  let outOfModel = false;
  let m;
  try {
    m = model(date);
  } catch {
    outOfModel = true;
    const latest = model(LATEST_MODEL_DATE);
    const clamped =
      date.getTime() > latest.end_date.getTime()
        ? new Date(latest.end_date.getTime() - DAY_MS)
        : new Date(Math.max(date.getTime(), model(EARLIEST_MODEL_DATE).start_date.getTime() + DAY_MS));
    m = model(clamped);
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
