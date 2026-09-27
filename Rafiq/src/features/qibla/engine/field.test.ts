import { describe, expect, it } from 'vitest';
import { dipDeg, headingsFromField } from './field';

// Device frame: X right, Y up the screen (the top), Z out of the screen.
// `down` is where gravity points, as expo's accelerationIncludingGravity
// reports it on Android (z ≈ -9.8 with the phone flat, face up). In Cairo the
// field points north and 45° down: flat and facing north it reads (0, +H, -V).
const H = 31;
const V = 31;
const FLAT_DOWN = [0, 0, -9.8] as const;

describe('headingsFromField', () => {
  it('flat, top pointing north', () => {
    const h = headingsFromField([0, H, -V], FLAT_DOWN);
    expect(h.flatHeading).toBeCloseTo(0, 4);
    expect(h.pitch).toBeCloseTo(0, 4);
  });
  it('flat, top pointing east: north is off the left edge', () => {
    // Turned clockwise to face east, magnetic north is to the phone's left (-X).
    expect(headingsFromField([-H, 0, -V], FLAT_DOWN).flatHeading).toBeCloseTo(90, 4);
  });
  it('flat, top pointing south', () => {
    expect(headingsFromField([0, -H, -V], FLAT_DOWN).flatHeading).toBeCloseTo(180, 4);
  });
  it('flat, facing south-east (136°)', () => {
    const a = (136 * Math.PI) / 180;
    // North in device coords when the top points at bearing a: (-sin a, cos a) · H
    expect(headingsFromField([-H * Math.sin(a), H * Math.cos(a), -V], FLAT_DOWN).flatHeading).toBeCloseTo(136, 3);
  });
  it('upright, back camera facing north', () => {
    // Top points up: down is -Y. North is straight through the back (-Z), the
    // field's vertical part now runs along -Y.
    const h = headingsFromField([0, -V, -H], [0, -9.8, 0]);
    expect(h.cameraHeading).toBeCloseTo(0, 4);
    expect(h.pitch).toBeCloseTo(90, 4);
  });
  it('upright, back camera facing east', () => {
    // Facing east, north is to the left (-X).
    expect(headingsFromField([-H, -V, 0], [0, -9.8, 0]).cameraHeading).toBeCloseTo(90, 4);
  });
  it('half raised, both headings agree', () => {
    // Top raised 45° while facing north: rotate the flat-north field about X by 45°.
    const c = Math.cos(Math.PI / 4);
    const h = headingsFromField([0, H * c - V * c, -(H * c + V * c)], [0, -9.8 * c, -9.8 * c]);
    expect(h.flatHeading).toBeCloseTo(0, 3);
    expect(h.cameraHeading).toBeCloseTo(0, 3);
    expect(h.pitch).toBeCloseTo(45, 3);
  });
  it('is unaffected by the field strength', () => {
    const a = headingsFromField([-H, 0, -V], FLAT_DOWN).flatHeading;
    const b = headingsFromField([-2 * H, 0, -2 * V], FLAT_DOWN).flatHeading;
    expect(a).toBeCloseTo(b, 6);
  });
  it('recorded sample: flat on the desk reading 46–50° magnetic (shadow spot)', () => {
    // From the 2026-09-27 session: calibrated field (-20.6, 18.4, -30.0), phone flat;
    // the platform compass read 48° and the tilt-corrected field 46–50° over the window.
    const h = headingsFromField([-20.6, 18.4, -30.0], [0.1, 0.2, -9.8]).flatHeading;
    expect(h).toBeGreaterThan(46);
    expect(h).toBeLessThan(51);
  });
});

describe('dipDeg', () => {
  it('is the angle of the field below the horizontal', () => {
    expect(dipDeg([0, H, -V], FLAT_DOWN)).toBeCloseTo(45, 4);
    expect(dipDeg([0, H, 0], FLAT_DOWN)).toBeCloseTo(0, 4);
    expect(dipDeg([0, 0, -V], FLAT_DOWN)).toBeCloseTo(90, 4);
  });
  it('does not depend on how the phone is held', () => {
    expect(dipDeg([0, -V, -H], [0, -9.8, 0])).toBeCloseTo(45, 4);
  });
});
