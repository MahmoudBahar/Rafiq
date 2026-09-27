/**
 * Qibla engine: pure functions, no React, no native modules. UI code imports
 * from here and never from `adhan` or `geomagnetism` directly.
 */
export { headingsFromAttitude, toW3C, type AttitudePlatform, type Headings, type Rotation } from './attitude';
export { LOCK_ENTER_DEG, LOCK_LEAVE_DEG, NEAR_DEG, bandFor, type Band } from './band';
export { KAABA, distanceToMeccaKm, qiblaBearing } from './bearing';
export {
  FIELD_DIP_TOLERANCE_DEG,
  FIELD_MAGNITUDE_TOLERANCE,
  FIELD_PERSIST_MS,
  SETTLE_MS,
  confidence,
  createFieldWatch,
  type Confidence,
  type ConfidenceInput,
  type FieldShape,
  type FieldWatch,
} from './confidence';
export { declinationFromHeading, declinationFromModel, expectedField, magneticToTrue } from './declination';
export { dipDeg, headingsFromField, type Vec3 } from './field';
export { FUSE_GAIN, RESET_STEP_DEG, createHeadingFuser, type HeadingFuser } from './fuse';
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
