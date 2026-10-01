import { describe, expect, it } from 'vitest';
import { createQiblaEngine, type EngineOutput } from './engine';
import type { Coords } from './types';
import { T0, createSim, headingError, type Script, type SensorModel, type Sim } from './testing/sim';

const CAIRO: Coords = { latitude: 30.0444, longitude: 31.2357 };
const LONDON: Coords = { latitude: 51.5074, longitude: -0.1278 };
const OSLO: Coords = { latitude: 59.9139, longitude: 10.7522 };
const SYDNEY: Coords = { latitude: -33.8688, longitude: 151.2093 };
const BLACKOUT: Coords = { latitude: 85.5, longitude: 134 };

const ANDROID: SensorModel = { platform: 'android', gyroBias: [0.0005, -0.0004, 0.0006], gyroScale: 0.01, magScale: [1.02, 0.98, 1.01] };
const IOS: SensorModel = { platform: 'ios', gyroBias: [0.0002, 0.0002, -0.0003], gyroScale: -0.005 };

interface Tick {
  t: number;
  out: EngineOutput | null;
}

/** Runs a scripted phone through the engine; returns every output with its time (script seconds). */
function run(sim: Sim, model: SensorModel, until: number, hooks: { at?: number; then?: (e: ReturnType<typeof createQiblaEngine>) => void } = {}): Tick[] {
  const engine = createQiblaEngine(
    {
      hasGyro: !model.noGyro,
      hasMagnetometer: true,
      hasUp: true,
      upIsAccelerometer: !!model.noGyro,
    },
    sim.field,
  );
  const ticks: Tick[] = [];
  let hooked = false;
  for (const { at, batch } of sim.batches(0, until)) {
    if (hooks.at !== undefined && !hooked && at >= hooks.at) {
      hooked = true;
      hooks.then?.(engine);
    }
    ticks.push({ t: at, out: engine.push(batch) });
  }
  return ticks;
}

/** Outputs inside [from, to); never empty, so `every` over it cannot pass vacuously. */
function after(ticks: Tick[], from: number, to = Infinity): EngineOutput[] {
  const outs = ticks.filter((k) => k.t >= from && k.t < to && k.out).map((k) => k.out as EngineOutput);
  expect(outs.length).toBeGreaterThan(0);
  return outs;
}

function maxError(ticks: Tick[], sim: Sim, from: number, to = Infinity, mode: 'flat' | 'camera' = 'flat'): number {
  let worst = 0;
  let n = 0;
  for (const k of ticks) {
    if (k.t < from || k.t >= to || !k.out?.ready) continue;
    n++;
    // Compared at the sensor time the output is for.
    const truth = sim.trueHeading(k.out.t - T0);
    worst = Math.max(worst, headingError(mode === 'flat' ? k.out.flat : k.out.camera, truth));
  }
  expect(n).toBeGreaterThan(0);
  return worst;
}

const still = (deg: number): Script => ({ heading: () => deg });

describe('start-up', () => {
  for (const start of [0, 47, 136, 222, 359]) {
    it(`finds north from rest within a second (top toward ${start}°)`, () => {
      const sim = createSim(CAIRO, still(start), ANDROID);
      const ticks = run(sim, ANDROID, 3);
      expect(after(ticks, 1).every((o) => o.confidence === 'good')).toBe(true);
      expect(maxError(ticks, sim, 1)).toBeLessThan(3);
    });
  }

  it('has no heading before north is found, and says it is settling', () => {
    const sim = createSim(CAIRO, still(90), ANDROID);
    const ticks = run(sim, ANDROID, 0.2);
    const first = ticks.find((k) => k.out)!.out!;
    expect(first.ready).toBe(false);
    expect(Number.isNaN(first.flat)).toBe(true);
    expect(first.confidence).toBe('settling');
  });

  it('finds north while the phone is already turning', () => {
    const sim = createSim(CAIRO, { heading: (t) => 30 + 60 * t }, ANDROID);
    const ticks = run(sim, ANDROID, 4);
    expect(maxError(ticks, sim, 1.5)).toBeLessThan(3);
  });

  it('works on the iOS delivery (one timestamp for all three)', () => {
    const sim = createSim(CAIRO, still(136), IOS);
    const ticks = run(sim, IOS, 3);
    expect(maxError(ticks, sim, 1)).toBeLessThan(3);
    expect(after(ticks, 1).every((o) => o.confidence === 'good')).toBe(true);
  });
});

