import { describe, expect, it } from 'vitest';
import { createQiblaEngine, type EngineOutput } from './engine';
import type { Coords } from './types';
import type { MotionBatch } from './stream';
import { T0, createSim, headingError, type Script, type SensorModel, type Sim } from './testing/sim';

const CAIRO: Coords = { latitude: 30.0444, longitude: 31.2357 };
const ANDROID: SensorModel = { platform: 'android', gyroBias: [0.0005, -0.0004, 0.0006], gyroScale: 0.01, magScale: [1.02, 0.98, 1.01] };
const IOS: SensorModel = { platform: 'ios', gyroBias: [0.0002, 0.0002, -0.0003], gyroScale: -0.005 };

interface Tick { t: number; out: EngineOutput | null }

function feed(sim: Sim, model: SensorModel, batches: { at: number; batch: MotionBatch }[]): Tick[] {
  const engine = createQiblaEngine(
    { hasGyro: !model.noGyro, hasMagnetometer: true, hasUp: true, upIsAccelerometer: !!model.noGyro || !!model.rawAccel },
    sim.field,
  );
  return batches.map(({ at, batch }) => ({ t: at, out: engine.push(batch) }));
}
const run = (sim: Sim, model: SensorModel, until: number) => feed(sim, model, sim.batches(0, until));

/** The worst heading error the screen showed as `good` inside [from, to). */
function worstGood(ticks: Tick[], sim: Sim, from = 0, to = Infinity): number {
  let w = 0;
  for (const k of ticks) {
    const o = k.out;
    if (k.t < from || k.t >= to || !o?.ready || o.confidence !== 'good') continue;
    w = Math.max(w, headingError(o.flat, sim.trueHeading(o.t - T0)));
  }
  return w;
}
function maxError(ticks: Tick[], sim: Sim, from: number, to = Infinity): number {
  let w = 0;
  let n = 0;
  for (const k of ticks) {
    if (k.t < from || k.t >= to || !k.out?.ready) continue;
    n++;
    w = Math.max(w, headingError(k.out.flat, sim.trueHeading(k.out.t - T0)));
  }
  expect(n).toBeGreaterThan(0);
  return w;
}
const firstAt = (ticks: Tick[], from: number, pred: (o: EngineOutput) => boolean) =>
  ticks.find((k) => k.t >= from && k.out && pred(k.out))?.t ?? Infinity;
const accuracy = (steps: [number, number][]) => (t: number) => {
  let v = steps[0][1];
  for (const [f, a] of steps) if (t >= f) v = a;
  return v;
};
/** A horizontal field change that keeps size and dip: the field turned by `deg` (ramped over `rampS`) from `at`. */
const turnField = (sim: () => Sim, at: number, deg: number, rampS = 0) => (t: number) => {
  if (t < at) return [0, 0, 0] as const;
  const f = rampS === 0 ? 1 : Math.min(1, (t - at) / rampS);
  const e = sim().field;
  const d = (e.declination * Math.PI) / 180;
  const r = (deg * f * Math.PI) / 180;
  return [e.horizontalUt * (Math.sin(d + r) - Math.sin(d)), e.horizontalUt * (Math.cos(d + r) - Math.cos(d)), 0] as const;
};

describe('H1: north learned before the platform calibrated', () => {
  const fig8 = (end: number) => (t: number) => (t >= 2 && t < end ? 1 : 0);
  const wave = (end: number, offset: Script['deviceOffset'], acc: (t: number) => number): Script => ({
    heading: (t) => 140 + fig8(end)(t) * 70 * Math.sin(2 * Math.PI * (t - 2)),
    pitch: (t) => fig8(end)(t) * 50 * Math.sin(4 * Math.PI * (t - 2)),
    roll: (t) => fig8(end)(t) * 40 * Math.sin(2 * Math.PI * (t - 2)),
    deviceOffset: offset,
    magAccuracy: acc,
  });

  it('Android: figure-eight, calibrated at 6 s, laid flat: never a wrong `good`, right at once, no false warning', () => {
    const sim = createSim(CAIRO, wave(6, (t) => (t < 6 ? [18, -10, 6] : [0, 0, 0]), accuracy([[0, 0], [6, 3]])), ANDROID);
    const ticks = run(sim, ANDROID, 16);
    expect(worstGood(ticks, sim)).toBeLessThan(5);
    expect(maxError(ticks, sim, 6.6)).toBeLessThan(3);
    expect(firstAt(ticks, 6, (o) => o.confidence === 'interference')).toBe(Infinity);
    expect(firstAt(ticks, 6, (o) => o.confidence === 'good')).toBeLessThan(6.8);
  });

  it('iOS: accuracy low then high: the same', () => {
    const sim = createSim(CAIRO, wave(6, (t) => (t < 6 ? [16, -9, 0] : [0, 0, 0]), accuracy([[0, 1], [6, 3]])), IOS);
    const ticks = run(sim, IOS, 16);
    expect(worstGood(ticks, sim)).toBeLessThan(5);
    expect(maxError(ticks, sim, 6.6)).toBeLessThan(3);
    expect(firstAt(ticks, 6, (o) => o.confidence === 'interference')).toBe(Infinity);
  });

  it('the existing figure-eight scenario (still waving until 8 s): never a wrong `good`', () => {
    const sim = createSim(CAIRO, wave(8, (t) => (t < 6 ? [18, -10, 6] : [0, 0, 0]), accuracy([[0, 0], [6, 3]])), ANDROID);
    const ticks = run(sim, ANDROID, 12);
    expect(worstGood(ticks, sim)).toBeLessThan(5);
  });

  it('a calibration step bigger than any gate (a 60 µT offset) is still taken, not held as interference', () => {
    const sim = createSim(CAIRO, { heading: () => 70, deviceOffset: (t) => (t < 4 ? [45, -40, 0] : [0, 0, 0]), magAccuracy: accuracy([[0, 0], [4, 3]]) }, ANDROID);
    const ticks = run(sim, ANDROID, 9);
    expect(worstGood(ticks, sim)).toBeLessThan(5);
    expect(maxError(ticks, sim, 4.8)).toBeLessThan(3);
    expect(firstAt(ticks, 4, (o) => o.confidence === 'interference')).toBe(Infinity);
  });
});

