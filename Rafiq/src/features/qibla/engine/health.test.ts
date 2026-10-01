import { describe, expect, it } from 'vitest';
import {
  DISAGREE_PERSIST_S,
  FIELD_CLEAR_S,
  FIELD_ENTER_S,
  STILL_HOLD_S,
  createDisagreementWatch,
  createFieldWatch,
  createGyroStillness,
  createHeadingStillness,
} from './health';
import { deviceVectors, omegaAboutUp, turnAboutUp } from './testing/synthetic';

describe('createGyroStillness', () => {
  it('is still once the rate has been quiet for the hold', () => {
    const s = createGyroStillness();
    expect(s.push(0.5, 0).still).toBe(false);
    expect(s.push(0.5, STILL_HOLD_S - 0.01).still).toBe(false);
    const r = s.push(0.5, STILL_HOLD_S + 1);
    expect(r.still).toBe(true);
    expect(r.stillForS).toBeCloseTo(STILL_HOLD_S + 1, 6);
  });
  it('a blip of movement starts the hold over', () => {
    const s = createGyroStillness();
    s.push(0.5, 0);
    s.push(0.5, 2);
    expect(s.push(10, 2.1).stillForS).toBe(0);
    expect(s.push(0.5, 2.2).still).toBe(false);
    expect(s.push(0.5, 3.3).still).toBe(true);
  });
  it('a slow sweep is not still', () => {
    const s = createGyroStillness();
    s.push(4, 0);
    expect(s.push(4, 5).still).toBe(false);
  });
});

describe('createHeadingStillness', () => {
  it('is not still until the window has filled, then still while the heading holds', () => {
    const s = createHeadingStillness(1, 4);
    expect(s.push(100, 0).still).toBe(false);
    expect(s.push(100, 0.5).still).toBe(false);
    let r = s.push(101, 1);
    for (let i = 11; i <= 20; i++) r = s.push(100 + (i % 2 ? 1.5 : -1.5), i / 10);
    expect(r.still).toBe(true);
    expect(r.stillForS).toBeGreaterThan(0);
  });
  it('is not still while the heading wanders', () => {
    const s = createHeadingStillness(1, 4);
    let r = s.push(100, 0);
    for (let i = 1; i <= 20; i++) r = s.push(100 + (i % 2 ? 5 : -5), i / 10);
    expect(r.still).toBe(false);
  });
  it('holds still across the 0/360 seam', () => {
    const s = createHeadingStillness(1, 4);
    let r = s.push(359, 0);
    for (let i = 1; i <= 20; i++) r = s.push(i % 2 ? 1 : 359, i / 10);
    expect(r.still).toBe(true);
  });
});

// Cairo per the WMM: 44 µT, dipping 45°.
const CAIRO = { magnitudeUt: 44, dipDeg: 45 };
const hold = (w: ReturnType<typeof createFieldWatch>, m: number, dip: number, from: number, to: number) => {
  let r = false;
  for (let t = from; t <= to + 1e-9; t += 0.05) r = w.push({ magnitudeUt: m, dipDeg: dip }, t);
  return r;
};

describe('createFieldWatch', () => {
  it('accepts a phone reading close to the model', () => {
    expect(hold(createFieldWatch(CAIRO), 47, 43, 0, 10)).toBe(false);
  });
  it('accepts the lift a charging cable gives (S24 Ultra on the desk: 65 µT, dip 43°, heading right)', () => {
    expect(hold(createFieldWatch(CAIRO), 65, 43, 0, 10)).toBe(false);
  });
  it('flags the desk by the laptop (78 µT, dip 61°, heading wrong), once it has persisted', () => {
    const w = createFieldWatch(CAIRO);
    expect(hold(w, 78, 61, 0, FIELD_ENTER_S - 0.1)).toBe(false);
    expect(hold(w, 78, 61, FIELD_ENTER_S, FIELD_ENTER_S + 0.1)).toBe(true);
  });
  it('flags a field far too weak, and a dip far off on its own', () => {
    expect(hold(createFieldWatch(CAIRO), 12, 45, 0, FIELD_ENTER_S + 0.1)).toBe(true);
    expect(hold(createFieldWatch(CAIRO), 44, 70, 0, FIELD_ENTER_S + 0.1)).toBe(true);
  });
  it('ignores a brief excursion', () => {
    const w = createFieldWatch(CAIRO);
    hold(w, 45, 45, 0, 1);
    expect(hold(w, 120, 45, 1, 1.3)).toBe(false);
    expect(hold(w, 45, 45, 1.35, 5)).toBe(false);
  });
  it('clears only once the field has been normal for a while, and not from the margin', () => {
    const w = createFieldWatch(CAIRO);
    hold(w, 120, 45, 0, FIELD_ENTER_S + 0.1);
    // 1.4 × F: inside the enter band but outside the clear band: still anomalous.
    expect(hold(w, 44 * 1.4, 45, 3, 6)).toBe(true);
    expect(hold(w, 48, 45, 6, 6 + FIELD_CLEAR_S - 0.1)).toBe(true);
    expect(hold(w, 48, 45, 6 + FIELD_CLEAR_S, 6 + FIELD_CLEAR_S + 0.1)).toBe(false);
  });
});

