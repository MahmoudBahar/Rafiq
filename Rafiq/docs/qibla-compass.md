# The Qibla compass: how the current code works

Branch `feature/qibla-mag-truth`, 2026-09-28. Every code block below is the file as it is on the branch (generated, not retyped).

## 1. The idea in one sentence

**The magnetometer, tilt-corrected by gravity, decides where north is; the phone's fused rotation sensor is only allowed to say how fast the phone is turning; everything is checked against what Earth's field should look like at the user's coordinates.**

The previous version let the phone's fused sensor decide north. On a Samsung S24 Ultra it sat 145° wrong for over a minute on a still desk while reporting accuracy 3, and snapped to the right value only when another app (Samsung's compass) re-registered the sensors. The log of that episode is in the session notes; this document describes the code that replaced it.

## 2. The sensors and the APIs

| API we call | Library | What the phone puts behind it | What we get | Rate | What we trust it for |
|---|---|---|---|---|---|
| `Magnetometer.addListener` | expo-sensors | Android `TYPE_MAGNETIC_FIELD` (calibrated); iOS CoreMotion calibrated field | the magnetic field as `{x, y, z}` in µT, device frame | 20 Hz | **where north is** (its direction) and the field's size |
| `DeviceMotion.addListener` → `accelerationIncludingGravity` | expo-sensors | accelerometer (Android, m/s²); CoreMotion gravity + user acceleration (iOS, g) | which way is **down**, `{x, y, z}`, device frame (z ≈ −9.8 flat, face up) | 30 Hz | tilt-correcting the compass; pitch; the field's dip |
| `DeviceMotion.addListener` → `rotation` | expo-sensors | Android `TYPE_ROTATION_VECTOR`; iOS CoreMotion attitude in the magnetic-north frame | three angles `{alpha, beta, gamma}` (radians): the phone's full orientation as the **phone's fusion** sees it | 30 Hz | **only how much it turned since the last sample** — never its absolute heading |
| `Location.watchHeadingAsync` | expo-location | Android: accelerometer + magnetometer, flat only; iOS: CoreLocation heading | `magHeading`, `trueHeading` (−1 when unknown), `accuracy` 0–3 | on ≥2° change (Android) | declination (`true − mag`), and the accuracy flag as a *hint* |
| `geomagnetism` `model(date).point([lat, lon])` | npm, offline (WMM2025) | none: a formula | `decl` (declination), `f` (field strength, nT), `incl` (dip) for the coordinates | once per location | declination fallback; the expected field to judge the measured one against |
| `adhan` `Qibla(coords)` | npm, offline | none: a formula | the great-circle bearing to the Kaaba, degrees from true north | once per location | the target the mat points at |

Device frame everywhere: X to the right of the screen, Y up the screen (toward the top edge), Z out of the screen toward the user.

## 3. The flow

```
                 ┌────────────────────────────── per DeviceMotion sample (30 Hz) ──────────────────────────────┐
 Magnetometer ───┤ r.mag (latest field)                                                                        │
                 │        │                                                                                    │
 DeviceMotion ───┤ down ──┼──▶ headingsFromField(mag, down) ──▶ flat / camera heading (magnetic) ──┐          │
   (gravity)     │        │                                     pitch                               │          │
                 │        └──▶ dipDeg(mag, down), |mag| ──▶ fieldWatch vs WMM ──▶ fieldAnomaly       │          │
                 │                                                                                  ▼          │
 DeviceMotion ───┤ rotation ──▶ toW3C ──▶ headingsFromAttitude ──▶ fused heading ──▶ fuser.push(compass, fused)│
   (fused)       │                                                  (only its change is used)        │          │
                 │                                                                                   ▼          │
                 │                                             magneticToTrue(…, declination) ──▶ target (SV)  │
                 └───────────────────────────────────────────────────────────────────────────────────────────────┘
 Location.watchHeadingAsync ──▶ declination = true − mag (else WMM) ; accuracy flag
 adhan Qibla(coords) ──▶ bearing (SV)

 UI thread, every frame:  heading += (target − heading) · pull ;  delta = shortestDelta(bearing, heading)
                          band (far / near / locked, with hysteresis) ──▶ lockT, edgeT, haptic lock(), hint text
 Confidence tick (4 Hz):  confidence(coords, sensors, fieldAnomaly, jump, accuracy, stableForMs) ──▶ pill + cards
```

Everything from `Magnetometer` to `target` runs on the JS thread in `useQibla`. From `target` onward it runs on the UI thread (Reanimated), so the mat's rotation never waits for React.

## 4. The engine (pure functions, `src/features/qibla/engine/`, tested with vitest)

### 4.1 `bearing.ts` — where the Kaaba is

`adhan`'s `Qibla` gives the initial great-circle bearing from the user's coordinates, degrees clockwise from **true** north. Cairo → 136.14°.

**`src/features/qibla/engine/bearing.ts`**

```ts
import { Coordinates, Qibla } from 'adhan';
import { distanceKm } from '@/features/prayer/engine/cities';
import { normalizeDeg } from './smooth';
import type { Coords } from './types';

/** The Kaaba (WGS84). */
export const KAABA: Coords = { latitude: 21.4225241, longitude: 39.8261818 };

/**
 * Initial great-circle bearing from `coords` to the Kaaba, degrees clockwise
 * from true north in [0, 360). Never a rhumb line: over long distances the two
 * differ by tens of degrees.
 */
export function qiblaBearing(coords: Coords): number {
  return normalizeDeg(Qibla(new Coordinates(coords.latitude, coords.longitude)));
}

export function distanceToMeccaKm(coords: Coords): number {
  return distanceKm(coords, KAABA);
}
```

### 4.2 `declination.ts` — magnetic north vs true north, and the expected field

A compass points to magnetic north; the bearing is from true north. The difference (declination) is +4.8° in Cairo. First choice: the platform's own `trueHeading − magHeading`; fallback: the WMM. `expectedField` gives the field the magnetometer *should* measure here (44 µT, dipping 45°), used by the field watch.

**`src/features/qibla/engine/declination.ts`**

```ts
import { model } from 'geomagnetism';
import { normalizeDeg, shortestDelta } from './smooth';
import type { Coords } from './types';

/**
 * Declination as the platform sees it: its true heading less its magnetic
 * one. Null when it reports no true heading (-1: Android before a location
 * fix, or with location denied).
 */
export function declinationFromHeading(trueHeading: number, magHeading: number): number | null {
  if (trueHeading < 0) return null;
  return shortestDelta(trueHeading, magHeading);
}

/** Declination from the World Magnetic Model (east positive); falls back to the nearest model outside its years. */
export function declinationFromModel(coords: Coords, date: Date): number {
  return model(date, { allowOutOfBoundsModel: true }).point([coords.latitude, coords.longitude]).decl;
}

/** What the Earth's field should measure here: total strength (µT) and dip below the horizontal. */
export function expectedField(coords: Coords, date: Date): { magnitudeUt: number; dipDeg: number } {
  const p = model(date, { allowOutOfBoundsModel: true }).point([coords.latitude, coords.longitude]);
  return { magnitudeUt: p.f / 1000, dipDeg: p.incl };
}

export function magneticToTrue(magHeading: number, declination: number): number {
  return normalizeDeg(magHeading + declination);
}
```

### 4.3 `field.ts` — the compass itself

Two known directions in the device frame, *down* (gravity) and *north* (the field with its vertical part removed), fix the phone's whole orientation. From them the earth axes east/north/up are written in device coordinates, and any device axis can be asked where it points: the top edge (`flatHeading`, the dial) or the back camera (`cameraHeading`, the camera page). `dipDeg` is the field's angle below the horizontal, independent of how the phone is held.

**`src/features/qibla/engine/field.ts`**

