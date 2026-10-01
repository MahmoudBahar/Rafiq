import { normalizeDeg } from './smooth';
import { add, scale, sub, type Vec3 } from './vec';

/**
 * Where each platform's numbers differ, pinned from expo-sensors' native code
 * (expo-sensors 57: DeviceMotionModule.kt / .swift, AccelerometerModule.*):
 *
 * - DeviceMotion `accelerationIncludingGravity` − `acceleration` is the gravity
 *   vector pointing DOWN on both platforms (Android emits accelerometer − 2·gravity
 *   and linear acceleration; iOS emits (user + gravity)·G and user·G). Face up, z ≈ −9.81.
 * - DeviceMotion `rotationRate` is in deg/s on both, but Android's alpha/beta/gamma
 *   are the rates about X/Y/Z while iOS's are about Z/Y/X.
 * - The plain Accelerometer reports g on both, but Android's vector points UP
 *   (face up, z = +1: the reaction force) and iOS's points DOWN (z = −1).
 * - DeviceMotion `rotation.alpha` (radians) is −azimuth of the top edge on Android;
 *   on iOS it is the yaw in CoreMotion's x-magnetic-north frame, where yaw 0 has
 *   the device's +X (right edge) on north, so the top edge is at 270° − yaw.
 * - DeviceMotion `interval` is milliseconds on Android and seconds on iOS, so
 *   it is never used: every sample carries a `timestamp` in seconds.
 */
export type SensorPlatform = 'ios' | 'android';

export interface RotationRate {
  alpha: number;
  beta: number;
  gamma: number;
}

/** Gravity (pointing down, device frame) from one DeviceMotion sample. Exact on both platforms. */
export function gravityFromMotion(includingGravity: Vec3, linear: Vec3): Vec3 {
  return sub(includingGravity, linear);
}

/** Gravity pointing down from the plain Accelerometer, which signs it differently per platform. */
export function downFromAccelerometer(acceleration: Vec3, platform: SensorPlatform): Vec3 {
  return platform === 'android' ? scale(acceleration, -1) : acceleration;
}

/** The angular velocity as a device-frame vector [about X, about Y, about Z], deg/s, right-handed. */
export function gyroVector(rate: RotationRate, platform: SensorPlatform): Vec3 {
  return platform === 'android' ? [rate.alpha, rate.beta, rate.gamma] : [rate.gamma, rate.beta, rate.alpha];
}

/**
 * The platform's own fused heading of the top edge, magnetic, from
 * DeviceMotion's `rotation.alpha` (radians). Meaningful for a flat phone only:
 * a tilted phone's Euler yaw is not its top edge's heading. A cross-check for
 * the development readout, never the compass.
 */
export function attitudeHeading(alphaRad: number, platform: SensorPlatform): number {
  const deg = alphaRad * (180 / Math.PI);
  return normalizeDeg(platform === 'android' ? -deg : 270 - deg);
}

/** Hand jitter is faster than ~3 Hz and gone at this; a deliberate tilt over a second is followed. */
export const ACCEL_LOWPASS_TAU_S = 0.3;

export interface LowPass {
  /** Feed a sample with its time in seconds; returns the smoothed vector. */
  push(v: Vec3, tS: number): Vec3;
  reset(): void;
}

/** A first-order low-pass with the time constant `tauS`, for the accelerometer when there is no fused gravity. */
export function createLowPass(tauS: number): LowPass {
  let state: Vec3 | null = null;
  let last = 0;
  return {
    push(v, tS) {
      if (state === null || tS - last > tauS * 10) {
        state = v;
      } else {
        const dt = Math.max(0, tS - last);
        const k = Math.min(1, dt / tauS);
        state = add(state, scale(sub(v, state), k));
      }
      last = tS;
      return state;
    },
    reset() {
      state = null;
    },
  };
}
