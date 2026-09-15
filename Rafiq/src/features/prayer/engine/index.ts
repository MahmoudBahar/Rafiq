/**
 * Prayer-time engine: pure, React-free, deterministic for (config, date).
 * UI code imports from here and never from `adhan` directly.
 */
export { computeDay, computeMonth, computeRange, getTimes, nextPrayer, nextPrayerIn, timeFor } from './calculate';
export { CITIES, COUNTRY, DEFAULT_CITY, cityByName, distanceKm, nearestCity, type City, type NearCity } from './cities';
export { METHODS, METHOD_BY_ID, type MethodDef } from './methods';
export {
  PRAYERS,
  type Adjustments,
  type Coords,
  type DayRow,
  type DayTimes,
  type Madhab,
  type Method,
  type NextPrayer,
  type PrayerConfig,
  type PrayerDef,
  type PrayerKey,
  type PrayerTime,
} from './types';
