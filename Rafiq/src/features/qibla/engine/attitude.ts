import { normalizeDeg } from './smooth';

/** DeviceMotion's `rotation`, radians. */
export interface Rotation {
  alpha: number;
  beta: number;
  gamma: number;
}

export type AttitudePlatform = 'ios' | 'android';

export interface Headings {
  /** Where the top of the phone points, magnetic, degrees clockwise from north. */
  flatHeading: number;
  /** Where the back camera points, magnetic. */
  cameraHeading: number;
  /** How far the top of the phone is raised above the horizontal: 0 flat, 90 upright. */
  pitch: number;
}

const RAD = 180 / Math.PI;
/** Below this much horizontal reach the top of the phone has no heading of its own. */
const FLAT_MIN_HORIZONTAL = 0.2;

/**
 * Brings a platform's rotation into the W3C deviceorientation convention the
 * maths below assumes: alpha counter-clockwise about Z from magnetic north
 * (0 = top of the phone to north), beta about X (90 = upright), gamma about Y.
 *
 * Android's expo-sensors already negates the azimuth and pitch it gets from
 * `SensorManager.getOrientation`, which lands on that convention. iOS reports
 * CoreMotion's attitude in the X-magnetic-north frame: yaw 0 means the
 * device's X axis (its right edge) points north, a quarter turn from alpha.
 * The gamma sign per platform is pinned by the device spike.
 */
export function toW3C(r: Rotation, platform: AttitudePlatform): Rotation {
  if (platform === 'ios') return { alpha: r.alpha + Math.PI / 2, beta: r.beta, gamma: r.gamma };
  return r;
}

/**
 * The two headings and the pitch from a W3C rotation. The full rotation matrix
 * R = Rz(alpha) · Rx(beta) · Ry(gamma) maps device axes into the earth frame
 * (x east, y north, z up); the device's +Y axis (its top) and −Z axis (its
 * back camera) are read off it. Going through the matrix, rather than the raw
 * alpha, keeps the answer continuous when the phone is raised upright, where
 * the Euler angles themselves swing about.
 */
export function headingsFromAttitude({ alpha, beta, gamma }: Rotation): Headings {
  const ca = Math.cos(alpha);
  const sa = Math.sin(alpha);
  const cb = Math.cos(beta);
  const sb = Math.sin(beta);
  const cg = Math.cos(gamma);
  const sg = Math.sin(gamma);

  // Columns of R: the device axes in the earth frame.
  const yAxis = { x: -sa * cb, y: ca * cb, z: sb };
  const zAxis = { x: ca * sg + sa * sb * cg, y: sa * sg - ca * sb * cg, z: cb * cg };

  const cameraHeading = headingOf(-zAxis.x, -zAxis.y);
  const reach = Math.hypot(yAxis.x, yAxis.y);
  const flatHeading = reach < FLAT_MIN_HORIZONTAL ? cameraHeading : headingOf(yAxis.x, yAxis.y);
  const pitch = Math.asin(Math.max(-1, Math.min(1, yAxis.z))) * RAD;
  return { flatHeading, cameraHeading, pitch };
}

function headingOf(east: number, north: number): number {
  return normalizeDeg(Math.atan2(east, north) * RAD);
}
