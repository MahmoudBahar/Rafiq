/**
 * Qibla engine: pure functions, no React, no native modules. The hook feeds
 * it the native sensor batches; UI code imports from here and never from
 * `geomagnetism` directly.
 */
export { normalizeDeg, unwrap, wrap180 } from './angles';
export { LOCK_ENTER_DEG, LOCK_LEAVE_DEG, NEAR_DEG, bandFor, type Band } from './band';
export { foldConfidence, type Confidence } from './confidence';
export {
  createQiblaEngine,
  type EngineDebug,
  type EngineOutput,
  type EngineSensors,
  type QiblaEngine,
} from './engine';
export { KAABA, geodesic, qiblaBearing, type QiblaBearing } from './geodesy';
export { earthField, type EarthField } from './geomag';
export { type HeadingMode } from './pose';
export { type MotionBatch } from './stream';
export type { Coords } from './types';