describe('turning', () => {
  it('a fast spin (630° at 400°/s) raises no warning, tracks the turn and lands on the right heading', () => {
    // Still for 2 s, spin 630° in 1.575 s, still again.
    const end = 2 + 630 / 400;
    const heading = (t: number) => (t < 2 ? 100 : t < end ? 100 + 400 * (t - 2) : 100 + 630);
    const sim = createSim(CAIRO, { heading }, ANDROID);
    const ticks = run(sim, ANDROID, 7);
    const outs = after(ticks, 1);
    expect(outs.some((o) => o.confidence !== 'good')).toBe(false);
    // During the spin the gyroscope carries it, the magnetometer still correcting as it turns.
    expect(maxError(ticks, sim, 2, end)).toBeLessThan(5);
    expect(maxError(ticks, sim, end + 1.5)).toBeLessThan(3);
  });

  it('follows a sweep through north without a jump', () => {
    const sim = createSim(CAIRO, { heading: (t) => 330 + 20 * t }, ANDROID);
    const ticks = run(sim, ANDROID, 5);
    expect(maxError(ticks, sim, 1)).toBeLessThan(3);
  });

  it('tracks the camera upright, and the top edge face down', () => {
    const up = createSim(CAIRO, { heading: () => 200, pitch: () => 88 }, ANDROID);
    expect(maxError(run(up, ANDROID, 3), up, 1, Infinity, 'camera')).toBeLessThan(3);
    const down = createSim(CAIRO, { heading: () => 70, roll: () => 180 }, ANDROID);
    // Face down the top edge still points where the script says.
    expect(maxError(run(down, ANDROID, 3), down, 1)).toBeLessThan(3);
  });

  it('raising the phone from flat to upright keeps the heading continuous', () => {
    const sim = createSim(CAIRO, { heading: () => 150, pitch: (t) => Math.min(90, Math.max(0, (t - 2) * 45)) }, ANDROID);
    const ticks = run(sim, ANDROID, 5);
    let worstStep = 0;
    let prev: number | null = null;
    for (const o of after(ticks, 1)) {
      if (prev !== null) worstStep = Math.max(worstStep, headingError(o.flat, prev));
      prev = o.flat;
    }
    expect(worstStep).toBeLessThan(2);
  });

  it('holds over a minute against gyro bias drift', () => {
    const drifting: SensorModel = { ...ANDROID, gyroBias: [0, 0, 0.003] }; // 0.17°/s about Z
    const sim = createSim(CAIRO, still(80), drifting);
    expect(maxError(run(sim, drifting, 60), sim, 1)).toBeLessThan(3);
  });

  it('a gyro gap while turning: north is found again', () => {
    const sim = createSim(CAIRO, { heading: (t) => (t < 2 ? 40 : t < 2.3 ? 40 + 300 * (t - 2) : 130), gyroSilent: (t) => t > 2 && t < 2.3 }, ANDROID);
    const ticks = run(sim, ANDROID, 5);
    expect(maxError(ticks, sim, 3.2)).toBeLessThan(3);
    expect(after(ticks, 1).some((o) => o.confidence === 'interference')).toBe(false);
  });
});