```ts
import type { Headings } from './attitude';
import { normalizeDeg } from './smooth';

export type Vec3 = readonly number[];

const RAD = 180 / Math.PI;
/** Below this much horizontal reach the top of the phone has no heading of its own. */
const FLAT_MIN_HORIZONTAL = 0.2;
const EPS = 1e-9;

/**
 * The compass the way a compass app does it: north from the magnetometer,
 * tilt-corrected by where gravity points. Both vectors are in the device
 * frame (X right, Y up the screen, Z out of the screen); `down` is where
 * gravity points, as expo's accelerationIncludingGravity reports it on
 * Android (z ≈ -9.8 face up, flat).
 *
 * Two known directions, down and north, fix the phone's whole orientation:
 * from them the earth-frame axes east / north / up are written in device
 * coordinates, and any device axis can be asked where it points: the top
 * (the dial, held flat) or the back camera (held up). The fused rotation
 * sensor is not consulted for north at all: on a Samsung it sat 145° off for
 * a minute on a still desk while its accuracy read 3.
 */
export function headingsFromField(mag: Vec3, down: Vec3): Headings {
  const up = unit([-down[0], -down[1], -down[2]]);
  // Horizontal part of the field: what is left after removing its vertical component.
  const vertical = dot(mag, up);
  const north = unit([mag[0] - vertical * up[0], mag[1] - vertical * up[1], mag[2] - vertical * up[2]]);
  const east = cross(north, up);

  // Each earth axis, expressed in device coordinates, gives that axis's
  // component of every device axis: device +Y is (east.y, north.y, up.y).
  const cameraHeading = headingOf(-east[2], -north[2]);
  const reach = Math.hypot(east[1], north[1]);
  const flatHeading = reach < FLAT_MIN_HORIZONTAL ? cameraHeading : headingOf(east[1], north[1]);
  const pitch = Math.asin(Math.max(-1, Math.min(1, up[1]))) * RAD;
  return { flatHeading, cameraHeading, pitch };
}

/** The field's angle below the horizontal, degrees: ~45° in Cairo whatever the phone's posture. */
export function dipDeg(mag: Vec3, down: Vec3): number {
  const m = Math.hypot(mag[0], mag[1], mag[2]);
  const d = Math.hypot(down[0], down[1], down[2]);
  if (m < EPS || d < EPS) return 0;
  return Math.asin(Math.max(-1, Math.min(1, dot(mag, down) / (m * d)))) * RAD;
}

function headingOf(east: number, north: number): number {
  return normalizeDeg(Math.atan2(east, north) * RAD);
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function unit(v: Vec3): [number, number, number] {
  const n = Math.hypot(v[0], v[1], v[2]);
  return n < EPS ? [0, 0, 0] : [v[0] / n, v[1] / n, v[2] / n];
}
```

### 4.4 `attitude.ts` — reading the fused sensor

Still used, but only to turn the fused sensor's three angles into a heading whose *change* feeds the fuser. `toW3C` maps each platform's angle conventions to one convention (Android needs nothing; iOS yaw is a quarter turn off). The Android convention was pinned with three recorded phone postures (see `attitude.test.ts`).

**`src/features/qibla/engine/attitude.ts`**

```ts
import { normalizeDeg } from './smooth';

/** DeviceMotion's `rotation`, radians. */
export interface Rotation {
  alpha: number;
  beta: number;
  gamma: number;
}

export type AttitudePlatform = 'ios' | 'android';

export interface Headings {
  /** Where the top of the phone points, magnetic, degrees clockwise from north. */
  flatHeading: number;
  /** Where the back camera points, magnetic. */
  cameraHeading: number;
  /** How far the top of the phone is raised above the horizontal: 0 flat, 90 upright. */
  pitch: number;
}

const RAD = 180 / Math.PI;
/** Below this much horizontal reach the top of the phone has no heading of its own. */
const FLAT_MIN_HORIZONTAL = 0.2;

/**
 * Brings a platform's rotation into the W3C deviceorientation convention the
 * maths below assumes: alpha counter-clockwise about Z from magnetic north
 * (0 = top of the phone to north), beta about X (90 = upright), gamma about Y.
 *
 * Android's expo-sensors already negates the azimuth and pitch it gets from
 * `SensorManager.getOrientation`, which lands on that convention. iOS reports
 * CoreMotion's attitude in the X-magnetic-north frame: yaw 0 means the
 * device's X axis (its right edge) points north, a quarter turn from alpha.
 * The gamma sign per platform is pinned by the device spike.
 */
export function toW3C(r: Rotation, platform: AttitudePlatform): Rotation {
  if (platform === 'ios') return { alpha: r.alpha + Math.PI / 2, beta: r.beta, gamma: r.gamma };
  return r;
}

/**
 * The two headings and the pitch from a W3C rotation. The full rotation matrix
 * R = Rz(alpha) · Rx(beta) · Ry(gamma) maps device axes into the earth frame
 * (x east, y north, z up); the device's +Y axis (its top) and −Z axis (its
 * back camera) are read off it. Going through the matrix, rather than the raw
 * alpha, keeps the answer continuous when the phone is raised upright, where
 * the Euler angles themselves swing about.
 */
export function headingsFromAttitude({ alpha, beta, gamma }: Rotation): Headings {
  const ca = Math.cos(alpha);
  const sa = Math.sin(alpha);
  const cb = Math.cos(beta);
  const sb = Math.sin(beta);
  const cg = Math.cos(gamma);
  const sg = Math.sin(gamma);

  // Columns of R: the device axes in the earth frame.
  const yAxis = { x: -sa * cb, y: ca * cb, z: sb };
  const zAxis = { x: ca * sg + sa * sb * cg, y: sa * sg - ca * sb * cg, z: cb * cg };

  const cameraHeading = headingOf(-zAxis.x, -zAxis.y);
  const reach = Math.hypot(yAxis.x, yAxis.y);
  const flatHeading = reach < FLAT_MIN_HORIZONTAL ? cameraHeading : headingOf(yAxis.x, yAxis.y);
  const pitch = Math.asin(Math.max(-1, Math.min(1, yAxis.z))) * RAD;
  return { flatHeading, cameraHeading, pitch };
}

function headingOf(east: number, north: number): number {
  return normalizeDeg(Math.atan2(east, north) * RAD);
}
```

### 4.5 `fuse.ts` — compass truth, fused motion

Each sample: move by how much the fused heading changed (its motion is excellent even when its absolute value is wrong), then pull 5 % of the way toward the compass heading. A gap closes in about a second at 30 Hz, so the fused sensor's drift never accumulates. A step over 45° in one sample cannot be a hand turning; it is the phone resetting its fusion, and is ignored.

**`src/features/qibla/engine/fuse.ts`**

```ts
import { shortestDelta } from './smooth';

/** Pull toward the compass per push (~30 Hz): about a second to close a gap. */
export const FUSE_GAIN = 0.05;
/** A fused step this large in one sample is no turn of the hand: the fusion reset itself. */
export const RESET_STEP_DEG = 45;

export interface HeadingFuser {
  /**
   * Feed the compass truth and the fused sensor's current heading; returns
   * the heading to show, unwrapped (it runs past 360 rather than wrapping).
   */
  push(magHeading: number, fusedHeading: number): number;
  reset(): void;
}

/**
 * The compass says where north is; the fused rotation sensor says how the
 * phone is turning. The output moves by the fused sensor's motion, sample to
 * sample, and is pulled back onto the compass a little every sample, so the
 * fused sensor's drift never accumulates and its absolute heading never
 * matters. It starts on the compass.
 */
export function createHeadingFuser(): HeadingFuser {
  let heading: number | null = null;
  let lastFused = 0;
  return {
    push(magHeading, fusedHeading) {
      if (heading === null) {
        heading = magHeading;
        lastFused = fusedHeading;
        return heading;
      }
      let step = shortestDelta(fusedHeading, lastFused);
      lastFused = fusedHeading;
      if (Math.abs(step) > RESET_STEP_DEG) step = 0;
      heading += step;
      heading += FUSE_GAIN * shortestDelta(magHeading, heading);
      return heading;
    },
    reset() {
      heading = null;
    },
  };
}
```

### 4.6 `smooth.ts` — angle helpers and the stillness watch

`normalizeDeg` / `shortestDelta` / `unwrap` are also worklets so the UI thread runs the same tested maths. `createStillness` says whether the heading has held still for a second and catches a sudden leap from a still heading (something magnetic came close).

**`src/features/qibla/engine/smooth.ts`**

