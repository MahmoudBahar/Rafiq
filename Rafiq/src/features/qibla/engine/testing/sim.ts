// A physics simulator for the engine's tests: a scripted phone in the
// Earth's field (from the WMM at given coordinates), seen through sensors
// with the errors real phones have, delivered the way each platform does.
// Test-only: nothing in the app imports it.

import { DEG, normalizeDeg } from '../angles';
import { earthField, type EarthField } from '../geomag';
import type { MotionBatch } from '../stream';
import type { Coords } from '../types';
import { qAxisAngle, qConj, qMul, qNormalize, qRotate, qYaw, type Quat, type Vec3 } from '../vec';

export interface Script {
  /** Azimuth of the top edge, degrees clockwise from TRUE north, at time t (s). */
  heading: (t: number) => number;
  /** Top edge raised above the horizontal, degrees (90 upright). */
  pitch?: (t: number) => number;
  /** Right side down, degrees. */
  roll?: (t: number) => number;
  /** An extra field fixed in the world (steel, a laptop), µT, east/north/up, at time t. */
  external?: (t: number) => Vec3;
  /** An offset riding on the phone (uncompensated bias, a magnetic case), µT, device frame. */
  deviceOffset?: (t: number) => Vec3;
  /** The platform's bias-estimate counter at time t. */
  biasEpoch?: (t: number) => number;
  /** The platform's magnetometer accuracy at time t. */
  magAccuracy?: (t: number) => number;
  /** Gyro silent (no samples) when this returns true. */
  gyroSilent?: (t: number) => boolean;
}

export interface SensorModel {
  platform: 'android' | 'ios';
  /** Constant gyro bias, rad/s, device frame. */
  gyroBias?: Vec3;
  /** Gyro scale error (0.01 = reads 1 % fast). */
  gyroScale?: number;
  /** Gyro white noise, rad/s per sample. */
  gyroNoise?: number;
  /** Magnetometer white noise, µT per axis per sample. */
  magNoise?: number;
  /** Residual tilt error of the platform's gravity, degrees (white). */
  upNoiseDeg?: number;
  /** A scale error of the calibrated magnetometer along each device axis (soft iron left over). */
  magScale?: Vec3;
  /** Without a gyroscope: the up stream is the raw accelerometer, hand acceleration included. */
  noGyro?: boolean;
  /** Seed for the noise. */
  seed?: number;
}

export interface Sim {
  field: EarthField;
  /** True orientation (device → true-north world) at time t. */
  truth(t: number): Quat;
  /** True heading of the top edge and of the camera. */
  trueHeading(t: number): number;
  /** The batches the native module would deliver over [from, to), each with its delivery time (script seconds). */
  batches(from: number, to: number): { at: number; batch: MotionBatch }[];
}

const DT_FAST = 0.01;
const DT_MAG = 0.02;
const BATCH_S = 1 / 60;
/** Sensor-clock origin: phones report seconds since boot. */
export const T0 = 1000;