describe('interference', () => {
  // The laptop corner measured in Cairo: 78 µT dipping 61°, against the model's 44 µT at 45°. Here a world-fixed
  // disturbance that also turns the horizontal field by ~12°.
  const laptop = (from: number, to: number) => (t: number) =>
    t >= from && t < to ? ([8, 6.7, -37.1] as const) : ([0, 0, 0] as const);

  it('a laptop corner is reported within ~1 s, cleared after leaving, and the heading is held meanwhile', () => {
    const sim = createSim(CAIRO, { heading: () => 120, external: laptop(3, 8) }, ANDROID);
    const ticks = run(sim, ANDROID, 12);
    const firstWarn = ticks.find((k) => k.t >= 3 && k.out?.confidence === 'interference');
    expect(firstWarn).toBeDefined();
    expect(firstWarn!.t - 3).toBeLessThan(1.3);
    expect(after(ticks, 8 + 1.8).every((o) => o.confidence === 'good')).toBe(true);
    expect(maxError(ticks, sim, 3, 8)).toBeLessThan(3);
    expect(maxError(ticks, sim, 10)).toBeLessThan(3);
  });

  it('a desk with a charging cable (the field ×1.5, same direction) is never a warning', () => {
    const sim = createSim(CAIRO, { heading: () => 60, external: () => [0, 0, 0] }, ANDROID);
    const e = sim.field;
    const scaled = createSim(
      CAIRO,
      {
        heading: (t) => 60 + 30 * Math.sin(t),
        external: () => {
          const h = e.horizontalUt * 0.5;
          const v = e.totalUt * Math.sin((e.dipDeg * Math.PI) / 180) * 0.5;
          const d = (e.declination * Math.PI) / 180;
          return [h * Math.sin(d), h * Math.cos(d), -v];
        },
      },
      ANDROID,
    );
    const ticks = run(scaled, ANDROID, 10);
    expect(after(ticks, 0).some((o) => o.confidence === 'interference')).toBe(false);
    expect(maxError(ticks, scaled, 1.5)).toBeLessThan(3);
    void sim;
  });

  it('a magnet swept past for half a second is neither shown nor followed', () => {
    const sim = createSim(CAIRO, { heading: () => 300, external: (t) => (t >= 3 && t < 3.5 ? [60, -40, 30] : [0, 0, 0]) }, ANDROID);
    const ticks = run(sim, ANDROID, 6);
    expect(after(ticks, 1).some((o) => o.confidence !== 'good')).toBe(false);
    expect(maxError(ticks, sim, 1)).toBeLessThan(3);
  });

  it('a field that turns without changing shape (a bent floor) is held, shown after 2 s, followed after 8 s', () => {
    // Rotate the horizontal field by 40° at t = 3, keeping its size and dip.
    const sim = createSim(
      CAIRO,
      {
        heading: () => 10,
        external: (t) => {
          if (t < 3) return [0, 0, 0];
          const e = sim0.field;
          const d = (e.declination * Math.PI) / 180;
          const r = (40 * Math.PI) / 180;
          const h = e.horizontalUt;
          return [h * (Math.sin(d + r) - Math.sin(d)), h * (Math.cos(d + r) - Math.cos(d)), 0];
        },
      },
      ANDROID,
    );
    const sim0 = sim;
    const ticks = run(sim, ANDROID, 15);
    // Held: the gyro's north stays true for the first seconds.
    expect(maxError(ticks, sim, 3, 4.9)).toBeLessThan(3);
    expect(after(ticks, 3, 4.9).some((o) => o.confidence === 'interference')).toBe(false);
    expect(after(ticks, 5.3, 10.9).every((o) => o.confidence === 'interference')).toBe(true);
    // Then the new surroundings are accepted (the phone cannot know they are bent) and the warning clears.
    expect(after(ticks, 13).every((o) => o.confidence === 'good')).toBe(true);
  });

  it('the WMM blackout zone is always reported', () => {
    const sim = createSim(BLACKOUT, still(10), ANDROID);
    expect(sim.field.zone).toBe('blackout');
    const ticks = run(sim, ANDROID, 2);
    expect(after(ticks, 0.5).every((o) => o.confidence === 'interference')).toBe(true);
  });

  for (const [name, at] of [
    ['London', LONDON],
    ['Oslo', OSLO],
    ['Sydney', SYDNEY],
  ] as const) {
    it(`no false warning where the horizontal field is weaker (${name})`, () => {
      const sim = createSim(at, { heading: (t) => 20 + 50 * Math.sin(t / 2), pitch: (t) => 15 * Math.sin(t) }, { ...ANDROID, seed: 7 });
      const ticks = run(sim, ANDROID, 20);
      expect(after(ticks, 1).some((o) => o.confidence !== 'good')).toBe(false);
      expect(maxError(ticks, sim, 1.5)).toBeLessThan(3.5);
    });
  }
});