```ts
// The angle helpers are worklets too: the UI thread runs the same tested
// maths rather than a second copy of it.

/** Any angle into [0, 360). */
export function normalizeDeg(deg: number): number {
  'worklet';
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

/** Signed turn from `heading` to `bearing`, the short way: (-180, 180]. Positive = turn right. */
export function shortestDelta(bearing: number, heading: number): number {
  'worklet';
  const d = normalizeDeg(bearing - heading);
  return d > 180 ? d - 360 : d;
}

/**
 * `next` shifted by whole turns so it lies within a half turn of `prev`. A
 * value smoothed toward the unwrapped target never spins the long way round
 * across the 0/360 seam.
 */
export function unwrap(prev: number, next: number): number {
  return next + 360 * Math.round((prev - next) / 360);
}

export interface StillnessOptions {
  /** How long the heading must hold before it counts as still. */
  windowMs: number;
  /** Largest spread inside the window that still counts as still. */
  stableRangeDeg: number;
  /** A step this large from a still heading is a jump (something magnetic came close). */
  jumpDeg: number;
}

export interface StillnessReading {
  stable: boolean;
  /** True on the one sample that leapt from a still heading. */
  jump: boolean;
  /** How long the heading has been still, 0 when it is not. */
  stableForMs: number;
}

export interface Stillness {
  push(headingDeg: number, tMs: number): StillnessReading;
}

/** Tracks whether the heading is holding still, and catches sudden leaps while it is. */
export function createStillness({ windowMs, stableRangeDeg, jumpDeg }: StillnessOptions): Stillness {
  let samples: { t: number; h: number }[] = [];
  let stable = false;
  let stableSince = 0;

  return {
    push(headingDeg, tMs) {
      const last = samples[samples.length - 1];
      const h = last ? unwrap(last.h, headingDeg) : headingDeg;
      const jump = stable && last !== undefined && Math.abs(h - last.h) >= jumpDeg;
      if (jump) {
        samples = [];
        stable = false;
      }
      samples.push({ t: tMs, h });
      const cutoff = tMs - windowMs;
      while (samples.length > 1 && samples[0].t < cutoff) samples.shift();

      let min = Infinity;
      let max = -Infinity;
      for (const s of samples) {
        if (s.h < min) min = s.h;
        if (s.h > max) max = s.h;
      }
      const filled = tMs - samples[0].t >= windowMs;
      const wasStable = stable;
      stable = filled && max - min <= stableRangeDeg;
      if (stable && !wasStable) stableSince = tMs;
      return { stable, jump, stableForMs: stable ? tMs - stableSince : 0 };
    },
  };
}
```

### 4.7 `confidence.ts` — one honest state, and the field watch

`confidence` folds the signals into one state, first match wins: `no-location`, `unavailable`, `interference`, `calibrate`, `settling`, `good`. `createFieldWatch` compares the measured field's **size and dip** with the WMM's values for the user's coordinates, with room for a phone's error (±50 % on size, ±12° on dip) and a one-second persistence so a passing excursion is ignored. Measured on the S24 Ultra: desk with a charging cable 65 µT / 43° (allowed, heading was right); desk corner by the laptop 78 µT / 61° (flagged, heading was wrong).

**`src/features/qibla/engine/confidence.ts`**

```ts
/**
 * The field the magnetometer should see is known from the World Magnetic
 * Model: in Cairo 44 µT, dipping 45° below the horizontal. Steel and magnets
 * change it; a charging cable lifts the magnitude a little without bending
 * the direction (a Samsung on a desk read 65 µT, dip 43°, with a correct
 * heading), while the same desk by a laptop read 78 µT at 61° with the
 * compass wrong. So both the size and the dip are judged, with room for a
 * phone's own error.
 */
export const FIELD_MAGNITUDE_TOLERANCE = 0.5;
export const FIELD_DIP_TOLERANCE_DEG = 12;
/** An abnormal field must hold this long before it counts: a passing excursion is noise. */
export const FIELD_PERSIST_MS = 1000;
/** With no accuracy from the platform, this long a still heading is trusted. */
export const SETTLE_MS = 3000;

export type Confidence = 'no-location' | 'unavailable' | 'interference' | 'calibrate' | 'settling' | 'good';

export interface ConfidenceInput {
  hasCoords: boolean;
  sensorsAvailable: boolean;
  /** The field has looked wrong for a while (see `createFieldWatch`). */
  fieldAnomaly: boolean;
  /** A leap from a still heading (see `createStillness`). */
  jump: boolean;
  /** The platform's compass accuracy 0–3; null or -1 when it gives none. */
  accuracy: number | null;
  stableForMs: number;
}

/** Folds the sensor signals into one state, first match wins. */
export function confidence(i: ConfidenceInput): Confidence {
  if (!i.hasCoords) return 'no-location';
  if (!i.sensorsAvailable) return 'unavailable';
  if (i.jump || i.fieldAnomaly) return 'interference';
  if (i.accuracy !== null && i.accuracy >= 0) return i.accuracy <= 1 ? 'calibrate' : 'good';
  return i.stableForMs >= SETTLE_MS ? 'good' : 'settling';
}

export interface FieldShape {
  magnitudeUt: number;
  dipDeg: number;
}

export interface FieldWatch {
  /** Feed the measured field; true once it has looked wrong for `FIELD_PERSIST_MS`. */
  push(measured: FieldShape, tMs: number): boolean;
}

/** Watches the field for a sustained departure from what the model says the Earth gives here. */
export function createFieldWatch(expected: FieldShape): FieldWatch {
  let outSince: number | null = null;
  return {
    push(measured, tMs) {
      const sizeOff = Math.abs(measured.magnitudeUt - expected.magnitudeUt) / expected.magnitudeUt;
      const dipOff = Math.abs(measured.dipDeg - expected.dipDeg);
      const out = sizeOff > FIELD_MAGNITUDE_TOLERANCE || dipOff > FIELD_DIP_TOLERANCE_DEG;
      if (!out) {
        outSince = null;
        return false;
      }
      if (outSince === null) outSince = tMs;
      return tMs - outSince >= FIELD_PERSIST_MS;
    },
  };
}
```

### 4.8 `band.ts` — far / near / locked

Locked inside 3°, held out to 4° so the edge does not flicker, "near" inside 10°.

**`src/features/qibla/engine/band.ts`**

```ts
/** Inside this the heading counts as on the Qibla. */
export const LOCK_ENTER_DEG = 3;
/** Once locked it holds out to here, so the edge does not flicker. */
export const LOCK_LEAVE_DEG = 4;
/** Inside this the visuals begin to warm. */
export const NEAR_DEG = 10;

export type Band = 'far' | 'near' | 'locked';

/** Which band a signed delta (bearing − heading) falls in, given the band it was in. */
export function bandFor(deltaDeg: number, prev: Band): Band {
  const a = Math.abs(deltaDeg);
  if (a <= (prev === 'locked' ? LOCK_LEAVE_DEG : LOCK_ENTER_DEG)) return 'locked';
  return a <= NEAR_DEG ? 'near' : 'far';
}
```

### 4.9 `index.ts` — the facade

UI code imports only from here; `adhan` and `geomagnetism` never appear outside the engine.

**`src/features/qibla/engine/index.ts`**

```ts
/**
 * Qibla engine: pure functions, no React, no native modules. UI code imports
 * from here and never from `adhan` or `geomagnetism` directly.
 */
export { headingsFromAttitude, toW3C, type AttitudePlatform, type Headings, type Rotation } from './attitude';
export { LOCK_ENTER_DEG, LOCK_LEAVE_DEG, NEAR_DEG, bandFor, type Band } from './band';
export { KAABA, distanceToMeccaKm, qiblaBearing } from './bearing';
export {
  FIELD_DIP_TOLERANCE_DEG,
  FIELD_MAGNITUDE_TOLERANCE,
  FIELD_PERSIST_MS,
  SETTLE_MS,
  confidence,
  createFieldWatch,
  type Confidence,
  type ConfidenceInput,
  type FieldShape,
  type FieldWatch,
} from './confidence';
export { declinationFromHeading, declinationFromModel, expectedField, magneticToTrue } from './declination';
export { dipDeg, headingsFromField, type Vec3 } from './field';
export { FUSE_GAIN, RESET_STEP_DEG, createHeadingFuser, type HeadingFuser } from './fuse';
export {
  createStillness,
  normalizeDeg,
  shortestDelta,
  unwrap,
  type Stillness,
  type StillnessOptions,
  type StillnessReading,
} from './smooth';
export type { Coords } from './types';
```

