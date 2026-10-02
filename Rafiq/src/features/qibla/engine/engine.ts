import { DEG, RAD, clamp, normalizeDeg, wrap180 } from './angles';
import { createCalibrationWatch, type CalibrationWatch } from './calibration';
import { foldConfidence, DISAGREEMENT_CLEAR_S, type Confidence } from './confidence';
import { RATIO_FREE, createShapeWatch, judgeField, type FieldVerdict, type ShapeWatch } from './fieldCheck';
import type { EarthField } from './geomag';
import { SHOW_DISAGREEMENT_S, SIGMA_SYS_DEG, UPDATE_S, createNorthFilter } from './northFilter';
import { createOrientation } from './orientation';
import { poseOf, type HeadingMode } from './pose';
import { createStreamMerger, type MotionBatch, type StreamKind } from './stream';
import { cross, dot, norm, qFromWorldAxes, qRotate, qRotateInverse, scale, sub, unit, type Vec3 } from './vec';

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
/**
 * North is learned, and the field judged, only in the posture the heading is
 * used in. A phone magnetometer's leftover calibration error (a few µT of
 * hard iron, a few percent of soft iron) points the field a few degrees
 * differently with every posture: learned upright and used flat, it would
 * carry that error over, and a large enough difference reads as the field
 * changing while the phone did not turn. Out of posture, the gyroscope
 * carries the heading and the magnetometer is neither followed nor judged.
 *
 * Flat: the screen within 35° of facing up; it leaves at 45°, the same
 * thresholds at which the dial asks to lay the phone down. Camera: the
 * mirror image, upright beyond 40°, left below 30°.
 */
export const POSTURE = {
  flat: { leaveDeg: 45, returnDeg: 35 },
  camera: { leaveDeg: 30, returnDeg: 40 },
} as const;
/**
 * Within the posture, a reading still says less the further the phone is
 * tilted from where the heading is used (flat for the dial, upright for the
 * camera): degrees of doubt per degree of tilt. A leftover of a few µT turns
 * the field by ~5° at 40° of tilt, so 0.15°/° gives 6° there, and a phone
 * passing through on its way up or down hardly moves north.
 */
export const POSTURE_DOUBT = 0.15;

const UP: Vec3 = [0, 0, 1];

export interface EngineSensors {
  hasGyro: boolean;
  hasMagnetometer: boolean;
  hasUp: boolean;
  /** The up stream is the raw accelerometer (m/s², hand acceleration included) rather than fused gravity. */
  upIsAccelerometer: boolean;
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
  /** The phone is in the posture the heading is used in, so the magnetometer is listened to. */
  inPosture: boolean;
  /** Angle of the screen from facing straight up, degrees. */
  tiltDeg: number;
  tiltResidualDeg: number;
  /** The platform's accuracy reads low but is ignored: the field has matched the model for long enough. */
  calOverridden: boolean;
}

export interface EngineOutput {
  /**
   * North has been found and the headings below are real. Before that (the
   * first 0.3 s, or for as long as an uncalibrated iPhone sends no field)
   * they are NaN, but the confidence still says why.
   */
  ready: boolean;
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
  /** Feed one native batch; returns the latest state, or null before any sample has been seen. */
  push(batch: MotionBatch): EngineOutput | null;
  /** The coordinates' field model changed (or went away); north in the gyro frame is kept. */
  setModel(model: EarthField | null): void;
  /** The haptic actuator just fired: ignore the magnetometer for a moment. */
  noteActuator(): void;
  /** Which posture the heading is used in (see `POSTURE`). Flat by default. */
  setMode(mode: HeadingMode): void;
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
  let calibration: CalibrationWatch = createCalibrationWatch();

  let newestT = -Infinity;
  let maskUntil = -Infinity;
  let mode: HeadingMode = 'flat';
  let inPosture = true;
  let tiltDeg = 0;
  let lastEpoch: number | null = null;
  let lastAccuracy = -1;
  let dropped = 0;
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
  // A field that matches the model in size and dip (see `fieldCheck`).
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