describe('M1: the recalibration window', () => {
  for (const [label, deg, rampS, epochAt] of [
    ['25° over 0.5 s', 25, 0.5, 3.1],
    ['25° over 1 s', 25, 1, 3.1],
    ['15° at once, epoch 0.4 s later', 15, 0, 3.4],
  ] as const) {
    it(`a shape-preserving change (${label}) with a bias epoch is held and warned, not adopted`, () => {
      let sim: Sim;
      sim = createSim(CAIRO, { heading: () => 40, external: turnField(() => sim, 3, deg, rampS), biasEpoch: (t) => (t >= epochAt ? 1 : 0) }, ANDROID);
      const ticks = run(sim, ANDROID, 7);
      expect(worstGood(ticks, sim, 3, 7)).toBeLessThan(5);
      expect(firstAt(ticks, 3, (o) => o.confidence === 'interference')).toBeLessThan(6.3);
    });
  }

  it('a genuine recalibration step beyond the gate (~15°) is still followed without a warning', () => {
    const decl = createSim(CAIRO, { heading: () => 0 }, ANDROID).field.declination;
    // An 8.5 µT offset across magnetic north, written in the device frame of a flat phone heading 250°.
    const a = ((decl + 90 - 250) * Math.PI) / 180;
    const off = [8.5 * Math.sin(a), 8.5 * Math.cos(a), 0] as const;
    const sim = createSim(CAIRO, { heading: () => 250, deviceOffset: (t) => (t < 4 ? off : [0, 0, 0]), biasEpoch: (t) => (t < 4 ? 0 : 1) }, ANDROID);
    const ticks = run(sim, ANDROID, 9);
    expect(maxError(ticks, sim, 2, 4)).toBeGreaterThan(10); // the step really is beyond the gate
    expect(firstAt(ticks, 4, (o) => o.confidence === 'interference')).toBe(Infinity);
    expect(maxError(ticks, sim, 5)).toBeLessThan(3);
  });
});

describe('M3: a glitched timestamp', () => {
  for (const kind of ['gyro', 'mag', 'up'] as const) {
    it(`one ${kind} sample stamped far in the future does not freeze the engine`, () => {
      const sim = createSim(CAIRO, { heading: (t) => (t < 3 ? 50 : 50 + Math.min(90, (t - 3) * 45)) }, ANDROID);
      const batches = sim.batches(0, 8);
      const b = batches.find(({ at, batch }) => at >= 2 && batch[kind].length >= 4)!.batch;
      b[kind][b[kind].length - 4] = T0 + 1e6;
      const ticks = feed(sim, ANDROID, batches);
      // Judged at the batch's own time, and the output's time must keep up with it: a frozen
      // engine also freezes `out.t`, which would make an error measured at `out.t` look perfect.
      let worst = 0;
      for (const k of ticks) {
        if (k.t < 1 || !k.out?.ready) continue;
        expect(k.out.t - T0).toBeGreaterThan(k.t - 0.1);
        worst = Math.max(worst, headingError(k.out.flat, sim.trueHeading(k.t)));
      }
      expect(worst).toBeLessThan(4);
      // …and the stream is still being used afterwards (not every later sample rejected as a reversal).
      const at3 = ticks.find((k) => k.t >= 3)!.out!.debug.rejected;
      expect(ticks.at(-1)!.out!.debug.rejected - at3).toBeLessThan(5);
    });
  }
});

describe('M4: magnetometer latency', () => {
  it('a 630° spin at 400°/s with readings stamped 20 ms late: little error after the spin', () => {
    const model: SensorModel = { ...ANDROID, magDelay: 0.02 };
    const end = 2 + 630 / 400;
    const sim = createSim(CAIRO, { heading: (t) => (t < 2 ? 100 : t < end ? 100 + 400 * (t - 2) : 730) }, model);
    const ticks = run(sim, model, 8);
    console.log(`M4 20 ms: during ${maxError(ticks, sim, 2, end).toFixed(2)}, +0.5–1.5 s ${maxError(ticks, sim, end + 0.5, end + 1.5).toFixed(2)}`);
    expect(maxError(ticks, sim, end + 0.5, end + 1.5)).toBeLessThan(2);
  });
});