## 5. The hook: `useQibla.ts`

This is where the APIs are subscribed and the engine is wired together. Read it top to bottom with these landmarks:

1. **Inputs**: `coords` (from `useQiblaCoords`: the GPS fix, else the chosen city), `mode` (`'flat'` for the dial, `'camera'` for the camera page), `active` (tab focused). Sensors run only while the tab is focused and the app is in front.
2. **Shared values** (Reanimated, UI thread): `heading`, `target`, `delta`, `pitch`, `lockT`, `edgeT`. Plain refs hold the JS-side bookkeeping, because a shared value read on the JS thread right after a JS-thread write can still return the old value (this bit us: the heading swept in from 0 through the lock band).
3. **Subscriptions** (inside the effect): `Magnetometer` stores the latest field; `DeviceMotion` does the per-sample work — compass heading from the field + gravity, fused heading from `rotation`, `fuser.push`, stillness, field watch, pitch, `target`; `Location.watchHeadingAsync` supplies declination and the accuracy flag.
4. **`ARM_MS`**: the lock cue is armed 1.5 s after subscribing, so a page that opens already on the Qibla is silent (the wheel's "silent on open" rule).
5. **Frame callback** (UI thread): `heading` chases `target` with a per-frame pull (0.18 at 60 fps), `delta = shortestDelta(bearing, heading)`.
6. **Band reaction** (UI thread): far/near/locked with hysteresis; on entering lock while armed: the haptic `lock()`, the lamp/halo (`lockT`) and the edge bloom (`edgeT`); the hint's degree number is sent to React only when it changes.
7. **Posture reaction**: `raised` (dial: pitch > 60°, camera: pitch < 30°), with hysteresis.
8. **Confidence tick** (4 Hz): folds the readings into the pill state.

**`src/features/qibla/useQibla.ts`**

```ts
import * as Location from 'expo-location';
import { DeviceMotion, Magnetometer } from 'expo-sensors';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import {
  Easing,
  useAnimatedReaction,
  useFrameCallback,
  useSharedValue,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { lock } from '@/shared/lib/haptics';
import { useMotion } from '@/shared/lib/motion';
import {
  LOCK_ENTER_DEG,
  LOCK_LEAVE_DEG,
  NEAR_DEG,
  confidence as foldConfidence,
  createFieldWatch,
  createHeadingFuser,
  createStillness,
  declinationFromHeading,
  declinationFromModel,
  dipDeg,
  expectedField,
  headingsFromAttitude,
  headingsFromField,
  magneticToTrue,
  qiblaBearing,
  shortestDelta,
  toW3C,
  type Band,
  type Confidence,
  type Coords,
} from './engine';

/** Which way the phone is "pointing" for this screen: its top (the dial, held flat) or its back camera. */
export type HeadingMode = 'flat' | 'camera';

const MOTION_INTERVAL_MS = 33;
/** The magnetometer is the compass truth now, so it is read often. */
const FIELD_INTERVAL_MS = 50;
/** How often the confidence state is re-evaluated. */
const CONFIDENCE_TICK_MS = 250;
/** An interference reading holds this long so the card does not flicker with the field. */
const INTERFERENCE_HOLD_MS = 2000;
/** Per-frame pull toward the sensor heading at 60 fps: fast enough to feel live, slow enough to hide sensor grain. */
const SMOOTH_PER_FRAME = 0.18;
const REDUCED_PER_FRAME = 0.5;
const FRAME_MS = 1000 / 60;
const LOCK_FADE_MS = 250;
/** The edge bloom on lock: a quick rise, a slow fade. */
const EDGE_IN_MS = 140;
const EDGE_OUT_MS = 900;
/** After subscribing, the sensors are left to settle this long before a lock can ring. */
const ARM_MS = 1500;
const STILLNESS = { windowMs: 1000, stableRangeDeg: 4, jumpDeg: 15 };
const PLATFORM = Platform.OS === 'ios' ? 'ios' : 'android';

export interface QiblaValues {
  /** True heading, smoothed, unwrapped (runs past 360 rather than wrapping), so rotations stay continuous. */
  heading: SharedValue<number>;
  /** bearing − heading, the short way: positive = turn right. */
  delta: SharedValue<number>;
  /** 0 flat, 90 upright. */
  pitch: SharedValue<number>;
  /** 0..1, eased in and out of the locked band. */
  lockT: SharedValue<number>;
  /** A one-shot bloom on entering the lock: up fast, then fading. */
  edgeT: SharedValue<number>;
}

export interface Qibla {
  /** True bearing to the Kaaba, or null without coordinates. */
  bearing: number | null;
  band: Band;
  /** |delta| rounded, for the turn hint; 0 while locked. */
  turnDeg: number;
  turnRight: boolean;
  confidence: Confidence;
  /** The phone is raised past the angle this mode makes sense at. */
  raised: boolean;
  values: QiblaValues;
}

/**
 * The live Qibla: sensors in, one smoothed heading out on the UI thread, and
 * the derived band / confidence as React state. Subscribes only while
 * `active` (the tab focused, the app in front): sensors cost battery.
 *
 * North comes from the magnetometer, tilt-corrected by gravity, the way a
 * compass app does it. The fused rotation sensor contributes only its motion
 * between magnetometer readings and is pulled back onto the compass every
 * sample: its absolute heading is never trusted (on a Samsung it sat 145°
 * off for a minute on a still desk while reporting accuracy 3).
 */
export function useQibla(coords: Coords | null, mode: HeadingMode, active: boolean): Qibla {
  const { reduced } = useMotion();
  const bearing = useMemo(() => (coords ? qiblaBearing(coords) : null), [coords]);

  const heading = useSharedValue(0);
  const target = useSharedValue(0);
  const delta = useSharedValue(0);
  const pitch = useSharedValue(0);
  const lockT = useSharedValue(0);
  const edgeT = useSharedValue(0);
  const bearingSv = useSharedValue(bearing ?? 0);
  const haveTarget = useSharedValue(false);
  /** The feed has settled since it started: only then does a lock get its cue. */
  const primed = useSharedValue(false);
  useEffect(() => {
    bearingSv.set(bearing ?? 0);
  }, [bearing, bearingSv]);

  const [band, setBand] = useState<Band>('far');
  const [turn, setTurn] = useState({ deg: 0, right: true });
  const [raised, setRaised] = useState(false);
  // What the sensors say; without coordinates there is nothing to sense for.
  const [sensed, setConfidence] = useState<Confidence>('settling');
  const confidence: Confidence = coords ? sensed : 'no-location';

  // The readings the confidence tick folds; the listeners just drop values here.
  // Plain refs for the JS side: a shared value read on the JS thread right after
  // it was set there can still answer with the old value, so the JS side keeps
  // its own copy of what it last wrote.
  const readings = useRef({
    sensorsAvailable: true,
    fieldAnomaly: false,
    accuracy: null as number | null,
    declination: null as number | null,
    stableForMs: 0,
    interferenceUntil: 0,
    /** Latest calibrated field, device frame (µT); null before the magnetometer speaks. */
    mag: null as readonly number[] | null,
    started: false,
  });
  const stillness = useMemo(() => createStillness(STILLNESS), []);
  const fuser = useMemo(() => createHeadingFuser(), []);

  const appActive = useAppActive();
  const live = active && appActive;
  const latitude = coords?.latitude;
  const longitude = coords?.longitude;
  const fieldWatch = useMemo(
    () =>
      latitude === undefined || longitude === undefined
        ? null
        : createFieldWatch(expectedField({ latitude, longitude }, new Date())),
    [latitude, longitude],
  );

  // Sensors → `target` (JS thread). The declination comes from the platform's own
  // true/magnetic pair when it has one, else from the magnetic model.
  useEffect(() => {
    if (!live || latitude === undefined || longitude === undefined || !fieldWatch) return;
    const r = readings.current;
    let cancelled = false;
    const subs: { remove(): void }[] = [];
    const modelDeclination = declinationFromModel({ latitude, longitude }, new Date());

    (async () => {
      const [motion, magnet] = await Promise.all([DeviceMotion.isAvailableAsync(), Magnetometer.isAvailableAsync()]);
      if (cancelled) return;
      r.sensorsAvailable = motion && magnet;
      if (!r.sensorsAvailable) return;

      Magnetometer.setUpdateInterval(FIELD_INTERVAL_MS);
      subs.push(
        Magnetometer.addListener(({ x, y, z }) => {
          r.mag = [x, y, z];
        }),
      );

      DeviceMotion.setUpdateInterval(MOTION_INTERVAL_MS);
      subs.push(
        DeviceMotion.addListener(({ rotation, accelerationIncludingGravity: down }) => {
          if (!rotation || !down || !r.mag) return;
          const now = Date.now();
          const declination = r.declination ?? modelDeclination;
          // The compass: the field against gravity.
          const field = headingsFromField(r.mag, [down.x, down.y, down.z]);
          const magnetic = mode === 'camera' ? field.cameraHeading : field.flatHeading;
          const compass = magneticToTrue(magnetic, declination);
          // The motion: the fused sensor, whose changes are trusted and whose heading is not.
          const fused = headingsFromAttitude(toW3C(rotation, PLATFORM));
          const motionHeading = magneticToTrue(mode === 'camera' ? fused.cameraHeading : fused.flatHeading, declination);
          const next = fuser.push(compass, motionHeading);

          const still = stillness.push(compass, now);
          r.stableForMs = still.stableForMs;
          if (still.jump) r.interferenceUntil = now + INTERFERENCE_HOLD_MS;
          const m = r.mag;
          r.fieldAnomaly = fieldWatch.push(
            { magnitudeUt: Math.hypot(m[0], m[1], m[2]), dipDeg: dipDeg(m, [down.x, down.y, down.z]) },
            now,
          );

          pitch.set(field.pitch);
          target.set(next);
          if (!r.started) {
            // First reading: start there rather than sweeping in from zero.
            r.started = true;
            heading.set(next);
            haveTarget.set(true);
          }
        }),
      );

      const headingSub = await Location.watchHeadingAsync((sample) => {
        r.accuracy = sample.accuracy;
        const d = declinationFromHeading(sample.trueHeading, sample.magHeading);
        if (d !== null) r.declination = d;
      }).catch(() => null);
      if (cancelled) headingSub?.remove();
      else if (headingSub) subs.push(headingSub);
    })();

    // The sensors take a moment to settle after they register; the lock cue is
    // armed only once that has passed, so an opening never rings it.
    const arm = setTimeout(() => primed.set(true), ARM_MS);

    const tick = setInterval(() => {
      const now = Date.now();
      const next = foldConfidence({
        hasCoords: true,
        sensorsAvailable: r.sensorsAvailable,
        fieldAnomaly: r.fieldAnomaly,
        jump: now < r.interferenceUntil,
        accuracy: r.accuracy,
        stableForMs: r.stableForMs,
      });
      setConfidence((prev) => (prev === next ? prev : next));
    }, CONFIDENCE_TICK_MS);

    return () => {
      cancelled = true;
      clearInterval(tick);
      clearTimeout(arm);
      subs.forEach((s) => s.remove());
      fuser.reset();
      r.fieldAnomaly = false;
      r.accuracy = null;
      r.stableForMs = 0;
      r.mag = null;
      r.started = false;
      haveTarget.set(false);
      // The next first sample is an opening again, so it is silent again.
      primed.set(false);
    };
  }, [live, latitude, longitude, mode, stillness, fuser, fieldWatch, pitch, target, heading, haveTarget, primed]);

  // `target` → `heading` (UI thread), every frame while live.
  const k = reduced ? REDUCED_PER_FRAME : SMOOTH_PER_FRAME;
  const frame = useFrameCallback((info) => {
    'worklet';
    if (!haveTarget.get()) return;
    const dt = info.timeSincePreviousFrame ?? FRAME_MS;
    const pull = 1 - Math.pow(1 - k, dt / FRAME_MS);
    const h = heading.get() + (target.get() - heading.get()) * pull;
    heading.set(h);
    delta.set(shortestDelta(bearingSv.get(), h));
  }, false);
  useEffect(() => {
    frame.setActive(live);
  }, [frame, live]);

  // Band with hysteresis, the lock cue, and the turn hint's number, from the UI thread.
  // The cue is for turning into the lock: a page that opens already on the
  // Qibla shows it without a sound, like the wheel, which is silent on open.
  const bandSv = useSharedValue<Band>('far');
  const shown = useSharedValue(-1);
  useAnimatedReaction(
    // Nothing to judge before the first sample: `delta` starts at 0, which is not a lock.
    () => (haveTarget.get() ? delta.get() : null),
    (d) => {
      if (d === null) return;
      const a = Math.abs(d);
      const prev = bandSv.get();
      const next: Band =
        a <= (prev === 'locked' ? LOCK_LEAVE_DEG : LOCK_ENTER_DEG) ? 'locked' : a <= NEAR_DEG ? 'near' : 'far';
      if (next !== prev) {
        bandSv.set(next);
        lockT.set(withTiming(next === 'locked' ? 1 : 0, { duration: LOCK_FADE_MS }));
        scheduleOnRN(setBand, next);
        if (next === 'locked' && primed.get()) {
          scheduleOnRN(lock);
          edgeT.set(
            withSequence(
              withTiming(1, { duration: EDGE_IN_MS }),
              withTiming(0, { duration: EDGE_OUT_MS, easing: Easing.out(Easing.quad) }),
            ),
          );
        }
      }
      const deg = next === 'locked' ? 0 : Math.round(a);
      const code = deg * 2 + (d >= 0 ? 1 : 0);
      if (code !== shown.get()) {
        shown.set(code);
        scheduleOnRN(setTurn, { deg, right: d >= 0 });
      }
    },
  );

  // Posture: the dial wants the phone flat, the camera wants it up.
  const raisedSv = useSharedValue(false);
  useAnimatedReaction(
    () => pitch.get(),
    (p) => {
      const was = raisedSv.get();
      const is = mode === 'flat' ? (was ? p > 50 : p > 60) : was ? p < 40 : p < 30;
      if (is !== was) {
        raisedSv.set(is);
        scheduleOnRN(setRaised, is);
      }
    },
    [mode],
  );

  return {
    bearing,
    band,
    turnDeg: turn.deg,
    turnRight: turn.right,
    confidence,
    raised,
    values: { heading, delta, pitch, lockT, edgeT },
  };
}

function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState !== 'background');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}
```

### `useQiblaCoords.ts` — where the bearing is taken from

**`src/features/qibla/useQiblaCoords.ts`**

```ts
import { useMemo } from 'react';
import { cityByName } from '@/features/prayer/engine';
import { useSettings } from '@/shared/storage/settings';
import type { Coords } from './engine';

export type CoordsSource = 'fix' | 'city' | 'none';

export interface QiblaCoords {
  coords: Coords | null;
  /** The place the bearing is taken from, for the caption under the dial. */
  label: string | null;
  source: CoordsSource;
}

/**
 * Where the Qibla is taken from. The exact device fix when there is one (the
 * bearing barely moves across a city, so no snapping to a listed city as the
 * prayer times do), else the chosen city. Nothing at all only when the user
 * has neither, which onboarding does not allow but a cleared setting could.
 */
export function useQiblaCoords(): QiblaCoords {
  const { settings } = useSettings();
  const fix = settings.locationMode === 'auto' ? settings.coords : null;
  const cityName = settings.city;
  const latitude = fix?.latitude;
  const longitude = fix?.longitude;
  return useMemo(() => {
    if (latitude !== undefined && longitude !== undefined) {
      return { coords: { latitude, longitude }, label: cityName, source: 'fix' };
    }
    if (cityName) {
      const city = cityByName(cityName);
      return { coords: { latitude: city.latitude, longitude: city.longitude }, label: city.name, source: 'city' };
    }
    return { coords: null, label: null, source: 'none' };
  }, [latitude, longitude, cityName]);
}
```

## 6. What the screen does with it

### `CompassDial.tsx`
Two rotating layers over static drawings, so nothing inside an SVG animates per frame: the *world* (ticks and the four compass points) turns by `−heading` so north stays north; the *mat* turns by `bearing − heading` so it lies straight exactly when the phone faces the Qibla. The letters counter-rotate to stay upright and are placed by physical edge (RN flips `left`/`right` under RTL; a compass must not mirror).

**`src/features/qibla/dial/CompassDial.tsx`**

```tsx
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Line, Rect } from 'react-native-svg';
import { physicalLeft } from '@/shared/lib/rtl';
import { useTheme } from '@/shared/theme/useTheme';
import { Text } from '@/shared/ui/Text';
import type { QiblaValues } from '../useQibla';
import { PrayerMat } from './PrayerMat';

interface CompassDialProps {
  values: QiblaValues;
  /** True bearing to the Kaaba; null draws the mat straight up, unlit. */
  bearing: number | null;
  size: number;
  /** Dims the whole dial while it cannot be trusted. */
  dimmed: boolean;
}

/** Compass points, clockwise from the top. Real-world directions: never mirrored under RTL. */
const POINTS = ['ش', 'ق', 'ج', 'غ'] as const;
const TICKS = 72;
const KAABA = 18;

/**
 * The compass hero. The world (compass points and ticks) turns against the
 * heading so north stays north; the mat turns to the bearing, so it lies
 * straight on the screen exactly when the phone faces the Qibla. Both are
 * view transforms over static drawings.
 */
export function CompassDial({ values, bearing, size, dimmed }: CompassDialProps) {
  const { c } = useTheme();
  const { heading, lockT } = values;
  const r = size / 2;
  const matW = size * 0.4;
  const b = bearing ?? 0;

  const world = useAnimatedStyle(() => ({ transform: [{ rotate: `${-heading.get()}deg` }] }));
  // The letters ride the ring but stay upright: they undo the ring's turn.
  const upright = useAnimatedStyle(() => ({ transform: [{ rotate: `${heading.get()}deg` }] }));
  const mat = useAnimatedStyle(() => ({
    transform: [{ rotate: `${bearing === null ? 0 : b - heading.get()}deg` }, { scale: 1 + 0.04 * lockT.get() }],
  }));
  const halo = useAnimatedStyle(() => ({ opacity: lockT.get() }));

  return (
    <View style={[{ width: size, height: size, opacity: dimmed ? 0.45 : 1 }, styles.center]}>
      {/* The lock's halo around the whole dial. */}
      <Animated.View
        pointerEvents="none"
        style={[styles.halo, halo, { width: size, height: size, borderRadius: r, boxShadow: `0 0 ${size * 0.12}px ${size * 0.02}px ${c.accent}55` }]}
      />
      <Animated.View style={[StyleSheet.absoluteFill, world]}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {Array.from({ length: TICKS }, (_, i) => {
            const a = (i * 2 * Math.PI) / TICKS;
            const major = i % (TICKS / 4) === 0;
            const mid = i % (TICKS / 12) === 0;
            const len = major ? 12 : mid ? 8 : 5;
            return (
              <Line
                key={i}
                x1={r + (r - 2) * Math.sin(a)}
                y1={r - (r - 2) * Math.cos(a)}
                x2={r + (r - 2 - len) * Math.sin(a)}
                y2={r - (r - 2 - len) * Math.cos(a)}
                stroke={c.tm}
                strokeWidth={major ? 2 : 1}
                opacity={major ? 1 : mid ? 0.7 : 0.35}
              />
            );
          })}
        </Svg>
        {POINTS.map((p, i) => {
          const a = (i * Math.PI) / 2;
          const d = r - 26;
          // Physical positions: RN flips `left` under RTL, and a compass must not mirror.
          return (
            <Animated.View
              key={p}
              style={[styles.point, physicalLeft(r + d * Math.sin(a) - 12), { top: r - d * Math.cos(a) - 12 }, upright]}
              pointerEvents="none"
            >
              <Text size={13} weight="semi" color={i === 0 ? c.accent : c.ts} align="center" style={styles.pointText}>
                {p}
              </Text>
            </Animated.View>
          );
        })}
      </Animated.View>

      <Animated.View style={[styles.center, mat]}>
        <View style={{ height: KAABA + 8 }}>
          <Svg width={KAABA} height={KAABA} viewBox="0 0 18 18">
            <Rect x="1" y="1" width="16" height="16" fill="#1b1b1b" />
            <Rect x="1" y="6" width="16" height="4" fill="#d9b25c" />
          </Svg>
        </View>
        <PrayerMat width={matW} lockT={lockT} />
        <View style={{ height: KAABA + 8 }} />
      </Animated.View>

      {/* The phone's own direction: a fixed mark at the top. */}
      <View pointerEvents="none" style={[styles.index, physicalLeft(r - 7), { top: 0, borderTopColor: c.accent }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute' },
  point: { position: 'absolute', width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  pointText: { alignSelf: 'stretch' },
  index: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
});
```

### `PrayerMat.tsx`
Unlit and lit drawings stacked; the lit one fades in with `lockT`; the lamp's glow is a plain view with a shadow.

**`src/features/qibla/dial/PrayerMat.tsx`**

```tsx
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useTheme } from '@/shared/theme/useTheme';

/** The mat's drawing box; everything inside is placed in these units. */
export const MAT_W = 100;
export const MAT_H = 170;
const LAMP_Y = 46;
const LIT_LAMP = '#f0c97a';

interface PrayerMatProps {
  /** Rendered width in dp; the height follows the box's ratio. */
  width: number;
  /** 0..1 lock progress: the niche warms and the lamp lights. */
  lockT: SharedValue<number>;
}

/**
 * A prayer mat seen from above, its niche at the top. Two static drawings,
 * unlit and lit, sit on top of each other and the lit one fades in with the
 * lock, so nothing inside the SVG ever animates (a per-frame SVG prop
 * re-rasterises the whole canvas on the CPU). The lamp's glow is a plain
 * view with a shadow, for the same reason.
 */
export function PrayerMat({ width, lockT }: PrayerMatProps) {
  const height = (width * MAT_H) / MAT_W;
  const lit = useAnimatedStyle(() => ({ opacity: lockT.get() }));
  const glow = useAnimatedStyle(() => ({ opacity: lockT.get() * 0.9, transform: [{ scale: 0.6 + 0.4 * lockT.get() }] }));
  const lampSize = width * 0.22;
  return (
    <View style={{ width, height }}>
      <Drawing width={width} height={height} lit={false} />
      <Animated.View style={[StyleSheet.absoluteFill, lit]}>
        <Drawing width={width} height={height} lit />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glow,
          glow,
          {
            width: lampSize,
            height: lampSize,
            borderRadius: lampSize / 2,
            top: (LAMP_Y / MAT_H) * height - lampSize / 2,
            left: width / 2 - lampSize / 2,
            boxShadow: `0 0 ${lampSize}px ${lampSize * 0.35}px rgba(240,201,122,0.55)`,
          },
        ]}
      />
    </View>
  );
}

function Drawing({ width, height, lit }: { width: number; height: number; lit: boolean }) {
  const { c } = useTheme();
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${MAT_W} ${MAT_H}`}>
      <Defs>
        <LinearGradient id="niche" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={c.accent} stopOpacity={lit ? 0.55 : 0.12} />
          <Stop offset="1" stopColor={c.accent} stopOpacity={lit ? 0.22 : 0.05} />
        </LinearGradient>
      </Defs>
      {/* The mat and its border band. */}
      <Rect x="2" y="2" width={MAT_W - 4} height={MAT_H - 4} rx="8" fill={c.surface} stroke={c.selbr} strokeWidth="1" />
      <Rect x="9" y="9" width={MAT_W - 18} height={MAT_H - 18} rx="4" fill="none" stroke={c.tm} strokeWidth="2.5" opacity="0.55" />
      {/* Tassels along the bottom edge. */}
      {Array.from({ length: 9 }, (_, i) => (
        <Path key={i} d={`M${14 + i * 9} ${MAT_H - 2} v3`} stroke={c.tm} strokeWidth="1.2" opacity="0.6" />
      ))}
      {/* The niche, pointing the way. */}
      <Path
        d="M22 142 V60 Q22 30 50 24 Q78 30 78 60 V142 Z"
        fill="url(#niche)"
        stroke={c.accent}
        strokeWidth="1.5"
        opacity={lit ? 1 : 0.55}
      />
      <Path d="M28 142 V62 Q28 38 50 33 Q72 38 72 62 V142" fill="none" stroke={c.accent} strokeWidth="0.8" opacity={lit ? 0.7 : 0.3} />
      {/* The hanging lamp. */}
      <Path d={`M50 24 V${LAMP_Y - 8}`} stroke={c.tm} strokeWidth="1" />
      <Path d={`M44 ${LAMP_Y - 8} H56 L54 ${LAMP_Y + 6} H46 Z`} fill={lit ? LIT_LAMP : c.tm} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  glow: { position: 'absolute', backgroundColor: LIT_LAMP },
});
```

### `LockGlow.tsx`
The edge bloom on lock, four gradients placed by physical edge.

**`src/features/qibla/dial/LockGlow.tsx`**

```tsx
import { LinearGradient } from 'expo-linear-gradient';
import { I18nManager, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

const DEPTH = 96;
const SIDE = DEPTH * 0.7;
const ACCENT = 'rgba(201,123,90,';

/**
 * The screen's edges bloom in the accent as the mat locks in, then fade: one
 * bright moment marking the arrival, over the whole page. Four gradients
 * fading inward, on a layer whose opacity the lock drives.
 *
 * The side strips are placed by physical edge: RN swaps `left`/`right` under
 * RTL but a gradient's direction stays physical, so a logical `left` strip
 * would land on the right edge with its bright side facing inward.
 */
export function LockGlow({ t }: { t: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({ opacity: t.get() }));
  const colors = [`${ACCENT}0.9)`, `${ACCENT}0)`] as const;
  const rtl = I18nManager.isRTL;
  const physicalLeft = rtl ? { right: 0 } : { left: 0 };
  const physicalRight = rtl ? { left: 0 } : { right: 0 };
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.top} />
      <LinearGradient colors={colors} start={{ x: 0, y: 1 }} end={{ x: 0, y: 0 }} style={styles.bottom} />
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.side, physicalLeft]} />
      <LinearGradient colors={colors} start={{ x: 1, y: 0 }} end={{ x: 0, y: 0 }} style={[styles.side, physicalRight]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0, height: DEPTH },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: DEPTH },
  side: { position: 'absolute', top: 0, bottom: 0, width: SIDE },
});
```

### `TurnHint.tsx`, `ConfidencePill.tsx`, `StatusCard.tsx`
The one-line instruction ("أدر يمينًا ١٢°" / "أنت في اتجاه القبلة" / posture and trust messages), the pill ("البوصلة مستقرة" — steady, deliberately not "accurate"), and the cards that need the user's hand (figure-8 calibration, interference, no location, no compass).

**`src/features/qibla/dial/TurnHint.tsx`**

```tsx
import { StyleSheet, View } from 'react-native';
import { toArabicIndic } from '@/shared/lib/arabic';
import { useTheme } from '@/shared/theme/useTheme';
import { Text } from '@/shared/ui/Text';
import type { Qibla } from '../useQibla';

