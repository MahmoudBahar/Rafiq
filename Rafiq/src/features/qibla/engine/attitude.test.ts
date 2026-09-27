import { describe, expect, it } from 'vitest';
import { headingsFromAttitude, toW3C } from './attitude';

const D = Math.PI / 180;
// Angles here follow the W3C deviceorientation convention (radians): alpha
// counter-clockwise about Z from magnetic north, beta about X (90 = upright),
// gamma about Y (right side down positive).
const w3c = (a: number, b: number, g: number) => ({ alpha: a * D, beta: b * D, gamma: g * D });

describe('headingsFromAttitude', () => {
  it('flat, top pointing north', () => {
    const h = headingsFromAttitude(w3c(0, 0, 0));
    expect(h.flatHeading).toBeCloseTo(0, 4);
    expect(h.pitch).toBeCloseTo(0, 4);
  });
  it('flat, turned clockwise to face east', () => {
    expect(headingsFromAttitude(w3c(-90, 0, 0)).flatHeading).toBeCloseTo(90, 4);
    expect(headingsFromAttitude(w3c(270, 0, 0)).flatHeading).toBeCloseTo(90, 4);
  });
  it('flat, facing south-east', () => {
    expect(headingsFromAttitude(w3c(-136, 0, 0)).flatHeading).toBeCloseTo(136, 4);
  });
  it('upright, back camera facing north', () => {
    const h = headingsFromAttitude(w3c(0, 90, 0));
    expect(h.cameraHeading).toBeCloseTo(0, 4);
    expect(h.pitch).toBeCloseTo(90, 4);
  });
  it('upright, back camera facing east', () => {
    expect(headingsFromAttitude(w3c(-90, 90, 0)).cameraHeading).toBeCloseTo(90, 4);
  });
  it('half raised, both headings agree', () => {
    const h = headingsFromAttitude(w3c(-136, 45, 0));
    expect(h.flatHeading).toBeCloseTo(136, 3);
    expect(h.cameraHeading).toBeCloseTo(136, 3);
    expect(h.pitch).toBeCloseTo(45, 3);
  });
  it('a slight roll does not move the flat heading', () => {
    expect(headingsFromAttitude(w3c(-136, 0, 10)).flatHeading).toBeCloseTo(136, 2);
  });
  it('falls back to the camera heading when the top points straight up', () => {
    expect(headingsFromAttitude(w3c(-136, 90, 0)).flatHeading).toBeCloseTo(136, 3);
  });
});

describe('toW3C', () => {
  it('passes Android rotation through unchanged', () => {
    const r = toW3C({ alpha: 1, beta: 0.5, gamma: 0.1 }, 'android');
    expect(r).toEqual({ alpha: 1, beta: 0.5, gamma: 0.1 });
  });
  it('turns iOS yaw (X axis to magnetic north) into alpha (Y axis to magnetic north)', () => {
    // Yaw 0: the device X axis points north, so its top points west, alpha 90.
    const r = toW3C({ alpha: 0, beta: 0, gamma: 0 }, 'ios');
    expect(headingsFromAttitude(r).flatHeading).toBeCloseTo(270, 4);
    // Yaw -90: X east, top north.
    expect(headingsFromAttitude(toW3C({ alpha: -90 * D, beta: 0, gamma: 0 }, 'ios')).flatHeading).toBeCloseTo(0, 4);
  });
});
