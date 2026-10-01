import { DEG, RAD, clamp, normalizeDeg, wrap180 } from './angles';
import { qRotate, type Quat, type Vec3 } from './vec';

/** Which way the phone is "pointing": its top edge (the dial, held flat) or its back camera (held up). */
export type HeadingMode = 'flat' | 'camera';

const TOP: Vec3 = [0, 1, 0];
const CAMERA: Vec3 = [0, 0, -1];

/**
 * An axis's azimuth is unstable as the axis nears the vertical: a tilt error
 * ε moves it by about ε/ρ, where ρ is the axis's horizontal reach. Below
 * sin 10° (within 10° of vertical) the other axis takes over; above sin 20°
 * the axis stands on its own; between them the two are blended, so raising
 * or lowering the phone has no step.
 */
export const HANDOVER_LOW = Math.sin(10 * DEG);
export const HANDOVER_HIGH = Math.sin(20 * DEG);

export interface Pose {
  /** Azimuth of the top edge in the world frame, degrees clockwise, handed over to the camera near vertical. */
  flat: number;
  /** Azimuth of the back camera, handed over to the top edge near vertical (phone flat). */
  camera: number;
  /** How far the top edge is raised above the horizontal: 0 flat, 90 upright, negative tipped toward the user. */
  pitch: number;
}

/** Azimuth (clockwise from the frame's +y) and horizontal reach of a world vector. */
function azimuth(v: Vec3): { az: number; reach: number } {
  return { az: normalizeDeg(Math.atan2(v[0], v[1]) * RAD), reach: Math.hypot(v[0], v[1]) };
}

function handover(primary: { az: number; reach: number }, other: { az: number }): number {
  const w = clamp((primary.reach - HANDOVER_LOW) / (HANDOVER_HIGH - HANDOVER_LOW), 0, 1);
  return normalizeDeg(other.az + w * wrap180(primary.az, other.az));
}

/**
 * Where the phone points, from a device→world quaternion. No Euler angles:
 * the axes are rotated into the world and read off directly, so nothing is
 * singular upright or face down.
 */
export function poseOf(q: Quat): Pose {
  const top = qRotate(q, TOP);
  const cam = qRotate(q, CAMERA);
  const t = azimuth(top);
  const c = azimuth(cam);
  return {
    flat: handover(t, c),
    camera: handover(c, t),
    pitch: Math.asin(clamp(top[2], -1, 1)) * RAD,
  };
}