interface TurnHintProps {
  qibla: Qibla;
}

/** What to do next, in one line, and the bearing under it. */
export function TurnHint({ qibla }: TurnHintProps) {
  const { c } = useTheme();
  const { band, turnDeg, turnRight, confidence, raised, bearing } = qibla;
  const locked = band === 'locked' && confidence === 'good';
  const line = (() => {
    if (confidence === 'no-location') return 'حدّد موقعك أولًا';
    if (confidence === 'unavailable') return 'لا توجد بوصلة في هذا الجهاز';
    if (raised) return 'ضع الهاتف مستويًا';
    if (confidence === 'calibrate') return 'المعايرة مطلوبة أولًا';
    if (confidence === 'interference') return 'الاتجاه غير موثوق الآن';
    if (band === 'locked') return 'أنت في اتجاه القبلة';
    return `أدر ${turnRight ? 'يمينًا' : 'يسارًا'} ${toArabicIndic(turnDeg)}°`;
  })();
  const sub = bearing === null ? null : `${toArabicIndic(Math.round(bearing))}° من الشمال`;
  return (
    <View style={styles.wrap}>
      <Text size={16} weight="semi" color={locked ? c.accent : c.tp} align="center" numberOfLines={1} style={styles.wide}>
        {line}
      </Text>
      {sub ? (
        <Text size={11.5} color={c.tm} align="center" numberOfLines={1} style={styles.wide}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 2, paddingHorizontal: 24 },
  wide: { alignSelf: 'stretch' },
});
```

**`src/features/qibla/dial/ConfidencePill.tsx`**

```tsx
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/shared/theme/useTheme';
import { Text } from '@/shared/ui/Text';
import type { Confidence } from '../engine';

/** Semantic colours for the compass's trust, apart from the palette's accent. */
export const TRUST = { good: '#5a9c7a', warn: '#c9a24a', bad: '#c0563f' } as const;

// "Steady", not "accurate": the phone's own accuracy flag stayed at its
// highest while its compass sat 40° off in a steel-framed room.
const LABEL: Record<Confidence, { text: string; tone: keyof typeof TRUST }> = {
  good: { text: 'البوصلة مستقرة', tone: 'good' },
  settling: { text: 'جارٍ الضبط', tone: 'warn' },
  calibrate: { text: 'يحتاج معايرة', tone: 'warn' },
  interference: { text: 'المجال المغناطيسي مضطرب', tone: 'bad' },
  unavailable: { text: 'بلا بوصلة', tone: 'bad' },
  'no-location': { text: 'بلا موقع', tone: 'bad' },
};

export function ConfidencePill({ confidence }: { confidence: Confidence }) {
  const { c } = useTheme();
  const { text, tone } = LABEL[confidence];
  return (
    <View style={[styles.pill, { backgroundColor: c.selbg, borderColor: c.selbr }]} accessibilityRole="text">
      <View style={[styles.dot, { backgroundColor: TRUST[tone] }]} />
      <Text size={11.5} weight="medium" color={c.ts}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
```

**`src/features/qibla/calibration/StatusCard.tsx`**

```tsx
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useMotion } from '@/shared/lib/motion';
import { radius } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { Button } from '@/shared/ui/Button';
import { Text } from '@/shared/ui/Text';
import type { Confidence } from '../engine';

interface StatusCardProps {
  confidence: Confidence;
  locating: boolean;
  onLocate: () => void;
  onChooseCity: () => void;
}

/** The card on the ground band for a state that needs the user's hand; null when the compass is fine. */
export function StatusCard({ confidence, locating, onLocate, onChooseCity }: StatusCardProps) {
  const { c } = useTheme();
  const body = (() => {
    switch (confidence) {
      case 'calibrate':
        return { title: 'يحتاج البوصلة إلى معايرة', text: 'حرّك الهاتف على شكل ٨ في الهواء عدة مرات', figure: true };
      case 'interference':
        return { title: 'هناك ما يشوّش على البوصلة', text: 'ابتعد عن المعادن أو المغناطيس، كالغطاء المغناطيسي أو السماعات' };
      case 'no-location':
        return { title: 'حدّد موقعك لمعرفة اتجاه القبلة', text: null, actions: true };
      case 'unavailable':
        return { title: 'لا يملك هذا الجهاز بوصلة', text: 'الاتجاه بالدرجات من الشمال معروض تحت السجادة' };
      default:
        return null;
    }
  })();
  if (!body) return null;
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Text size={13.5} weight="semi" align="center" style={styles.wide}>
        {body.title}
      </Text>
      {body.text ? (
        <Text size={12.5} color={c.ts} align="center" style={styles.wide}>
          {body.text}
        </Text>
      ) : null}
      {body.figure ? <FigureEight /> : null}
      {body.actions ? (
        <View style={styles.actions}>
          <Button label={locating ? 'جارٍ التحديد…' : 'تحديد موقعي'} onPress={onLocate} disabled={locating} style={styles.action} />
          <Button label="اختيار المدينة" variant="secondary" onPress={onChooseCity} style={styles.action} />
        </View>
      ) : null}
    </View>
  );
}

const EIGHT_W = 96;
const EIGHT_H = 44;
const LOOP_MS = 2400;

/** A dot running a figure of eight: the calibration gesture, shown rather than described. */
function FigureEight() {
  const { c } = useTheme();
  const { reduced } = useMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    t.set(withRepeat(withTiming(1, { duration: LOOP_MS, easing: Easing.linear }), -1));
    return () => t.set(0);
  }, [t, reduced]);
  const dot = useAnimatedStyle(() => {
    // Lemniscate of Bernoulli, scaled into the box.
    const u = t.get() * 2 * Math.PI;
    const den = 1 + Math.sin(u) ** 2;
    const x = (EIGHT_W / 2 - 6) * (Math.cos(u) / den);
    const y = (EIGHT_H / 2 - 6) * ((Math.sin(u) * Math.cos(u)) / den) * 2;
    return { transform: [{ translateX: x }, { translateY: y }] };
  });
  return (
    <View style={styles.eight}>
      <Svg width={EIGHT_W} height={EIGHT_H} viewBox={`0 0 ${EIGHT_W} ${EIGHT_H}`}>
        <Path
          d={`M${EIGHT_W / 2} ${EIGHT_H / 2} C ${EIGHT_W * 0.36} 0, 4 0, 4 ${EIGHT_H / 2} S ${EIGHT_W * 0.36} ${EIGHT_H}, ${EIGHT_W / 2} ${EIGHT_H / 2} S ${EIGHT_W - 4} 0, ${EIGHT_W - 4} ${EIGHT_H / 2} S ${EIGHT_W * 0.64} ${EIGHT_H}, ${EIGHT_W / 2} ${EIGHT_H / 2}`}
          fill="none"
          stroke={c.selbr}
          strokeWidth="2"
        />
      </Svg>
      <Animated.View style={[styles.dot, { backgroundColor: c.accent }, dot]} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.lg, paddingVertical: 12, paddingHorizontal: 14, gap: 4 },
  wide: { alignSelf: 'stretch' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  action: { flex: 1, paddingVertical: 11 },
  eight: { alignSelf: 'center', width: EIGHT_W, height: EIGHT_H, marginTop: 4, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', width: 10, height: 10, borderRadius: 5 },
});
```

### The page: `app/(tabs)/qibla.tsx`

**`src/app/(tabs)/qibla.tsx`**

```tsx
import { useIsFocused, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocate } from '@/features/prayer/useLocate';
import { StatusCard } from '@/features/qibla/calibration/StatusCard';
import { CompassDial } from '@/features/qibla/dial/CompassDial';
import { ConfidencePill } from '@/features/qibla/dial/ConfidencePill';
import { LockGlow } from '@/features/qibla/dial/LockGlow';
import { TurnHint } from '@/features/qibla/dial/TurnHint';
import { useQibla } from '@/features/qibla/useQibla';
import { useQiblaCoords } from '@/features/qibla/useQiblaCoords';
import { useTheme } from '@/shared/theme/useTheme';
import { GradientBackground } from '@/shared/ui/GradientBackground';
import { PressScale } from '@/shared/ui/PressScale';
import { useTabBarInset } from '@/shared/ui/TabBar';
import { TabScene } from '@/shared/ui/TabScene';
import { Display, Text } from '@/shared/ui/Text';

