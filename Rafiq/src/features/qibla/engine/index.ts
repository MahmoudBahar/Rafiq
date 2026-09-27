/**
 * Qibla engine: pure functions, no React, no native modules. UI code imports
 * from here and never from `adhan` or `geomagnetism` directly.
 */
export { headingsFromAttitude, toW3C, type AttitudePlatform, type Headings, type Rotation } from './attitude';
export { LOCK_ENTER_DEG, LOCK_LEAVE_DEG, NEAR_DEG, bandFor, type Band } from './band';
export { KAABA, distanceToMeccaKm, qiblaBearing } from './bearing';
export {
  FIELD_MAX_UT,
  FIELD_MIN_UT,
  FIELD_PERSIST_MS,
  SETTLE_MS,
  confidence,
  createFieldWatch,
  type Confidence,
  type ConfidenceInput,
  type FieldWatch,
} from './confidence';
export { declinationFromHeading, declinationFromModel, magneticToTrue } from './declination';
export {
  createStillness,
  normalizeDeg,
  shortestDelta,
  unwrap,
  type Stillness,
  type StillnessOptions,
  type StillnessReading,
} from './smooth';
export type { Coords } from './types';
