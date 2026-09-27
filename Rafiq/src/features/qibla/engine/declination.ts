import { model } from 'geomagnetism';
import { normalizeDeg, shortestDelta } from './smooth';
import type { Coords } from './types';

/**
 * Declination as the platform sees it: its true heading less its magnetic
 * one. Null when it reports no true heading (-1: Android before a location
 * fix, or with location denied).
 */
export function declinationFromHeading(trueHeading: number, magHeading: number): number | null {
  if (trueHeading < 0) return null;
  return shortestDelta(trueHeading, magHeading);
}

/** Declination from the World Magnetic Model (east positive); falls back to the nearest model outside its years. */
export function declinationFromModel(coords: Coords, date: Date): number {
  return model(date, { allowOutOfBoundsModel: true }).point([coords.latitude, coords.longitude]).decl;
}

/** What the Earth's field should measure here: total strength (µT) and dip below the horizontal. */
export function expectedField(coords: Coords, date: Date): { magnitudeUt: number; dipDeg: number } {
  const p = model(date, { allowOutOfBoundsModel: true }).point([coords.latitude, coords.longitude]);
  return { magnitudeUt: p.f / 1000, dipDeg: p.incl };
}

export function magneticToTrue(magHeading: number, declination: number): number {
  return normalizeDeg(magHeading + declination);
}
