import { describe, expect, it } from 'vitest';
import { AXIS_CAMERA, AXIS_TOP, axisHeading, earthFrame, fieldShape, headingsFromFrame } from './field';
import { shortestDelta } from './smooth';
import { CAIRO, deviceVectors, expectedCameraHeading, type Posture } from './testing/synthetic';

const HEADINGS = [0, 90, 136.14, 180, 270, 359.5];

const frameFor = (p: Posture) => {
  const { mag, down } = deviceVectors(p);
  const f = earthFrame(mag, down);
  if (!f) throw new Error('degenerate frame');
  return f;
};

describe('earthFrame + headingsFromFrame on synthetic postures', () => {
  const postures: { name: string; p: Omit<Posture, 'headingDeg'>; camera: boolean }[] = [
    { name: 'flat', p: {}, camera: false },
    { name: 'raised 45°', p: { pitchDeg: 45 }, camera: true },
    { name: 'top lowered 30°', p: { pitchDeg: -30 }, camera: true },
    { name: 'landscape, right edge down', p: { rollDeg: 90 }, camera: true },
    { name: 'landscape, left edge down', p: { rollDeg: -90 }, camera: true },
    { name: 'face down', p: { rollDeg: 180 }, camera: false },
    { name: 'raised 45° and rolled 20°', p: { pitchDeg: 45, rollDeg: 20 }, camera: true },
    { name: 'raised 60° and rolled -35°', p: { pitchDeg: 60, rollDeg: -35 }, camera: true },
  ];

  for (const { name, p, camera } of postures) {
    it(`${name}: the top edge's heading is the heading`, () => {
      for (const headingDeg of HEADINGS) {
        const h = headingsFromFrame(frameFor({ headingDeg, ...p }));
        expect(Math.abs(shortestDelta(headingDeg, h.flatHeading))).toBeLessThan(1e-6);
        expect(h.pitch).toBeCloseTo(p.pitchDeg ?? 0, 6);
      }
    });
    if (camera) {
      it(`${name}: the camera's heading is where the back points`, () => {
        for (const headingDeg of HEADINGS) {
          const posture = { headingDeg, ...p };
          const h = headingsFromFrame(frameFor(posture));
          expect(Math.abs(shortestDelta(expectedCameraHeading(posture), h.cameraHeading))).toBeLessThan(1e-6);
        }
      });
    }
  }

  it('upright: both headings are the heading and the pitch is 90', () => {
    for (const headingDeg of HEADINGS) {
      const h = headingsFromFrame(frameFor({ headingDeg, pitchDeg: 90 }));
      expect(Math.abs(shortestDelta(headingDeg, h.flatHeading))).toBeLessThan(1e-6);
      expect(Math.abs(shortestDelta(headingDeg, h.cameraHeading))).toBeLessThan(1e-6);
      expect(h.pitch).toBeCloseTo(90, 6);
    }
  });

  it('hands the top edge over to the camera as the phone is raised to upright, with no step', () => {
    // Rolled 30° so the two headings differ; raised from 60° through upright to 96°.
    // (Tipped further back the top edge points behind the user, and the blend
    // rightly walks toward that: a posture neither page uses.)
    const readings: number[] = [];
    for (let pitchDeg = 60; pitchDeg <= 96; pitchDeg += 0.5) {
      readings.push(headingsFromFrame(frameFor({ headingDeg: 0, pitchDeg, rollDeg: 30 })).flatHeading);
    }
    for (let i = 1; i < readings.length; i++) {
      expect(Math.abs(shortestDelta(readings[i], readings[i - 1]))).toBeLessThan(4);
    }
    // The ends really differ, so the blend was exercised.
    expect(Math.abs(shortestDelta(readings[readings.length - 1], readings[0]))).toBeGreaterThan(10);
  });

  it('does not depend on the field strength', () => {
    const { mag, down } = deviceVectors({ headingDeg: 136.14, pitchDeg: 20 });
    const a = headingsFromFrame(earthFrame(mag, down)!);
    const b = headingsFromFrame(earthFrame([mag[0] * 3, mag[1] * 3, mag[2] * 3], down)!);
    expect(a.flatHeading).toBeCloseTo(b.flatHeading, 9);
  });

  it('does not depend on the unit gravity comes in', () => {
    const { mag, down } = deviceVectors({ headingDeg: 200, pitchDeg: 35, rollDeg: -10 });
    const inG: [number, number, number] = [down[0] / 9.81, down[1] / 9.81, down[2] / 9.81];
    expect(headingsFromFrame(earthFrame(mag, inG)!).flatHeading).toBeCloseTo(headingsFromFrame(earthFrame(mag, down)!).flatHeading, 9);
  });

  it('east is to the right of a phone whose top points north', () => {
    const f = frameFor({ headingDeg: 0 });
    expect(f.east[0]).toBeCloseTo(1, 9);
    expect(f.north[1]).toBeCloseTo(1, 9);
    expect(f.up[2]).toBeCloseTo(1, 9);
  });

  it('axisHeading reads any device axis', () => {
    const f = frameFor({ headingDeg: 30 });
    expect(axisHeading(f, AXIS_TOP)).toBeCloseTo(30, 6);
    expect(axisHeading(f, [1, 0, 0])).toBeCloseTo(120, 6);
    expect(axisHeading(f, [0, -1, 0])).toBeCloseTo(210, 6);
    // Flat, the camera points straight down: no heading to speak of, but no crash.
    expect(Number.isFinite(axisHeading(f, AXIS_CAMERA))).toBe(true);
  });
});