/** Ground showing above the floating bar: the place line, or a card that needs the user's hand. */
const GROUND_LIP = 150;
const HEADER_H = 76;
const HINT_H = 62;
const SIDE = 32;

/**
 * The Qibla tab: a prayer mat that turns with the phone and lies straight
 * when the phone faces the Kaaba. The dial is the hero; under it, what to do
 * next; on the ground, where the bearing is taken from.
 */
export default function QiblaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { c, isDark } = useTheme();
  const focused = useIsFocused();
  const tabInset = useTabBarInset();
  const { coords, label, source } = useQiblaCoords();
  const qibla = useQibla(coords, 'flat', focused);
  const { locating, locate } = useLocate();

  const window = useWindowDimensions();
  const [measured, setMeasured] = useState<{ w: number; h: number } | null>(null);
  const size = measured ?? { w: window.width, h: window.height };
  const horizon = size.h - tabInset - GROUND_LIP;
  const top = insets.top + 12;
  const dialTop = top + HEADER_H;
  const dial = Math.max(180, Math.min(size.w - SIDE * 2, horizon - dialTop - HINT_H - 16));

  const trusted = qibla.confidence === 'good' || qibla.confidence === 'settling';
  const cardShowing = !trusted;

  return (
    <TabScene
      name="qibla"
      index={2}
      slot={3}
      style={{ overflow: 'hidden', backgroundColor: c.bg }}
      onLayout={(e) => setMeasured({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {focused ? <StatusBar style={isDark ? 'light' : 'dark'} /> : null}
      <View style={[styles.sky, { height: horizon + 40 }]}>
        <GradientBackground />
      </View>

      <View style={[styles.header, { top, height: HEADER_H }]} pointerEvents="box-none">
        <Display size={32} align="center" style={styles.wide}>
          القبلة
        </Display>
        <ConfidencePill confidence={qibla.confidence} />
      </View>

      <View style={[styles.dial, { top: dialTop, height: horizon - dialTop - HINT_H }]} pointerEvents="none">
        <CompassDial values={qibla.values} bearing={qibla.bearing} size={dial} dimmed={cardShowing} />
      </View>

      <View style={[styles.hint, { top: horizon - HINT_H, height: HINT_H }]} pointerEvents="none">
        <TurnHint qibla={qibla} />
      </View>

      <View style={[styles.ground, { top: horizon, backgroundColor: c.bg }]}>
        {cardShowing ? (
          <StatusCard
            confidence={qibla.confidence}
            locating={locating}
            onLocate={() => void locate()}
            onChooseCity={() => router.push('/settings')}
          />
        ) : (
          <View style={styles.place}>
            <Text size={12.5} color={c.ts}>
              {source === 'fix' ? `من موقعك الحالي${label ? ` (${label})` : ''}` : label ? `من مدينة ${label}` : ''}
            </Text>
            <Text size={12.5} color={c.tm}>
              ·
            </Text>
            <PressScale accessibilityRole="button" accessibilityLabel="تحديد موقعي" onPress={() => void locate()} disabled={locating}>
              <Text size={12.5} weight="medium" color={c.accent}>
                {locating ? 'جارٍ التحديد…' : 'تحديد موقعي'}
              </Text>
            </PressScale>
          </View>
        )}
      </View>
      <LockGlow t={qibla.values.edgeT} />
    </TabScene>
  );
}

const styles = StyleSheet.create({
  sky: { position: 'absolute', left: 0, right: 0, top: 0 },
  header: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 6 },
  wide: { alignSelf: 'stretch' },
  dial: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  hint: { position: 'absolute', left: 0, right: 0, justifyContent: 'center' },
  ground: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopStartRadius: 32,
    borderTopEndRadius: 32,
    paddingTop: 16,
    paddingHorizontal: 20,
  },
  place: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
});
```

### The haptic vocabulary entry

**`src/shared/lib/haptics.ts` — `lock()`**

```ts
/**
 * The phone has come round onto the Qibla: one firm knock on entering the
 * band, silent while turning. The heavy system effect rather than the light
 * `Confirm` tick, so arriving is felt through a hand holding the phone flat.
 */