describe('createDisagreementWatch', () => {
  const still = deviceVectors({ headingDeg: 120 });

  it('is quiet while the phone turns and both sensors agree', () => {
    const w = createDisagreementWatch();
    w.pushMeasured(still.mag, still.down, 0);
    w.pushGyro(omegaAboutUp(still.down, -60), 0);
    for (let i = 1; i <= 100; i++) {
      const t = i * 0.02;
      w.pushGyro(omegaAboutUp(still.down, -60), t);
      expect(w.pushMeasured(turnAboutUp(still.mag, still.down, -60 * t), still.down, t)).toBe(false);
    }
  });

  it('fires when the field swings while the gyroscope sees no turn (a magnet brought near)', () => {
    const w = createDisagreementWatch();
    w.pushMeasured(still.mag, still.down, 0);
    w.pushGyro([0, 0, 0], 0);
    for (let t = 0.02; t < 0.3; t += 0.02) {
      w.pushGyro([0, 0, 0], t);
      w.pushMeasured(still.mag, still.down, t);
    }
    const swung = turnAboutUp(still.mag, still.down, 40);
    let fired = false;
    let firedAt = 0;
    for (let t = 0.3; t <= 1; t += 0.02) {
      w.pushGyro([0, 0, 0], t);
      if (w.pushMeasured(swung, still.down, t) && !fired) {
        fired = true;
        firedAt = t;
      }
    }
    expect(fired).toBe(true);
    expect(firedAt).toBeGreaterThanOrEqual(0.3 + DISAGREE_PERSIST_S - 1e-9);
    expect(firedAt).toBeLessThan(0.3 + DISAGREE_PERSIST_S + 0.1);
  });

  it('does not fire on a small swing', () => {
    const w = createDisagreementWatch();
    w.pushMeasured(still.mag, still.down, 0);
    const nudged = turnAboutUp(still.mag, still.down, 12);
    let any = false;
    for (let t = 0.02; t <= 2; t += 0.02) {
      w.pushGyro([0, 0, 0], t);
      any = any || w.pushMeasured(nudged, still.down, t);
    }
    expect(any).toBe(false);
  });

  it('stays quiet through a flick, where the magnetometer only lags', () => {
    const w = createDisagreementWatch();
    w.pushMeasured(still.mag, still.down, 0);
    w.pushGyro(omegaAboutUp(still.down, -400), 0);
    let any = false;
    for (let i = 1; i <= 25; i++) {
      const t = i * 0.02;
      w.pushGyro(omegaAboutUp(still.down, -400), t);
      // The field arrives 60 ms late: 24° behind at this rate.
      any = any || w.pushMeasured(turnAboutUp(still.mag, still.down, -400 * Math.max(0, t - 0.06)), still.down, t);
    }
    expect(any).toBe(false);
  });

  it('comes to accept a field that stays swung (the copy is pulled onto it)', () => {
    const w = createDisagreementWatch();
    w.pushMeasured(still.mag, still.down, 0);
    const swung = turnAboutUp(still.mag, still.down, 40);
    let last = false;
    for (let t = 0.02; t <= 15; t += 0.02) {
      w.pushGyro([0, 0, 0], t);
      last = w.pushMeasured(swung, still.down, t);
    }
    expect(last).toBe(false);
  });
});
