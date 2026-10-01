import { normalizeDeg } from '../smooth';
import { rotate, scale, unit, type Vec3 } from '../vec';

/**
 * Synthetic physics for the tests: what the magnetometer and gravity read in
 * the device frame when the phone is held at a known heading, pitch and roll
 * in a known field. The engine must recover the heading from these alone.
 */

/** Cairo per the WMM2025 on 2026-10-01 (computed with the installed `geomagnetism`). */
export const CAIRO = { F: 44.03, I: 44.98, decl: 4.77 };
export const G = 9.81;

export interface Posture {
  /** Where the top edge points, degrees clockwise from magnetic north. */
  headingDeg: number;
  /** The top edge raised above the horizontal; 90 = upright. Default 0. */
  pitchDeg?: number;
  /** The right edge lowered below the left; 180 = face down. Default 0. */
  rollDeg?: number;
}

export interface Field {
  F: number;
  I: number;
}

const D = Math.PI / 180;

/**
 * Device axes in the earth frame (east, north, up) for the posture, as the
 * columns of R = Rz(−heading) · Rx(pitch) · Ry(roll): yaw about up first (a
 * clockwise heading is a negative right-handed turn), then raise the top edge
 * about the device's X, then roll about its Y.
 */
function deviceAxes({ headingDeg, pitchDeg = 0, rollDeg = 0 }: Posture): [Vec3, Vec3, Vec3] {
  const up: Vec3 = [0, 0, 1];
  let x: Vec3 = [1, 0, 0];
  let y: Vec3 = [0, 1, 0];
  let z: Vec3 = [0, 0, 1];
  // Intrinsic rotations: each about the device axis as it stands after the previous ones.
  [y, z] = [rotate(y, x, pitchDeg * D), rotate(z, x, pitchDeg * D)];
  [x, z] = [rotate(x, y, rollDeg * D), rotate(z, y, rollDeg * D)];
  const yaw = (v: Vec3) => rotate(v, up, -headingDeg * D);
  return [yaw(x), yaw(y), yaw(z)];
}

/** An earth-frame vector seen from the device. */
function toDevice(earth: Vec3, axes: [Vec3, Vec3, Vec3]): Vec3 {
  const [x, y, z] = axes;
  const d = (a: Vec3) => a[0] * earth[0] + a[1] * earth[1] + a[2] * earth[2];
  return [d(x), d(y), d(z)];
}

/** The field (µT) and gravity (m/s², pointing down) in the device frame. */
export function deviceVectors(posture: Posture, field: Field = CAIRO): { mag: Vec3; down: Vec3 } {
  const axes = deviceAxes(posture);
  const magEarth: Vec3 = [0, field.F * Math.cos(field.I * D), -field.F * Math.sin(field.I * D)];
  return { mag: toDevice(magEarth, axes), down: toDevice([0, 0, -G], axes) };
}

/** Where the back camera points for the posture, degrees clockwise from north. */
export function expectedCameraHeading({ headingDeg, pitchDeg = 0, rollDeg = 0 }: Posture): number {
  // −Z in the yaw-free frame: (−sin roll, sin pitch · cos roll, …); then the yaw.
  return normalizeDeg(headingDeg + Math.atan2(-Math.sin(rollDeg * D), Math.sin(pitchDeg * D) * Math.cos(rollDeg * D)) / D);
}

/**
 * The phone turns by `deltaDeg` counter-clockwise seen from above (a positive
 * rate about up): every earth vector turns the other way in the device frame.
 */
export function turnAboutUp(v: Vec3, down: Vec3, deltaDeg: number): Vec3 {
  const up = unit(scale(down, -1));
  if (!up) throw new Error('no gravity');
  return rotate(v, up, -deltaDeg * D);
}

/** The gyroscope reading, deg/s, for a turn about up at `rateDegS` (positive = counter-clockwise from above). */
export function omegaAboutUp(down: Vec3, rateDegS: number): Vec3 {
  const up = unit(scale(down, -1));
  if (!up) throw new Error('no gravity');
  return scale(up, rateDegS);
}
