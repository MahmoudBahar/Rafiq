/**
 * Prayer-time engine: pure, React-free, deterministic for (config, date).
 * UI code imports from here and never from `adhan` directly.
 */
export { computeDay, computeMonth, computeRange, dayEvents, getTimes, nextEvent, nextEventIn, timeFor } from './calculate';
export {
  CITIES,
  COUNTRY,
  DEFAULT_CITY,
  UNKNOWN_PLACE,
  cityByName,
  distanceKm,
  hasMoved,
  judgeFix,
  nearestCity,
  retryDelay,
  type City,
  type Fix,
  type FixVerdict,
  type NearCity,
} from './cities';
export { METHODS, METHOD_BY_ID, type MethodDef } from './methods';
export {
  FARD_PRAYERS,
  PRAYERS,
  type Adjustments,
  type Coords,
  type DayRow,
  type DayTimes,
  type EventKind,
  type FardDef,
  type FardKey,
  type IqamaOffsets,
  type Madhab,
  type Method,
  type NextEvent,
  type PrayerConfig,
  type PrayerDef,
  type PrayerKey,
  type PrayerTime,
} from './types';
