import { NativeModule, requireOptionalNativeModule } from 'expo';

/**
 * One batch of samples, about once a frame. Each array is flat
 * `[t, x, y, z]` quadruples; `t` is seconds on the sensor clock (Android
 * `elapsedRealtimeNanos`, iOS time since boot), shared by all three streams.
 * Device frame: X to the right edge, Y to the top edge, Z out of the screen.
 */
export interface RafiqMotionBatch {
  /** Earth-up (the platform's fused gravity, pointing up), any length. */
  up: number[];
  /** Angular rate, rad/s, right-handed. */
  gyro: number[];
  /** Calibrated magnetic field, µT. */
  mag: number[];
  /** Magnetometer calibration 0 (unreliable) … 3 (high); -1 unknown. */
  magAccuracy: number;
  /** Bumps when the platform re-estimates the magnetometer's bias (Android only). */
  biasEpoch: number;
  /** Samples dropped because the queue held more than a second. */
  dropped: number;
}

export interface RafiqMotionAvailability {
  gyro: boolean;
  up: boolean;
  /** The up stream is the raw accelerometer, hand acceleration included (no fused gravity on this phone). */
  upIsAccelerometer: boolean;
  magnetometer: boolean;
  /** Informational: whether the platform's magnetometer accuracy is believed on its own. The engine judges it the same way on both platforms. */
  trustAccuracy: boolean;
}

type RafiqMotionEvents = {
  batch: (batch: RafiqMotionBatch) => void;
};

declare class RafiqMotionModule extends NativeModule<RafiqMotionEvents> {
  getAvailability(): RafiqMotionAvailability;
  start(): void;
  stop(): void;
}

/** The native module, or null where it is not built in (web, Expo Go). */
export default requireOptionalNativeModule<RafiqMotionModule>('RafiqMotion');