export function lock() {
  androidOr(Haptics.AndroidHaptics.Long_Press, impact(Haptics.ImpactFeedbackStyle.Heavy));
}
```

## 7. What we know, what we don't

- **Verified on the S24 Ultra**: the Android angle conventions (three postures), the field values quoted above, the 145° fused-sensor episode, the lock cue firing exactly once when turning into the lock and never on open.
- **Not yet verified on iPhone**: the sign of the gravity vector and the magnetometer axes as expo exposes them. The maths is platform-neutral, but the first TestFlight build needs the same 30-second posture check.
- **Cannot be fixed in software**: a room whose steel bends the field. At a sunlit window spot every method — ours, the platform's, Samsung's — agreed on a heading 40° from the Sun's. The field watch catches the gross cases (size or dip far off); a distortion that merely rotates the field is invisible to any phone. The sun/shadow method is the only reference that works there.

## 8. Tests

`npm test` runs vitest over `src/**/engine/**`: bearing check values (Cairo, London, New York, Jakarta), attitude fixtures (synthetic and recorded), field headings (flat, upright, half-raised, a recorded desk sample), dip, the fuser (start on compass, follow motion, converge on drift, ignore a reset, run unwrapped across north), the field watch (cable allowed, laptop corner flagged, persistence), confidence states, the lock band, declination and the expected field.
