import { describe, expect, it } from 'vitest';
import { earthFrame, headingsFromFrame } from './field';
import { FILTER_TAU_S, createFieldFilter } from './fieldFilter';
import { shortestDelta } from './smooth';
import { deviceVectors, omegaAboutUp, turnAboutUp } from './testing/synthetic';
import type { Vec3 } from './vec';

const headingOf = (mag: Vec3, down: Vec3) => headingsFromFrame(earthFrame(mag, down)!).flatHeading;

describe('createFieldFilter', () => {
  it('starts on the first measurement', () => {
    const f = createFieldFilter();
    expect(f.value()).toBeNull();
    expect(f.correct([1, 2, 3], 0)).toEqual([1, 2, 3]);
  });

  it('a counter-clockwise turn (positive rate about up) lowers the heading by what the gyroscope integrates', () => {
    const { mag, down } = deviceVectors({ headingDeg: 45 });
    const f = createFieldFilter();
    f.correct(mag, 0);
    f.rotate(omegaAboutUp(down, 100), 0);
    f.rotate(omegaAboutUp(down, 100), 0.1); // 10° in 0.1 s
    const turned = f.value()!;
    expect(headingOf(turned, down)).toBeCloseTo(35, 6);
    // And it is exactly where the magnetometer would now read the field.
    const truth = turnAboutUp(mag, down, 10);
    for (let i = 0; i < 3; i++) expect(turned[i]).toBeCloseTo(truth[i], 6);
  });

  it('a clockwise turn raises the heading, through the 0/360 seam', () => {
    const { mag, down } = deviceVectors({ headingDeg: 359 });
    const f = createFieldFilter();
    f.correct(mag, 0);
    f.rotate(omegaAboutUp(down, -40), 0);
    f.rotate(omegaAboutUp(down, -40), 0.05); // 2° clockwise
    expect(headingOf(f.value()!, down)).toBeCloseTo(1, 6);
  });

  it('pulls onto a steady measurement with the time constant τ', () => {
    const a = deviceVectors({ headingDeg: 0 });
    const b = deviceVectors({ headingDeg: 30 });
    const f = createFieldFilter();
    f.correct(a.mag, 0);
    let v = a.mag;
    for (let t = 0.02; t <= FILTER_TAU_S + 1e-9; t += 0.02) v = f.correct(b.mag, t);
    const remaining = Math.abs(shortestDelta(30, headingOf(v, a.down))) / 30;
    expect(remaining).toBeGreaterThan(0.3);
    expect(remaining).toBeLessThan(0.42); // 1/e ≈ 0.37 for a first-order filter
  });

  it('tracks a 90°/s turn within 2° with the gyroscope in step with the magnetometer', () => {
    const start = deviceVectors({ headingDeg: 100 });
    const f = createFieldFilter();
    f.correct(start.mag, 0);
    f.rotate(omegaAboutUp(start.down, -90), 0);
    for (let i = 1; i <= 50; i++) {
      const t = i * 0.02;
      f.rotate(omegaAboutUp(start.down, -90), t);
      f.correct(turnAboutUp(start.mag, start.down, -90 * t), t);
      const expected = 100 + 90 * t;
      expect(Math.abs(shortestDelta(expected, headingOf(f.value()!, start.down)))).toBeLessThan(2);
    }
  });

  it('a 1°/s gyroscope bias on a still phone costs under 0.6° once settled', () => {
    const { mag, down } = deviceVectors({ headingDeg: 200 });
    const f = createFieldFilter();
    f.correct(mag, 0);
    f.rotate(omegaAboutUp(down, 1), 0);
    let error = 0;
    for (let i = 1; i <= 250; i++) {
      const t = i * 0.02;
      f.rotate(omegaAboutUp(down, 1), t);
      f.correct(mag, t);
      error = shortestDelta(200, headingOf(f.value()!, down));
    }
    expect(Math.abs(error)).toBeGreaterThan(0.3);
    expect(Math.abs(error)).toBeLessThan(0.6);
  });

  it('ignores a repeated gyroscope sample (dt = 0)', () => {
    const { mag, down } = deviceVectors({ headingDeg: 45 });
    const f = createFieldFilter();
    f.correct(mag, 0);
    f.rotate(omegaAboutUp(down, 100), 0.5);
    f.rotate(omegaAboutUp(down, 100), 0.5);
    expect(headingOf(f.value()!, down)).toBeCloseTo(45, 6);
  });

  it('caps the step after a long gyroscope gap, and restarts after a very long one', () => {
    const { mag, down } = deviceVectors({ headingDeg: 45 });
    const f = createFieldFilter();
    f.correct(mag, 0);
    f.rotate(omegaAboutUp(down, 100), 0);
    f.rotate(omegaAboutUp(down, 100), 0.6); // 0.6 s at 100°/s, capped to 0.25 s = 25°
    expect(headingOf(f.value()!, down)).toBeCloseTo(20, 6);
    f.rotate(omegaAboutUp(down, 100), 2.6); // a 2 s gap: stale
    expect(headingOf(f.value()!, down)).toBeCloseTo(20, 6);
    const other = deviceVectors({ headingDeg: 300 });
    expect(f.correct(other.mag, 2.6)).toEqual(other.mag); // restarted, not pulled
  });

  it('restarts after a long magnetometer gap', () => {
    const a = deviceVectors({ headingDeg: 0 });
    const b = deviceVectors({ headingDeg: 90 });
    const f = createFieldFilter();
    f.correct(a.mag, 0);
    expect(f.correct(b.mag, 1.5)).toEqual(b.mag);
  });

  it('reset forgets everything', () => {
    const f = createFieldFilter();
    f.correct([1, 2, 3], 0);
    f.reset();
    expect(f.value()).toBeNull();
  });
});
