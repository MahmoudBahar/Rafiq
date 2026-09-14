import type { Coords } from './types';

export interface City extends Coords {
  name: string;
}

export const CITIES: readonly City[] = [
  { name: 'القاهرة', latitude: 30.0444, longitude: 31.2357 },
  { name: 'الإسكندرية', latitude: 31.2001, longitude: 29.9187 },
  { name: 'الجيزة', latitude: 30.0131, longitude: 31.2089 },
  { name: 'المنصورة', latitude: 31.0409, longitude: 31.3785 },
  { name: 'طنطا', latitude: 30.7865, longitude: 31.0004 },
  { name: 'أسوان', latitude: 24.0889, longitude: 32.8998 },
];

export const DEFAULT_CITY = CITIES[0].name;
export const COUNTRY = 'مصر';

/** Falls back to the default city so the engine always has coordinates. */
export function cityByName(name: string | null): City {
  return CITIES.find((c) => c.name === name) ?? CITIES[0];
}

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export function distanceKm(a: Coords, b: Coords): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Closest known city within `maxKm`, or null. */
export function nearestCity(coords: Coords, maxKm = 80): City | null {
  let best: City | null = null;
  let bestKm = maxKm;
  for (const city of CITIES) {
    const km = distanceKm(coords, city);
    if (km <= bestKm) {
      best = city;
      bestKm = km;
    }
  }
  return best;
}
