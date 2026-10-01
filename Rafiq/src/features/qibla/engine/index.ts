/**
 * Qibla engine: pure functions, no React, no native modules. UI code imports
 * from here and never from `adhan` or `geomagnetism` directly.
 */
export { LOCK_ENTER_DEG, LOCK_LEAVE_DEG, NEAR_DEG, bandFor, type Band } from './band';
export { KAABA, distanceToMeccaKm, qiblaBearing } from './bearing';
export { SETTLE_S, confidence, type Confidence, type ConfidenceInput } from './confidence';
export {
  ACCEL_LOWPASS_TAU_S,
  attitudeHeading,
  createLowPass,
  downFromAccelerometer,
  gravityFromMotion,
  gyroVector,
  type LowPass,
  type RotationRate,
  type SensorPlatform,
} from './conventions';
export { declinationFromHeading, declinationFromModel, expectedField, magneticToTrue } from './declination';
export {
  AXIS_CAMERA,
  AXIS_TOP,
  MIN_DOWN,
  MIN_FIELD_UT,
  MIN_HORIZONTAL,
  axisHeading,
  earthFrame,
  fieldShape,
  headingsFromFrame,
  type EarthFrame,
  type FieldShape,
  type Headings,
} from './field';
export { FILTER_TAU_S, GAP_RESET_S, MAX_DT_S, createFieldFilter, type FieldFilter } from './fieldFilter';
export {
  DIP_CLEAR_DEG,
  DIP_ENTER_DEG,
  DISAGREE_DEG,
  DISAGREE_MAX_RATE_DEG_S,
  DISAGREE_PERSIST_S,
  DISAGREE_TAU_S,
  FIELD_CLEAR_HIGH,
  FIELD_CLEAR_LOW,
  FIELD_CLEAR_S,
  FIELD_ENTER_HIGH,
  FIELD_ENTER_LOW,
  FIELD_ENTER_S,
  STILL_HOLD_S,
  STILL_RATE_DEG_S,
  createDisagreementWatch,
  createFieldWatch,
  createGyroStillness,
  createHeadingStillness,
  type DisagreementWatch,
  type FieldWatch,
  type GyroStillness,
  type HeadingStillness,
  type StillReading,
} from './health';
export { FLAT_BLEND_HIGH, FLAT_BLEND_LOW, blendHeadings, flatBlendWeight, normalizeDeg, shortestDelta, unwrap } from './smooth';
export type { Coords } from './types';
export { EPS, add, cross, dot, norm, rotate, scale, sub, unit, type Vec3 } from './vec';
