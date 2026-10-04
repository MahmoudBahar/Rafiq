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
function run(
  sim: Sim,
  model: SensorModel,
  until: number,
  hooks: { at?: number; then?: (e: ReturnType<typeof createQiblaEngine>) => void; mode?: 'flat' | 'camera' } = {},
): Tick[] {
  const engine = createQiblaEngine(
    {
      hasGyro: !model.noGyro,
      hasMagnetometer: true,
      hasUp: true,
      upIsAccelerometer: !!model.noGyro || !!model.rawAccel,
    },
    sim.field,
  );
  if (hooks.mode) engine.setMode(hooks.mode);
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
    // Compared at the sensor time the output is for, which must keep up with delivery: an engine that
    // stopped taking samples freezes `t` too, and would otherwise look perfect.
    expect(k.out.t - T0).toBeGreaterThan(k.t - 0.1);
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

  // The field turned upside down (dip mirrored), as a phone reported for its first readings after a restart.
  const flipped = (sim: Sim, until: number) => (t: number) => {
    if (t >= until) return [0, 0, 0] as const;
    const v = sim.field.totalUt * Math.sin((sim.field.dipDeg * Math.PI) / 180);
    return [0, 0, 2 * v] as const;
  };

  it('does not take north from an upside-down field after a restart', () => {
    let sim: Sim;
    sim = createSim(CAIRO, { heading: () => 70, external: (t) => flipped(sim, 0.5)(t) }, ANDROID);
    const ticks = run(sim, ANDROID, 3);
    // North comes from the readings after the glitch: right from the first heading.
    const first = ticks.find((k) => k.out?.ready)!;
    expect(first.t).toBeGreaterThan(0.5);
    expect(maxError(ticks, sim, first.t)).toBeLessThan(3);
  });

  it('a spot that stays that wrong still gets a north after 3 s, with its doubt', () => {
    let sim: Sim;
    sim = createSim(CAIRO, { heading: () => 70, external: (t) => flipped(sim, 99)(t) }, ANDROID);
    const ticks = run(sim, ANDROID, 5);
    expect(after(ticks, 0.5, 2.9).every((o) => !o.ready)).toBe(true);
    const first = ticks.find((k) => k.out?.ready)!;
    expect(first.t).toBeGreaterThan(3);
    expect(first.t).toBeLessThan(3.6);
    expect(first.out!.sigmaDeg).toBeGreaterThan(20);
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

  it('tracks the camera upright in camera mode', () => {
    const up = createSim(CAIRO, { heading: () => 200, pitch: () => 88 }, ANDROID);
    expect(maxError(run(up, ANDROID, 3, { mode: 'camera' }), up, 1, Infinity, 'camera')).toBeLessThan(3);
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

  it('follows a small, real change of north over the documented ~2 s time constant', () => {
    let sim: Sim;
    // The horizontal field turned by 5° at t = 5 s: within the gate, so followed, at the filter's own pace.
    const quiet: SensorModel = { platform: 'android', magNoise: 0.05, upNoiseDeg: 0.02, gyroNoise: 0.0002 };
    sim = createSim(
      CAIRO,
      {
        heading: () => 40,
        external: (t) => {
          if (t < 5) return [0, 0, 0];
          const e = sim.field;
          const d = (e.declination * Math.PI) / 180;
          const r = (5 * Math.PI) / 180;
          return [e.horizontalUt * (Math.sin(d + r) - Math.sin(d)), e.horizontalUt * (Math.cos(d + r) - Math.cos(d)), 0];
        },
      },
      quiet,
    );
    const ticks = run(sim, quiet, 12);
    const base = after(ticks, 4.5, 5).at(-1)!.flat;
    const moved = (o: EngineOutput) => Math.abs(((base - o.flat + 540) % 360) - 180);
    const t63 = ticks.find((k) => k.t >= 5 && k.out?.ready && moved(k.out) >= 0.632 * 5)!.t - 5;
    expect(t63).toBeGreaterThan(1.6);
    expect(t63).toBeLessThan(3.2);
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
    // While north is found again there is no heading, and it is not called steady.
    expect(after(ticks, 2.35, 2.6).every((o) => !o.ready && o.confidence === 'settling')).toBe(true);
    expect(after(ticks, 3.2).every((o) => o.ready && o.confidence === 'good')).toBe(true);
  });
});

describe('posture', () => {
  // A phone with a realistic calibration leftover: 8 µT of hard iron, a few percent of soft iron.
  const leftover: SensorModel = { ...ANDROID, magScale: [1.02, 0.98, 1.08] };
  const offset = () => [5, 4, -5] as const;
  const raisedFor = (from: number, to: number) => (t: number) =>
    t < from ? 0 : t < from + 1 ? 85 * (t - from) : t < to ? 85 : t < to + 1 ? 85 * (to + 1 - t) : 0;

  it('held up for 11 s and laid flat again: no warning, and the same heading as before', () => {
    const sim = createSim(CAIRO, { heading: () => 120, pitch: raisedFor(3, 15), deviceOffset: offset }, leftover);
    const ticks = run(sim, leftover, 20);
    expect(after(ticks, 1).some((o) => o.confidence !== 'good')).toBe(false);
    const before = after(ticks, 2, 3).at(-1)!.flat;
    const shift = (o: EngineOutput) => Math.abs(((o.flat - before + 540) % 360) - 180);
    // Passing through the half-raised postures nudges north a little even with this large a leftover; it settles back.
    for (const o of after(ticks, 16.2)) expect(shift(o)).toBeLessThan(2.5);
    for (const o of after(ticks, 19)) expect(shift(o)).toBeLessThan(1.2);
  });

  it('with an ordinary leftover (3 µT), the heading comes back where it was at once', () => {
    const model: SensorModel = { ...ANDROID, magScale: [1.03, 0.97, 1.03] };
    const sim = createSim(CAIRO, { heading: () => 120, pitch: raisedFor(3, 15), deviceOffset: () => [2, -1.5, 2.5] }, model);
    const ticks = run(sim, model, 18);
    const before = after(ticks, 2, 3).at(-1)!.flat;
    for (const o of after(ticks, 16.2)) expect(Math.abs(((o.flat - before + 540) % 360) - 180)).toBeLessThan(0.6);
  });

  it('the magnetometer is not listened to while the phone is up', () => {
    const sim = createSim(CAIRO, { heading: () => 120, pitch: raisedFor(3, 15), deviceOffset: offset }, leftover);
    const ticks = run(sim, leftover, 20);
    expect(after(ticks, 5, 14).every((o) => !o.debug.inPosture)).toBe(true);
    expect(after(ticks, 17).every((o) => o.debug.inPosture)).toBe(true);
  });

  it('opened upright, there is no heading until the phone lies flat', () => {
    const sim = createSim(CAIRO, { heading: () => 120, pitch: (t) => (t < 3 ? 85 : t < 4 ? 85 * (4 - t) : 0) }, ANDROID);
    const ticks = run(sim, ANDROID, 6);
    expect(after(ticks, 0.5, 3).every((o) => !o.ready)).toBe(true);
    // …but the tilt is known all along, so the screen can ask to lay the phone flat.
    for (const o of after(ticks, 0.5, 3)) expect(o.pitch).toBeGreaterThan(80);
    expect(after(ticks, 4.6).every((o) => o.ready)).toBe(true);
    expect(maxError(ticks, sim, 4.6)).toBeLessThan(3);
  });
});

describe('the raw compass (dev readout)', () => {
  it('reads the true heading like a plain compass app in a clean field', () => {
    const sim = createSim(CAIRO, { heading: () => 144 }, ANDROID);
    for (const o of after(run(sim, ANDROID, 3), 1)) {
      expect(headingError(o.debug.rawDeg, 144)).toBeLessThan(3);
      // Down from the platform's gravity or from the engine's tilt: the same answer when both are right.
      expect(headingError(o.debug.gravDeg, o.debug.rawDeg)).toBeLessThan(1);
    }
  });

  it('shows the turned field while Rafiq holds north against it', () => {
    let sim: Sim;
    sim = createSim(
      CAIRO,
      {
        heading: () => 40,
        external: (t) => {
          if (t < 3) return [0, 0, 0];
          const e = sim.field;
          const d = (e.declination * Math.PI) / 180;
          const r = (25 * Math.PI) / 180;
          return [e.horizontalUt * (Math.sin(d + r) - Math.sin(d)), e.horizontalUt * (Math.cos(d + r) - Math.cos(d)), 0];
        },
      },
      ANDROID,
    );
    const late = after(run(sim, ANDROID, 5), 4, 5);
    for (const o of late) {
      expect(headingError(o.flat, 40)).toBeLessThan(3); // Rafiq holds the true heading…
      expect(headingError(o.debug.rawDeg, 15)).toBeLessThan(3); // …while a plain compass follows the field, 25° round.
    }
  });
});

describe('posture, any direction', () => {
  it('held on its side, the tilt says so and north’s doubt grows while the magnetometer is not listened to', () => {
    const drifting: SensorModel = { ...ANDROID, gyroBias: [0, 0, 0.003] };
    const sim = createSim(CAIRO, { heading: () => 80, roll: (t) => (t < 2 ? 0 : t < 3 ? 60 * (t - 2) : 60) }, drifting);
    const ticks = run(sim, drifting, 60);
    const late = after(ticks, 55);
    expect(late.every((o) => o.tiltDeg > 55 && o.tiltDeg < 65)).toBe(true);
    expect(late.every((o) => !o.debug.inPosture)).toBe(true);
    expect(late.at(-1)!.sigmaDeg).toBeGreaterThan(3);
  });

  it('says which edge points up, for the lay-flat ghost', () => {
    const edge = (script: Script) => {
      const sim = createSim(CAIRO, script, ANDROID);
      const outs = after(run(sim, ANDROID, 1.5), 1);
      return outs[outs.length - 1].edgeUpDeg;
    };
    expect(edge({ heading: () => 0, pitch: () => 80 })).toBeCloseTo(0, 0); // top edge up
    expect(Math.abs(edge({ heading: () => 0, pitch: () => -80 }))).toBeGreaterThan(178); // tipped toward the user
    expect(edge({ heading: () => 0, roll: () => 70 })).toBeCloseTo(-90, 0); // right side down: left edge up
    expect(edge({ heading: () => 0, roll: () => -70 })).toBeCloseTo(90, 0); // right edge up
  });

  it('the room is judged even while the phone is up: walking away from a laptop clears the warning', () => {
    const sim = createSim(
      CAIRO,
      {
        heading: () => 120,
        pitch: (t) => (t < 6 ? 0 : t < 7 ? 80 * (t - 6) : 80),
        external: (t) => (t >= 3 && t < 9 ? [8, 6.7, -37.1] : [0, 0, 0]),
      },
      ANDROID,
    );
    const ticks = run(sim, ANDROID, 13);
    expect(after(ticks, 4.5, 6).every((o) => o.confidence === 'interference')).toBe(true);
    // Still held up, the laptop gone at 9 s: cleared within the shape watch's 1.5 s.
    expect(after(ticks, 10.8, 13).every((o) => o.confidence !== 'interference' && !o.debug.inPosture)).toBe(true);
  });

  it('face down counts as raised', () => {
    const sim = createSim(CAIRO, { heading: () => 80, roll: () => 180 }, ANDROID);
    expect(after(run(sim, ANDROID, 2), 0.5).every((o) => o.tiltDeg > 170)).toBe(true);
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

  it('a location update while the warning shows does not blink it off', () => {
    const sim = createSim(CAIRO, { heading: () => 120, external: laptop(3, 12) }, ANDROID);
    const ticks = run(sim, ANDROID, 10, { at: 5.5, then: (e) => e.setModel(sim.field) });
    expect(after(ticks, 5, 10).every((o) => o.confidence === 'interference')).toBe(true);
  });

  // The field scaled by k along its own direction: stronger or weaker, pointing the same way.
  const scaledBy = (sim: () => Sim, k: number) => () => {
    const e = sim().field;
    const h = e.horizontalUt * (k - 1);
    const v = e.totalUt * Math.sin((e.dipDeg * Math.PI) / 180) * (k - 1);
    const d = (e.declination * Math.PI) / 180;
    return [h * Math.sin(d), h * Math.cos(d), -v] as const;
  };

  it('a desk with a charging cable (the field ×1.5) is reported: that much extra field cannot be told from one that bends the heading', () => {
    let sim: Sim;
    sim = createSim(CAIRO, { heading: (t) => 60 + 30 * Math.sin(t), external: scaledBy(() => sim, 1.5) }, ANDROID);
    const ticks = run(sim, ANDROID, 6);
    expect(after(ticks, 2).every((o) => o.confidence === 'interference')).toBe(true);
  });

  it('a field within ±15 % of the model is never reported', () => {
    for (const k of [0.86, 1.15]) {
      let sim: Sim;
      sim = createSim(CAIRO, { heading: (t) => 60 + 30 * Math.sin(t), external: scaledBy(() => sim, k) }, ANDROID);
      const ticks = run(sim, ANDROID, 8);
      expect(after(ticks, 0).some((o) => o.confidence === 'interference')).toBe(false);
    }
  });

  it('a weak spot (72 % strength, dip 10° shallow, as measured by a desk) is reported though neither sign alone is far off', () => {
    // A world-fixed field that leaves 72 % of the strength at a 35° dip, as the S24 read there.
    let sim: Sim;
    sim = createSim(
      CAIRO,
      {
        heading: () => 290,
        external: () => {
          const e = sim.field;
          const target = 0.72 * e.totalUt;
          const dip = (35 * Math.PI) / 180;
          const d = (e.declination * Math.PI) / 180;
          const h0 = e.horizontalUt;
          const v0 = e.totalUt * Math.sin((e.dipDeg * Math.PI) / 180);
          const h1 = target * Math.cos(dip);
          const v1 = target * Math.sin(dip);
          return [(h1 - h0) * Math.sin(d), (h1 - h0) * Math.cos(d), -(v1 - v0)] as const;
        },
      },
      ANDROID,
    );
    const ticks = run(sim, ANDROID, 4);
    expect(after(ticks, 1.6).every((o) => o.confidence === 'interference')).toBe(true);
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
    // North learned before the platform vouched for its calibration is never called steady…
    expect(after(ticks, 0, 4).some((o) => o.confidence === 'good')).toBe(false);
    expect(after(ticks, 1.2, 4).every((o) => o.confidence === 'calibrate')).toBe(true);
    // …the card goes the moment the accuracy rises, and north is taken again from the next readings.
    expect(after(ticks, 4.05).some((o) => o.confidence === 'calibrate')).toBe(false);
    expect(after(ticks, 4.3).every((o) => o.confidence === 'good')).toBe(true);
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
    // No warning after the calibration; `good` comes back as soon as a calibrated reading is taken in
    // posture, and the north it shows is the corrected one, never the one learned before.
    expect(after(ticks, 6.1).some((o) => o.confidence === 'calibrate' || o.confidence === 'interference')).toBe(false);
    // (While the phone is still being waved fast, a reading carries the turn rate's doubt, so the
    // fresh north is called steady once the waving stops at 8 s.)
    const good = ticks.find((k) => k.t >= 6 && k.out?.confidence === 'good')!;
    expect(good.t).toBeLessThan(8.5);
    expect(maxError(ticks, sim, good.t)).toBeLessThan(3);
  });

  // A bent floor: the horizontal field turned by 25° from t = 3, its size and dip unchanged.
  const bentFloor = (sim: () => Sim) => (t: number) => {
    if (t < 3) return [0, 0, 0] as const;
    const e = sim().field;
    const d = (e.declination * Math.PI) / 180;
    const r = (25 * Math.PI) / 180;
    return [e.horizontalUt * (Math.sin(d + r) - Math.sin(d)), e.horizontalUt * (Math.cos(d + r) - Math.cos(d)), 0] as const;
  };

  it('a recalibration while the field is bent does not hand north to the bent field', () => {
    let sim: Sim;
    sim = createSim(CAIRO, { heading: () => 40, external: bentFloor(() => sim), biasEpoch: (t) => (t < 3.4 ? 0 : 1) }, ANDROID);
    const ticks = run(sim, ANDROID, 6);
    expect(maxError(ticks, sim, 3, 5)).toBeLessThan(3);
    expect(after(ticks, 5.3, 6).every((o) => o.confidence === 'interference')).toBe(true);
  });

  it('an accuracy flapping between 2 and 3 hands nothing over either', () => {
    let sim: Sim;
    sim = createSim(
      CAIRO,
      { heading: () => 40, external: bentFloor(() => sim), magAccuracy: (t) => (Math.floor(t * 2) % 2 ? 3 : 2) },
      ANDROID,
    );
    const ticks = run(sim, ANDROID, 6);
    expect(maxError(ticks, sim, 3, 5)).toBeLessThan(3);
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

describe('a gyroscope but no fused gravity', () => {
  it('the hand’s own acceleration does not tilt the compass', () => {
    const model: SensorModel = { platform: 'android', rawAccel: true };
    // A sideways sway (2.5 m/s² at 1 Hz) barely changes |a|, so no reject rule sees it: the gyroscope must carry the tilt.
    const sim = createSim(
      CAIRO,
      { heading: () => 136, handAccel: (t) => [2.5 * Math.sin(2 * Math.PI * t), 1.5 * Math.cos(2 * Math.PI * t), 0] },
      model,
    );
    expect(maxError(run(sim, model, 8), sim, 3)).toBeLessThan(4);
    // Sharp shoves (4 m/s² for 0.2 s) are rejected outright.
    const shoved = createSim(CAIRO, { heading: () => 136, handAccel: (t) => (t % 1 < 0.2 ? [4, 2, 0] : [0, 0, 0]) }, model);
    expect(maxError(run(shoved, model, 8), shoved, 3)).toBeLessThan(3);
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