/** Mulberry32: a small, seedable PRNG, so a failing test fails the same way every run. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSim(coords: Coords, script: Script, model: SensorModel, date = new Date('2026-10-01T12:00:00Z')): Sim {
  const field = earthField(coords, date);
  const random = rng(model.seed ?? 1);
  const gauss = () => {
    const u = Math.max(1e-12, random());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
  };
  // Earth's field in the true world frame: horizontal toward magnetic north (azimuth = declination), dipping down.
  const h = field.horizontalUt;
  const v = field.totalUt * Math.sin(field.dipDeg * DEG);
  const earth: Vec3 = [h * Math.sin(field.declination * DEG), h * Math.cos(field.declination * DEG), -v];

  function truth(t: number): Quat {
    const yaw = qYaw(-script.heading(t) * DEG);
    const pitch = qAxisAngle([1, 0, 0], (script.pitch?.(t) ?? 0) * DEG);
    const roll = qAxisAngle([0, 1, 0], (script.roll?.(t) ?? 0) * DEG);
    return qNormalize(qMul(qMul(yaw, pitch), roll));
  }

  function bodyRate(t: number): Vec3 {
    const e = 1e-4;
    const d = qMul(qConj(truth(t - e)), truth(t + e));
    const s = d[3] < 0 ? -1 : 1;
    return [(s * 2 * d[0]) / (2 * e), (s * 2 * d[1]) / (2 * e), (s * 2 * d[2]) / (2 * e)];
  }

  function gyroAt(t: number): Vec3 {
    const w = bodyRate(t);
    const k = 1 + (model.gyroScale ?? 0);
    const b = model.gyroBias ?? [0, 0, 0];
    const n = model.gyroNoise ?? 0.002;
    return [w[0] * k + b[0] + n * gauss(), w[1] * k + b[1] + n * gauss(), w[2] * k + b[2] + n * gauss()];
  }

  function upAt(t: number): Vec3 {
    const q = truth(t);
    const up = qRotate(qConj(q), [0, 0, 1]);
    const e = (model.upNoiseDeg ?? 0.2) * DEG;
    const tilted = qRotate(qAxisAngle([1, 0, 0], e * gauss()), qRotate(qAxisAngle([0, 1, 0], e * gauss()), up));
    if (!model.noGyro) return tilted;
    // The raw accelerometer: gravity's reaction plus whatever the hand adds (here, none beyond noise).
    return [tilted[0] * 9.80665 + 0.05 * gauss(), tilted[1] * 9.80665 + 0.05 * gauss(), tilted[2] * 9.80665 + 0.05 * gauss()];
  }

  function magAt(t: number): Vec3 {
    const q = truth(t);
    const ext = script.external?.(t) ?? [0, 0, 0];
    const world: Vec3 = [earth[0] + ext[0], earth[1] + ext[1], earth[2] + ext[2]];
    const dev = qRotate(qConj(q), world);
    const off = script.deviceOffset?.(t) ?? [0, 0, 0];
    const sc = model.magScale ?? [1, 1, 1];
    const n = model.magNoise ?? 0.4;
    return [dev[0] * sc[0] + off[0] + n * gauss(), dev[1] * sc[1] + off[1] + n * gauss(), dev[2] * sc[2] + off[2] + n * gauss()];
  }

  function trueHeading(t: number): number {
    return normalizeDeg(script.heading(t));
  }

  function batches(from: number, to: number): { at: number; batch: MotionBatch }[] {
    const out: { at: number; batch: MotionBatch }[] = [];
    const ios = model.platform === 'ios';
    // Sample schedules (seconds of script time). Android streams are offset and jittered against each other.
    const fastTimes: number[] = [];
    for (let t = Math.ceil(from / DT_FAST) * DT_FAST; t < to; t += DT_FAST) fastTimes.push(t);
    const magTimes: number[] = [];
    for (let t = Math.ceil(from / DT_MAG) * DT_MAG; t < to; t += DT_MAG) magTimes.push(ios ? t : t + 0.007);
    const jitter = () => (ios ? 0 : (random() - 0.5) * 0.002);
    const gyro = model.noGyro ? [] : fastTimes.filter((t) => !script.gyroSilent?.(t)).map((t) => t + jitter());
    const up = fastTimes.map((t) => (ios ? t : t + 0.003 + jitter()));
    // Delivery: Android's sensors each arrive a few ms late; a batch carries what has arrived.
    const latency = ios ? 0.002 : 0.006;
    let gi = 0;
    let ui = 0;
    let mi = 0;
    for (let b = from + BATCH_S; b < to + BATCH_S; b += BATCH_S) {
      const batch: MotionBatch = {
        up: [],
        gyro: [],
        mag: [],
        magAccuracy: script.magAccuracy?.(b) ?? 3,
        biasEpoch: script.biasEpoch?.(b) ?? 0,
        dropped: 0,
      };
      while (gi < gyro.length && gyro[gi] + latency <= b) {
        const t = gyro[gi++];
        batch.gyro.push(T0 + t, ...gyroAt(t));
      }
      while (ui < up.length && up[ui] + latency <= b) {
        const t = up[ui++];
        batch.up.push(T0 + t, ...upAt(t));
      }
      while (mi < magTimes.length && magTimes[mi] + latency <= b) {
        const t = magTimes[mi++];
        // Like the native module: CoreMotion's field is not sent while it is uncalibrated.
        if (ios && (script.magAccuracy?.(t) ?? 3) === 0) continue;
        batch.mag.push(T0 + t, ...magAt(t));
      }
      out.push({ at: b, batch });
    }
    return out;
  }

  return { field, truth, trueHeading, batches };
}

/** Degrees between two headings, unsigned. */
export function headingError(a: number, b: number): number {
  const d = Math.abs(normalizeDeg(a - b));
  return d > 180 ? 360 - d : d;
}

