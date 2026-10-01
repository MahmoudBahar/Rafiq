import { DEG, RAD, clamp, normalizeDeg, wrap180 } from './angles';
import { createCalibrationWatch, type CalibrationWatch } from './calibration';
import { foldConfidence, DISAGREEMENT_CLEAR_S, type Confidence } from './confidence';
import { createShapeWatch, judgeField, type FieldVerdict, type ShapeWatch } from './fieldCheck';
import type { EarthField } from './geomag';
import { SHOW_DISAGREEMENT_S, SIGMA_SYS_DEG, UPDATE_S, createNorthFilter } from './northFilter';
import { createOrientation } from './orientation';
import { poseOf } from './pose';
import { createStreamMerger, type MotionBatch, type StreamKind } from './stream';
import { cross, dot, norm, qFromWorldAxes, qRotate, qRotateInverse, scale, sub, unit, type Quat, type Vec3 } from './vec';

/** Residual tilt error of a fused gravity vector, degrees: it leaks into the heading as σ·tan(dip). */
export const SIGMA_TILT_DEG = 0.5;
/** Magnetometer noise per reading, µT: a minor term next to the systematic error. */
export const SIGMA_B_UT = 0.5;
/** A field weaker than this (µT) is no reading at all: CoreMotion reports zeros while uncalibrated. */
export const MIN_FIELD_UT = 1;
/** After the lock haptic fires, the magnetometer is ignored this long: the actuator is a magnet. */
export const ACTUATOR_MASK_S = 0.25;
/** Without a gyroscope: the accelerometer's tilt is smoothed over this long… */
export const COMPASS_TILT_TAU_S = 0.2;
/** …a reading off 1 g by more than this (m/s²) is the hand accelerating, not gravity… */
export const COMPASS_ACCEL_REJECT = 1.0;
/** …and the heading is smoothed over this long. */
export const COMPASS_HEADING_TAU_S = 0.3;
const GRAVITY = 9.80665;

const UP: Vec3 = [0, 0, 1];

export interface EngineSensors {
  hasGyro: boolean;
  hasMagnetometer: boolean;
  hasUp: boolean;
  /** The up stream is the raw accelerometer (m/s², hand acceleration included) rather than fused gravity. */
  upIsAccelerometer: boolean;
  /** Believe the platform's calibration accuracy on its own (CoreMotion's is; Android's is not). */
  trustAccuracy: boolean;
}

export interface EngineDebug {
  pipeline: 'fused' | 'compass';
  /** Where magnetic north lies in the gyro frame, degrees. */
  thetaDeg: number;
  innovationDeg: number;
  sigmaDeg: number;
  /** The last measurement's standard deviation, degrees. */
  measSigmaDeg: number;
  impliedDeg: number;
  ratio: number;
  dipDeg: number;
  modelDipDeg: number;
  fieldUt: number;
  modelFieldUt: number;
  magAccuracy: number;
  biasEpoch: number;
  hz: Record<StreamKind, number>;
  dropped: number;
  rejected: number;
  gaps: number;
  reacquisitions: number;
  disagreementS: number;
  tiltResidualDeg: number;
  calSpread: number;
  calDipRange: number;
}

export interface EngineOutput {
  /** Sensor-clock time (s) the headings are for: the newest gyro sample (the newest sample of any kind without one). */
  t: number;
  /** True headings (magnetic without a model), degrees in [0, 360): the top edge, and the back camera. */
  flat: number;
  camera: number;
  /** 0 flat, 90 upright. */
  pitch: number;
  /** Sensor-side confidence; the caller adds `no-location`. */
  confidence: Exclude<Confidence, 'no-location'>;
  debug: EngineDebug;
}

export interface QiblaEngine {
  /** Feed one native batch; returns the latest state, or null while there is no heading yet. */
  push(batch: MotionBatch): EngineOutput | null;
  /** The coordinates' field model changed (or went away); north in the gyro frame is kept. */
  setModel(model: EarthField | null): void;
  /** The haptic actuator just fired: ignore the magnetometer for a moment. */
  noteActuator(): void;
  /** Start over: the sensors were re-registered and the gyro frame is new. */
  reset(): void;
}

