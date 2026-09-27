import type { Headings } from './attitude';
import { normalizeDeg } from './smooth';

export type Vec3 = readonly number[];

const RAD = 180 / Math.PI;
/** Below this much horizontal reach the top of the phone has no heading of its own. */
const FLAT_MIN_HORIZONTAL = 0.2;
const EPS = 1e-9;

/**
 * The compass the way a compass app does it: north from the magnetometer,
 * tilt-corrected by where gravity points. Both vectors are in the device
 * frame (X right, Y up the screen, Z out of the screen); `down` is where
 * gravity points, as expo's accelerationIncludingGravity reports it on
 * Android (z ≈ -9.8 face up, flat).
 *
 * Two known directions, down and north, fix the phone's whole orientation:
 * from them the earth-frame axes east / north / up are written in device
 * coordinates, and any device axis can be asked where it points: the top
 * (the dial, held flat) or the back camera (held up). The fused rotation
 * sensor is not consulted for north at all: on a Samsung it sat 145° off for
 * a minute on a still desk while its accuracy read 3.
 */
export function headingsFromField(mag: Vec3, down: Vec3): Headings {
  const up = unit([-down[0], -down[1], -down[2]]);
  // Horizontal part of the field: what is left after removing its vertical component.
  const vertical = dot(mag, up);
  const north = unit([mag[0] - vertical * up[0], mag[1] - vertical * up[1], mag[2] - vertical * up[2]]);
  const east = cross(north, up);

  // Each earth axis, expressed in device coordinates, gives that axis's
  // component of every device axis: device +Y is (east.y, north.y, up.y).
  const cameraHeading = headingOf(-east[2], -north[2]);
  const reach = Math.hypot(east[1], north[1]);
  const flatHeading = reach < FLAT_MIN_HORIZONTAL ? cameraHeading : headingOf(east[1], north[1]);
  const pitch = Math.asin(Math.max(-1, Math.min(1, up[1]))) * RAD;
  return { flatHeading, cameraHeading, pitch };
}

/** The field's angle below the horizontal, degrees: ~45° in Cairo whatever the phone's posture. */
export function dipDeg(mag: Vec3, down: Vec3): number {
  const m = Math.hypot(mag[0], mag[1], mag[2]);
  const d = Math.hypot(down[0], down[1], down[2]);
  if (m < EPS || d < EPS) return 0;
  return Math.asin(Math.max(-1, Math.min(1, dot(mag, down) / (m * d)))) * RAD;
}

function headingOf(east: number, north: number): number {
  return normalizeDeg(Math.atan2(east, north) * RAD);
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function unit(v: Vec3): [number, number, number] {
  const n = Math.hypot(v[0], v[1], v[2]);
  return n < EPS ? [0, 0, 0] : [v[0] / n, v[1] / n, v[2] / n];
}
