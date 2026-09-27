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
  SETTLE_MS,
  confidence,
  type Confidence,
  type ConfidenceInput,
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
