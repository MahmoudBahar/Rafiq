import { blendHeadings, flatBlendWeight, normalizeDeg } from './smooth';
import { cross, dot, norm, scale, sub, unit, type Vec3 } from './vec';

const RAD = 180 / Math.PI;

/** The device's top edge: what the dial follows when the phone lies flat. */
export const AXIS_TOP: Vec3 = [0, 1, 0];
/** The back camera: what the camera page follows when the phone is held up. */
export const AXIS_CAMERA: Vec3 = [0, 0, -1];

/** No place on Earth has a field this weak (the minimum is ~22 µT): below it the sensor is dead or silent. */
export const MIN_FIELD_UT = 5;
/** Gravity never reads this small, in g (≈1) or m/s² (≈9.8): below it the gravity input is empty. */
export const MIN_DOWN = 0.1;
/**
 * The horizontal part of the field as a fraction of the whole; below this
 * (dip steeper than ~87°, the magnetic poles) a compass has nothing to point with.
 */
export const MIN_HORIZONTAL = 0.05;

/** The Earth's axes written in device coordinates, each of unit length. */
export interface EarthFrame {
  north: Vec3;
  east: Vec3;
  up: Vec3;
}

export interface Headings {
  /** Where the top of the phone points, magnetic, degrees clockwise from north. */
  flatHeading: number;
  /** Where the back camera points, magnetic. */
  cameraHeading: number;
  /** How far the top of the phone is raised above the horizontal: 0 flat, 90 upright. */
  pitch: number;
}

export interface FieldShape {
  magnitudeUt: number;
  /** The field's angle below the horizontal, degrees: ~45° in Cairo whatever the phone's posture. */
  dipDeg: number;
}

/**
 * The compass the way a compass app does it: north from the magnetometer,
 * tilt-corrected by where gravity points. Both vectors are in the device
 * frame; `down` is where gravity pulls (z < 0 face up, flat). Only directions
 * matter, so either input may be in any unit.
 *
 * Two known directions, down and north, fix the phone's whole orientation:
 * up = −down; north = the field with its vertical part removed; east = north × up
 * (right-handed: a phone whose top points north has east along its +X). Null
 * when either vector is empty or the field is vertical.
 */
export function earthFrame(mag: Vec3, down: Vec3): EarthFrame | null {
  if (norm(mag) < MIN_FIELD_UT || norm(down) < MIN_DOWN) return null;
  const up = unit(scale(down, -1));
  if (!up) return null;
  const horizontal = sub(mag, scale(up, dot(mag, up)));
  if (norm(horizontal) < MIN_HORIZONTAL * norm(mag)) return null;
  const north = unit(horizontal);
  if (!north) return null;
  return { north, east: cross(north, up), up };
}

/** Where a device axis points, magnetic, degrees clockwise from north. */
export function axisHeading(frame: EarthFrame, axis: Vec3): number {
  return normalizeDeg(Math.atan2(dot(frame.east, axis), dot(frame.north, axis)) * RAD);
}

/**
 * The two headings and the pitch. Raised past upright the top edge loses its
 * reach along the ground, and its heading hands over to the camera's, blended,
 * so there is no step.
 */
export function headingsFromFrame(frame: EarthFrame): Headings {
  const cameraHeading = axisHeading(frame, AXIS_CAMERA);
  const reach = Math.hypot(dot(frame.east, AXIS_TOP), dot(frame.north, AXIS_TOP));
  const flatHeading = blendHeadings(axisHeading(frame, AXIS_TOP), cameraHeading, flatBlendWeight(reach));
  const pitch = Math.asin(Math.max(-1, Math.min(1, dot(frame.up, AXIS_TOP)))) * RAD;
  return { flatHeading, cameraHeading, pitch };
}

/** The field's size and dip, as measured; null when either vector is empty. */
export function fieldShape(mag: Vec3, down: Vec3): FieldShape | null {
  const m = norm(mag);
  const d = norm(down);
  if (m < MIN_FIELD_UT || d < MIN_DOWN) return null;
  const dipDeg = Math.asin(Math.max(-1, Math.min(1, dot(mag, down) / (m * d)))) * RAD;
  return { magnitudeUt: m, dipDeg };
}