describe('earthFrame, hand-written device readings', () => {
  // Cairo: the field points north and 45° down, so flat and facing north it reads (0, +H, −V).
  const H = 31;
  const V = 31;
  const FLAT_DOWN = [0, 0, -9.8] as const;

  it('flat, top pointing north / east / south', () => {
    expect(headingsFromFrame(earthFrame([0, H, -V], FLAT_DOWN)!).flatHeading).toBeCloseTo(0, 6);
    // Turned clockwise to face east, magnetic north is to the phone's left (−X).
    expect(headingsFromFrame(earthFrame([-H, 0, -V], FLAT_DOWN)!).flatHeading).toBeCloseTo(90, 6);
    expect(headingsFromFrame(earthFrame([0, -H, -V], FLAT_DOWN)!).flatHeading).toBeCloseTo(180, 6);
  });
  it('upright, back camera facing north: down is −Y, north is straight through the back', () => {
    const h = headingsFromFrame(earthFrame([0, -V, -H], [0, -9.8, 0])!);
    expect(h.cameraHeading).toBeCloseTo(0, 6);
    expect(h.pitch).toBeCloseTo(90, 6);
  });
  it('recorded sample: flat on the desk reading 46–50° magnetic (shadow spot, S24 Ultra, 2026-09-27)', () => {
    // Calibrated field (−20.6, 18.4, −30.0), phone flat; the platform compass read 48°.
    const h = headingsFromFrame(earthFrame([-20.6, 18.4, -30.0], [0.1, 0.2, -9.8])!).flatHeading;
    expect(h).toBeGreaterThan(46);
    expect(h).toBeLessThan(51);
  });
});

describe('earthFrame, degenerate inputs', () => {
  it('is null for a vertical field (the magnetic pole)', () => {
    expect(earthFrame([0, 0, -44], [0, 0, -9.8])).toBeNull();
  });
  it('is null for an empty field or an empty gravity', () => {
    expect(earthFrame([0.1, 0.2, -0.3], [0, 0, -9.8])).toBeNull();
    expect(earthFrame([0, 31, -31], [0, 0, -0.01])).toBeNull();
  });
  it('is fine at a steep but real dip (70°)', () => {
    const { mag, down } = deviceVectors({ headingDeg: 45 }, { F: 50, I: 70 });
    expect(headingsFromFrame(earthFrame(mag, down)!).flatHeading).toBeCloseTo(45, 6);
  });
});

describe('fieldShape', () => {
  it('reads the model field back at every posture', () => {
    for (const p of [{}, { pitchDeg: 90 }, { rollDeg: 180 }, { pitchDeg: -40, rollDeg: 70 }]) {
      const { mag, down } = deviceVectors({ headingDeg: 77, ...p });
      const s = fieldShape(mag, down)!;
      expect(s.magnitudeUt).toBeCloseTo(CAIRO.F, 6);
      expect(s.dipDeg).toBeCloseTo(CAIRO.I, 6);
    }
  });
  it('is signed: a field pointing up reads a negative dip', () => {
    expect(fieldShape([0, 31, 31], [0, 0, -9.8])!.dipDeg).toBeCloseTo(-45, 6);
  });
  it('is null for an empty input', () => {
    expect(fieldShape([0, 0, 0], [0, 0, -9.8])).toBeNull();
  });
});