  function watchField(t: number, fieldUt: number, dipDeg: number) {
    if (t - bin.start >= UPDATE_S) {
      if (bin.n > 0 && model) {
        const verdict = judgeField({ magnitudeUt: bin.field / bin.n, dipDeg: bin.dip / bin.n }, model);
        shapeDisturbed = shape.push(verdict, t);
        calibration.field(verdict.impliedDeg === 0 && verdict.ratio < RATIO_FREE && verdict.ratio > 1 / RATIO_FREE, t);
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
      tiltDeg = Math.acos(clamp(up[2], -1, 1)) * RAD;
      const p = POSTURE[mode];
      inPosture =
        mode === 'flat'
          ? tiltDeg <= (inPosture ? p.leaveDeg : p.returnDeg)
          : tiltDeg >= (inPosture ? p.leaveDeg : p.returnDeg);
      lastDip = dipDeg;
      lastField = fieldUt;
      if (!inPosture) return;
      const verdict = model ? judgeField({ magnitudeUt: fieldUt, dipDeg }, model) : null;
      const away = mode === 'flat' ? tiltDeg : Math.abs(90 - tiltDeg);
      const r = measurementVariance(fieldUt, dipDeg, verdict) + (POSTURE_DOUBT * away) ** 2;
      north.measure({ t, thetaDeg: normalizeDeg(Math.atan2(world[0], world[1]) * RAD), rDeg2: r, scoreDeg: verdict?.scoreDeg ?? 0 });
      watchField(t, fieldUt, dipDeg);
      lastVerdict = verdict;
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
    watchField(t, fieldUt, dipDeg);
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
    if (newestT === -Infinity) return null;
    const declination = model?.declination ?? 0;
    let flat = NaN;
    let camera = NaN;
    let pitch = NaN;
    let seeded = false;
    let sigmaDeg = Infinity;
    const ns = north.state();
    let t = newestT;
    if (fused) {
      const now = orientation.ahead(merger.pending('gyro'));
      if (now && ns.seeded) {
        t = now.t;
        const pose = poseOf(now.q);
        flat = normalizeDeg(pose.flat - ns.thetaDeg + declination);
        camera = normalizeDeg(pose.camera - ns.thetaDeg + declination);
        pitch = pose.pitch;
        seeded = true;
        sigmaDeg = Math.sqrt(ns.pDeg2);
      }
    } else if (compass) {
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
      ready: seeded,
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
        inPosture,
        tiltDeg,
        tiltResidualDeg: orientation.tiltResidualDeg,
        calOverridden: calibration.overridden,
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
      // The platform re-estimated the magnetometer's offset: its readings may step, and that step is
      // the calibration improving, not interference. A rise of its accuracy says the same (iOS has no
      // other sign of it); a fall is the platform noticing a disturbance, and hands nothing over.
      const recalibrated =
        (lastEpoch !== null && batch.biasEpoch !== lastEpoch) || (lastAccuracy >= 0 && batch.magAccuracy > lastAccuracy);
      if (recalibrated) north.biasEpoch(newestT);
      lastEpoch = batch.biasEpoch;
      lastAccuracy = batch.magAccuracy;
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
      calibration = createCalibrationWatch();
      shapeDisturbed = false;
    },
    noteActuator() {
      maskUntil = newestT + ACTUATOR_MASK_S;
    },
    setMode(next) {
      if (next === mode) return;
      mode = next;
      // Judged afresh against the new posture at the next reading.
      inPosture = true;
    },
    reset() {
      merger.reset();
      orientation.reset();
      north.reseed();
      shape.reset();
      calibration.reset();
      newestT = -Infinity;
      maskUntil = -Infinity;
      inPosture = true;
      tiltDeg = 0;
      lastEpoch = null;
      lastAccuracy = -1;
      dropped = 0;
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