describe('calibration', () => {
  // Accuracy as the platform reports it: 0 unreliable … 3 high.
  const accuracy = (steps: [number, number][]) => (t: number) => {
    let v = steps[0][1];
    for (const [from, a] of steps) if (t >= from) v = a;
    return v;
  };

  it('a low platform accuracy asks for calibration after a second, and clears the moment it rises', () => {
    const sim = createSim(CAIRO, { heading: () => 10, magAccuracy: accuracy([[0, 1], [4, 3]]) }, ANDROID);
    const ticks = run(sim, ANDROID, 6);
    expect(after(ticks, 0.5, 0.9).some((o) => o.confidence === 'calibrate')).toBe(false);
    expect(after(ticks, 1.2, 4).every((o) => o.confidence === 'calibrate')).toBe(true);
    expect(after(ticks, 4.1).every((o) => o.confidence === 'good')).toBe(true);
  });

  it('a figure-eight that the platform calibrates during clears it, and the corrected field is taken at once', () => {
    // An offset riding on the phone until the platform's fit converges at 6 s, mid-figure-eight.
    const fig8 = (t: number) => (t >= 2 && t < 8 ? 1 : 0);
    const sim = createSim(
      CAIRO,
      {
        // Whole cycles (1 Hz and 2 Hz over 6 s), so the motion ends where it began, without a jump.
        heading: (t) => 140 + fig8(t) * 70 * Math.sin(2 * Math.PI * (t - 2)),
        pitch: (t) => fig8(t) * 50 * Math.sin(4 * Math.PI * (t - 2)),
        roll: (t) => fig8(t) * 40 * Math.sin(2 * Math.PI * (t - 2)),
        deviceOffset: (t) => (t < 6 ? [18, -10, 6] : [0, 0, 0]),
        magAccuracy: accuracy([[0, 0], [6, 3]]),
      },
      ANDROID,
    );
    const ticks = run(sim, ANDROID, 12);
    expect(after(ticks, 1.2, 6).every((o) => o.confidence === 'calibrate')).toBe(true);
    expect(after(ticks, 6.1).some((o) => o.confidence !== 'good')).toBe(false);
    expect(maxError(ticks, sim, 8.5)).toBeLessThan(3);
  });

  it('a magnet that leaves never latches anything', () => {
    const sim = createSim(CAIRO, { heading: (t) => (t < 10 ? 20 * t : 200), deviceOffset: (t) => (t < 10 ? [18, -10, 6] : [0, 0, 0]) }, ANDROID);
    const ticks = run(sim, ANDROID, 25);
    expect(after(ticks, 0).some((o) => o.confidence === 'calibrate')).toBe(false);
    expect(after(ticks, 20).every((o) => o.confidence === 'good')).toBe(true);
  });

  it('carrying the phone past furniture (the field changes with place) is never calibration', () => {
    const sim = createSim(
      CAIRO,
      {
        heading: (t) => 90 * Math.sin(t / 3),
        pitch: (t) => 20 * Math.sin(t / 2),
        external: (t) => [12 * Math.sin(t / 1.7), 9 * Math.cos(t / 2.3), 12 * Math.sin(t / 1.3)],
      },
      ANDROID,
    );
    const ticks = run(sim, ANDROID, 25);
    expect(after(ticks, 0).some((o) => o.confidence === 'calibrate')).toBe(false);
  });

  it('a phone whose accuracy is stuck low is not believed once its field has matched the model for 10 s', () => {
    const sim = createSim(CAIRO, { heading: () => 10, magAccuracy: () => 0 }, ANDROID);
    const ticks = run(sim, ANDROID, 14);
    expect(after(ticks, 1.2, 10).every((o) => o.confidence === 'calibrate')).toBe(true);
    expect(after(ticks, 10.8).every((o) => o.confidence === 'good')).toBe(true);
    expect(after(ticks, 11).every((o) => o.debug.calOverridden)).toBe(true);
  });

  it('…but it is believed while the field is bent', () => {
    const sim = createSim(CAIRO, { heading: () => 10, magAccuracy: () => 0, external: () => [8, 6.7, -37.1] }, ANDROID);
    const ticks = run(sim, ANDROID, 14);
    expect(after(ticks, 1.2).every((o) => o.confidence === 'calibrate')).toBe(true);
  });

  it('iOS: an uncalibrated magnetometer sends no field, yet the screen is told to calibrate', () => {
    const sim = createSim(CAIRO, { heading: () => 10, magAccuracy: accuracy([[0, 0], [4, 3]]) }, IOS);
    const ticks = run(sim, IOS, 6);
    const early = after(ticks, 1.2, 4);
    expect(early.every((o) => o.confidence === 'calibrate' && !o.ready)).toBe(true);
    // Calibrated: the field arrives, north is found, the heading appears.
    expect(after(ticks, 4.5).every((o) => o.ready && o.confidence === 'good')).toBe(true);
    expect(maxError(ticks, sim, 4.5)).toBeLessThan(3);
  });

  it('a platform recalibration step is followed at once without a warning', () => {
    const sim = createSim(
      CAIRO,
      { heading: () => 250, deviceOffset: (t) => (t < 4 ? [6, -6, 0] : [0, 0, 0]), biasEpoch: (t) => (t < 4 ? 0 : 1) },
      ANDROID,
    );
    const ticks = run(sim, ANDROID, 8);
    expect(after(ticks, 4).some((o) => o.confidence === 'interference')).toBe(false);
    expect(maxError(ticks, sim, 5)).toBeLessThan(3);
  });
});

describe('the lock haptic', () => {
  it('a magnetometer spike while the actuator runs is ignored', () => {
    const sim = createSim(CAIRO, { heading: () => 45, external: (t) => (t >= 3 && t < 3.15 ? [300, 200, -100] : [0, 0, 0]) }, ANDROID);
    const ticks = run(sim, ANDROID, 5, { at: 2.98, then: (e) => e.noteActuator() });
    expect(maxError(ticks, sim, 1)).toBeLessThan(3);
    expect(after(ticks, 1).some((o) => o.confidence !== 'good')).toBe(false);
  });
});

describe('without a gyroscope', () => {
  it('falls back to a tilt-compensated compass', () => {
    const model: SensorModel = { platform: 'android', noGyro: true };
    const sim = createSim(CAIRO, { heading: () => 136, pitch: () => 10, roll: () => -8 }, model);
    const ticks = run(sim, model, 4);
    expect(after(ticks, 2)[0].debug.pipeline).toBe('compass');
    expect(maxError(ticks, sim, 2)).toBeLessThan(3);
  });
});