/**
 * The whole heading pipeline, pure and platform-free: native batches in,
 * true headings and an honest confidence out.
 *
 *  - tilt from the platform's fused gravity, turning from the gyroscope
 *    (`orientation`), so no platform yaw ever reaches the output;
 *  - north from the magnetometer, as one slowly corrected angle in the
 *    gyroscope's frame (`northFilter`);
 *  - the field judged against the World Magnetic Model for its shape
 *    (`fieldCheck`) and against itself for calibration (`calibration`).
 *
 * Without a gyroscope it falls back to a tilt-compensated compass on the
 * smoothed accelerometer: slower and shakier, but honest.
 */
export function createQiblaEngine(sensors: EngineSensors, initialModel: EarthField | null): QiblaEngine {
  const kinds: StreamKind[] = [];
  if (sensors.hasGyro) kinds.push('gyro');
  if (sensors.hasUp) kinds.push('up');
  if (sensors.hasMagnetometer) kinds.push('mag');
  const fused = sensors.hasGyro && sensors.hasUp;

  const merger = createStreamMerger(kinds);
  const orientation = createOrientation();
  const north = createNorthFilter();
  let model = initialModel;
  let shape: ShapeWatch = createShapeWatch(model?.zone ?? 'normal');
  let calibration: CalibrationWatch = createCalibrationWatch(model?.totalUt ?? 0, sensors.trustAccuracy);

  let newestT = -Infinity;
  let maskUntil = -Infinity;
  let lastEpoch: number | null = null;
  let lastAccuracy = -1;
  let dropped = 0;
  let rate = 0;
  let gapsSeen = 0;
  let trusted = false;
  let shapeDisturbed = false;
  let disagreement = false;
  let agreedSince: number | null = null;
  let lastVerdict: FieldVerdict | null = null;
  let lastDip = 0;
  let lastField = 0;
  let lastMeasSigma = 0;
  // One field verdict per 100 ms for the shape and calibration watches.
  let bin = { start: -Infinity, field: 0, dip: 0, n: 0 };
  // Compass-only state.
  let tilt: Vec3 | null = null;
  let tiltT: number | null = null;
  let compass: { flat: number; camera: number; pitch: number; t: number } | null = null;
  // Measured rates.
  const hz: Record<StreamKind, number> = { gyro: 0, up: 0, mag: 0 };
  const counts: Record<StreamKind, { start: number; n: number }> = {
    gyro: { start: -Infinity, n: 0 },
    up: { start: -Infinity, n: 0 },
    mag: { start: -Infinity, n: 0 },
  };

  function count(kind: StreamKind, t: number) {
    const c = counts[kind];
    if (t - c.start >= 1) {
      if (Number.isFinite(c.start)) hz[kind] = c.n / (t - c.start);
      c.start = t;
      c.n = 0;
    }
    c.n++;
  }

  function measurementVariance(fieldUt: number, dipDeg: number, verdict: FieldVerdict | null): number {
    const dip = clamp(Math.abs(model?.dipDeg ?? dipDeg), 0, 89);
    const horizontal = Math.max(0.1, fieldUt * Math.cos(dipDeg * DEG));
    const tiltTerm = SIGMA_TILT_DEG * Math.tan(dip * DEG);
    const noiseTerm = (SIGMA_B_UT / horizontal) * RAD;
    return SIGMA_SYS_DEG ** 2 + tiltTerm ** 2 + noiseTerm ** 2 + (verdict?.rDeg2 ?? 0);
  }

  function watchField(t: number, q: Quat, fieldUt: number, dipDeg: number) {
    if (t - bin.start >= UPDATE_S) {
      if (bin.n > 0 && model) {
        const field = bin.field / bin.n;
        const dip = bin.dip / bin.n;
        shapeDisturbed = shape.push(judgeField({ magnitudeUt: field, dipDeg: dip }, model), t);
        calibration.reading(t, q, field, dip, rate);
      }
      bin = { start: t, field: 0, dip: 0, n: 0 };
    }
    bin.field += fieldUt;
    bin.dip += dipDeg;
    bin.n++;
  }

  function onMag(t: number, m: Vec3) {
    const fieldUt = norm(m);
    if (fieldUt < MIN_FIELD_UT || t < maskUntil) return;
    if (fused) {
      const q = orientation.at(t);
      if (!q) return;
      const world = qRotate(q, m);
      const up = qRotateInverse(q, UP);
      const dipDeg = Math.asin(clamp(-dot(m, up) / fieldUt, -1, 1)) * RAD;
      const verdict = model ? judgeField({ magnitudeUt: fieldUt, dipDeg }, model) : null;
      const r = measurementVariance(fieldUt, dipDeg, verdict);
      north.measure({ t, thetaDeg: normalizeDeg(Math.atan2(world[0], world[1]) * RAD), rDeg2: r, scoreDeg: verdict?.scoreDeg ?? 0 });
      watchField(t, q, fieldUt, dipDeg);
      lastVerdict = verdict;
      lastDip = dipDeg;
      lastField = fieldUt;
      lastMeasSigma = Math.sqrt(r);
      return;
    }
    // Compass only: north straight from the field, levelled by the smoothed accelerometer.
    if (!tilt) return;
    const upDev = tilt;
    const vertical = dot(m, upDev);
    const northDev = unit(sub(m, scale(upDev, vertical)));
    if (!northDev) return;
    const eastDev = cross(northDev, upDev);
    const q = qFromWorldAxes(eastDev, northDev, upDev);
    const pose = poseOf(q);
    const dipDeg = Math.asin(clamp(-vertical / fieldUt, -1, 1)) * RAD;
    if (!compass) compass = { ...pose, t };
    else {
      const k = 1 - Math.exp(-Math.max(0, t - compass.t) / COMPASS_HEADING_TAU_S);
      compass = {
        flat: normalizeDeg(compass.flat + k * wrap180(pose.flat, compass.flat)),
        camera: normalizeDeg(compass.camera + k * wrap180(pose.camera, compass.camera)),
        pitch: compass.pitch + k * (pose.pitch - compass.pitch),
        t,
      };
    }
    lastVerdict = model ? judgeField({ magnitudeUt: fieldUt, dipDeg }, model) : null;
    lastDip = dipDeg;
    lastField = fieldUt;
    watchField(t, q, fieldUt, dipDeg);
  }

  function onUp(t: number, u: Vec3) {
    if (fused) {
      orientation.up(t, u);
      return;
    }
    if (sensors.upIsAccelerometer && Math.abs(norm(u) - GRAVITY) > COMPASS_ACCEL_REJECT) return;
    const measured = unit(u);
    if (!measured) return;
    if (!tilt || tiltT === null) {
      tilt = measured;
    } else {
      const k = 1 - Math.exp(-Math.max(0, t - tiltT) / COMPASS_TILT_TAU_S);
      tilt = unit([tilt[0] + k * (measured[0] - tilt[0]), tilt[1] + k * (measured[1] - tilt[1]), tilt[2] + k * (measured[2] - tilt[2])]) ?? tilt;
    }
    tiltT = t;
  }

  function onGyro(t: number, w: Vec3) {
    rate = norm(w);
    const turned = orientation.gyro(t, w);
    if (orientation.gaps !== gapsSeen) {
      // Whatever the phone turned during the silence is unknown: find north again.
      gapsSeen = orientation.gaps;
      north.reseed();
      return;
    }
    if (turned !== null) north.turned(turned);
  }

  function output(): EngineOutput | null {
    const declination = model?.declination ?? 0;
    let flat: number;
    let camera: number;
    let pitch: number;
    let seeded: boolean;
    let sigmaDeg: number;
    const ns = north.state();
    let t = newestT;
    if (fused) {
      const now = orientation.ahead(merger.pending('gyro'));
      if (!now || !ns.seeded) return null;
      t = now.t;
      const pose = poseOf(now.q);
      flat = normalizeDeg(pose.flat - ns.thetaDeg + declination);
      camera = normalizeDeg(pose.camera - ns.thetaDeg + declination);
      pitch = pose.pitch;
      seeded = true;
      sigmaDeg = Math.sqrt(ns.pDeg2);
    } else {
      if (!compass) return null;
      flat = normalizeDeg(compass.flat + declination);
      camera = normalizeDeg(compass.camera + declination);
      pitch = compass.pitch;
      seeded = true;
      sigmaDeg = SIGMA_SYS_DEG;
    }

    // The disagreement is shown once it has held, and cleared once the field has agreed again for a moment.
    if (ns.disagreementS >= SHOW_DISAGREEMENT_S) {
      disagreement = true;
      agreedSince = null;
    } else if (disagreement && ns.disagreementS === 0) {
      if (agreedSince === null) agreedSince = newestT;
      if (newestT - agreedSince >= DISAGREEMENT_CLEAR_S) disagreement = false;
    }

    const confidence = foldConfidence(
      {
        hasCoords: true,
        unavailable: !sensors.hasMagnetometer || !sensors.hasUp,
        calibrate: calibration.needed(),
        shapeDisturbed: shapeDisturbed || model?.zone === 'blackout',
        disagreement,
        seeded,
        sigmaDeg,
      },
      trusted,
    ) as Exclude<Confidence, 'no-location'>;
    if (confidence === 'good') trusted = true;

    return {
      t,
      flat,
      camera,
      pitch,
      confidence,
      debug: {
        pipeline: fused ? 'fused' : 'compass',
        thetaDeg: ns.thetaDeg,
        innovationDeg: ns.innovationDeg,
        sigmaDeg,
        measSigmaDeg: lastMeasSigma,
        impliedDeg: lastVerdict?.impliedDeg ?? 0,
        ratio: lastVerdict?.ratio ?? 0,
        dipDeg: lastDip,
        modelDipDeg: model?.dipDeg ?? 0,
        fieldUt: lastField,
        modelFieldUt: model?.totalUt ?? 0,
        magAccuracy: lastAccuracy,
        biasEpoch: lastEpoch ?? 0,
        hz: { ...hz },
        dropped,
        rejected: merger.rejected,
        gaps: orientation.gaps,
        reacquisitions: ns.reacquisitions,
        disagreementS: ns.disagreementS,
        tiltResidualDeg: orientation.tiltResidualDeg,
        calSpread: calibration.spread,
        calDipRange: calibration.dipRange,
      },
    };
  }

  function newest(flat: number[] | undefined) {
    if (flat && flat.length >= 4) {
      const t = flat[flat.length - 4];
      if (Number.isFinite(t) && t > newestT) newestT = t;
    }
  }

  return {
    push(batch) {
      newest(batch.gyro);
      newest(batch.up);
      newest(batch.mag);
      dropped += batch.dropped > 0 ? batch.dropped : 0;
      lastAccuracy = batch.magAccuracy;
      if (lastEpoch !== null && batch.biasEpoch !== lastEpoch) north.biasEpoch(newestT);
      lastEpoch = batch.biasEpoch;
      calibration.accuracy(batch.magAccuracy, newestT);

      for (const s of merger.push(batch)) {
        count(s.kind, s.t);
        if (s.kind === 'gyro') onGyro(s.t, s.v);
        else if (s.kind === 'up') onUp(s.t, s.v);
        else onMag(s.t, s.v);
      }
      return output();
    },
    setModel(next) {
      model = next;
      shape = createShapeWatch(next?.zone ?? 'normal');
      calibration = createCalibrationWatch(next?.totalUt ?? 0, sensors.trustAccuracy);
      shapeDisturbed = false;
    },
    noteActuator() {
      maskUntil = newestT + ACTUATOR_MASK_S;
    },
    reset() {
      merger.reset();
      orientation.reset();
      north.reseed();
      shape.reset();
      calibration.reset();
      newestT = -Infinity;
      maskUntil = -Infinity;
      lastEpoch = null;
      dropped = 0;
      rate = 0;
      gapsSeen = 0;
      trusted = false;
      shapeDisturbed = false;
      disagreement = false;
      agreedSince = null;
      lastVerdict = null;
      bin = { start: -Infinity, field: 0, dip: 0, n: 0 };
      tilt = null;
      tiltT = null;
      compass = null;
    },
  };
}
