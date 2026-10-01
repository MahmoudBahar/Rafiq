import * as Location from 'expo-location';
import { Accelerometer, DeviceMotion, Magnetometer } from 'expo-sensors';
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
  ACCEL_LOWPASS_TAU_S,
  LOCK_ENTER_DEG,
  LOCK_LEAVE_DEG,
  NEAR_DEG,
  attitudeHeading,
  confidence as foldConfidence,
  createDisagreementWatch,
  createFieldFilter,
  createFieldWatch,
  createGyroStillness,
  createHeadingStillness,
  createLowPass,
  declinationFromHeading,
  declinationFromModel,
  downFromAccelerometer,
  earthFrame,
  expectedField,
  fieldShape,
  gravityFromMotion,
  gyroVector,
  headingsFromFrame,
  norm,
  normalizeDeg,
  qiblaBearing,
  shortestDelta,
  unwrap,
  type Band,
  type Confidence,
  type Coords,
  type FieldShape,
  type FieldWatch,
  type Vec3,
} from './engine';

/** Which way the phone is "pointing" for this screen: its top (the dial, held flat) or its back camera. */
export type HeadingMode = 'flat' | 'camera';

/** What the phone offers: fused gravity + gyroscope, the bare accelerometer, or no magnetometer at all. */
export type SensorTier = 'fused' | 'accel' | 'none';

/**
 * Android hands DeviceMotion out once per display frame when the interval has
 * passed (strictly), so 16 ms is every frame at 60 Hz; iOS honours the value.
 */
const MOTION_INTERVAL_MS = Platform.OS === 'android' ? 16 : 20;
/** The magnetometer is the compass truth, so it is read often. */
const FIELD_INTERVAL_MS = 20;
/** How often the confidence state (and the dev readout) is re-evaluated. */
const CONFIDENCE_TICK_MS = 250;
/** An interference reading holds this long so the card does not flicker with the field. */
const INTERFERENCE_HOLD_MS = 2000;
/** The magnetometer has gone quiet: there is no field to trust. */
const FIELD_SILENT_MS = 1000;
/** Without a gyroscope the magnetometer stands alone, so it is let through a little quicker. */
const ACCEL_FILTER_TAU_S = 0.25;
/** Stillness from the heading alone, for a phone without a gyroscope. */
const HEADING_STILL_WINDOW_S = 1;
const HEADING_STILL_RANGE_DEG = 4;
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

/** Raw numbers for a development readout; null in release builds. */
export interface QiblaDebug {
  tier: SensorTier;
  /** Our heading for the current mode, magnetic and true. */
  ourMag: number;
  ourTrue: number;
  /** The platform's fused attitude read as a top-edge heading (flat only); null without it. */
  osAttitude: number | null;
  /** The platform's own compass: magnetic, true (−1 when it has none) and accuracy 0–3. */
  platformMag: number | null;
  platformTrue: number | null;
  accuracy: number | null;
  /** The WMM declination in use, and the platform's (true − magnetic) beside it. */
  declination: number;
  platformDeclination: number | null;
  fieldUt: number;
  expectedUt: number;
  dipDeg: number;
  expectedDip: number;
  pitch: number;
  gyroDegS: number;
  /** Samples per second actually arriving, measured over the last tick. */
  magHz: number;
  motionHz: number;
  still: boolean;
  fieldAnomaly: boolean;
  disagreement: boolean;
  fieldUsable: boolean;
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
  debug: QiblaDebug | null;
}

/** What the coordinates fix for the session: recomputed only when they change. */
interface Model {
  declination: number;
  expected: FieldShape;
  fieldWatch: FieldWatch;
}

/**
 * The live Qibla: sensors in, one smoothed heading out on the UI thread, and
 * the derived band / confidence as React state. Subscribes only while
 * `active` (the tab focused, the app in front): sensors cost battery.
 *
 * North comes from the magnetometer, tilt-corrected by the platform's fused
 * gravity, the way a compass app does it. The gyroscope turns the field
 * estimate between magnetometer readings (see `createFieldFilter`), so the
 * dial follows the hand at once and settles on the magnetometer's truth. The
 * platform's fused attitude and its own compass are only cross-checks for the
 * development readout: on a Samsung the fused sensor sat 145° off for a minute.
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
  const [debug, setDebug] = useState<QiblaDebug | null>(null);

  // The subscription depends on `live` alone. Whatever else a sample needs
  // (mode, the coordinates' model) is read through refs, so a change never
  // tears the sensors down or re-arms the cue.
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  const modelRef = useRef<Model | null>(null);
  const latitude = coords?.latitude;
  const longitude = coords?.longitude;
  useEffect(() => {
    if (latitude === undefined || longitude === undefined) {
      modelRef.current = null;
      return;
    }
    const here = { latitude, longitude };
    const expected = expectedField(here, new Date());
    modelRef.current = { declination: declinationFromModel(here, new Date()), expected, fieldWatch: createFieldWatch(expected) };
  }, [latitude, longitude]);

  // The readings the confidence tick folds; the listeners just drop values here.
  // Plain refs for the JS side: a shared value read on the JS thread right after
  // it was set there can still answer with the old value, so the JS side keeps
  // its own copy of what it last wrote.
  const readings = useRef({
    tier: 'none' as SensorTier,
    sensorsAvailable: true,
    /** Latest gravity, pointing down, device frame; null before the motion sensor speaks. */
    down: null as Vec3 | null,
    fieldUsable: false,
    fieldAnomaly: false,
    disagreement: false,
    interferenceUntil: 0,
    still: false,
    stillForS: 0,
    accuracy: null as number | null,
    lastMagWall: 0,
    magCount: 0,
    motionCount: 0,
    started: false,
    /** The last unwrapped true heading handed to the UI thread. */
    target: 0,
    // For the dev readout only.
    ourMag: 0,
    ourTrue: 0,
    osAttitude: null as number | null,
    platformMag: null as number | null,
    platformTrue: null as number | null,
    fieldUt: 0,
    dip: 0,
    pitch: 0,
    gyroDegS: 0,
    magHz: 0,
    motionHz: 0,
  });

  const appActive = useAppActive();
  const live = active && appActive;

  // Sensors → `target` (JS thread).
  useEffect(() => {
    if (!live) return;
    const r = readings.current;
    let cancelled = false;
    const subs: { remove(): void }[] = [];

    (async () => {
      const [motion, magnet, accel] = await Promise.all([
        DeviceMotion.isAvailableAsync(),
        Magnetometer.isAvailableAsync(),
        Accelerometer.isAvailableAsync(),
      ]);
      if (cancelled) return;
      const tier: SensorTier = magnet && motion ? 'fused' : magnet && accel ? 'accel' : 'none';
      r.tier = tier;
      r.sensorsAvailable = tier !== 'none';
      if (tier === 'none') return;

      const filter = createFieldFilter(tier === 'fused' ? {} : { tauS: ACCEL_FILTER_TAU_S });
      const gyroStill = createGyroStillness();
      const headingStill = createHeadingStillness(HEADING_STILL_WINDOW_S, HEADING_STILL_RANGE_DEG);
      const disagree = createDisagreementWatch();
      const lowPass = createLowPass(ACCEL_LOWPASS_TAU_S);

      const flagInterference = (on: boolean) => {
        if (on) r.interferenceUntil = Date.now() + INTERFERENCE_HOLD_MS;
      };

      /** The filtered field and gravity → the heading for the mode → the UI thread. Returns the magnetic heading. */
      const publish = (): number | null => {
        const m = filter.value();
        const d = r.down;
        const model = modelRef.current;
        if (!m || !d || !model) return null;
        const frame = earthFrame(m, d);
        if (!frame) {
          r.fieldUsable = false;
          return null;
        }
        r.fieldUsable = true;
        const h = headingsFromFrame(frame);
        const magnetic = modeRef.current === 'camera' ? h.cameraHeading : h.flatHeading;
        const trueHeading = normalizeDeg(magnetic + model.declination);
        const next = r.started ? unwrap(r.target, trueHeading) : trueHeading;
        r.target = next;
        if (__DEV__) {
          r.ourMag = magnetic;
          r.ourTrue = trueHeading;
          r.pitch = h.pitch;
        }
        pitch.set(h.pitch);
        target.set(next);
        if (!r.started) {
          // First reading: start there rather than sweeping in from zero.
          r.started = true;
          heading.set(next);
          haveTarget.set(true);
        }
        return magnetic;
      };

      Magnetometer.setUpdateInterval(FIELD_INTERVAL_MS);
      subs.push(
        Magnetometer.addListener(({ x, y, z, timestamp }) => {
          const m: Vec3 = [x, y, z];
          r.magCount++;
          r.lastMagWall = Date.now();
          const d = r.down;
          if (!d) return;
          filter.correct(m, timestamp);
          const shape = fieldShape(m, d);
          const model = modelRef.current;
          if (shape) {
            r.fieldUt = shape.magnitudeUt;
            r.dip = shape.dipDeg;
            if (model) {
              r.fieldAnomaly = model.fieldWatch.push(shape, timestamp);
              flagInterference(r.fieldAnomaly);
            }
          }
          if (tier === 'fused') {
            r.disagreement = disagree.pushMeasured(m, d, timestamp);
            flagInterference(r.disagreement);
          } else {
            const magnetic = publish();
            if (magnetic !== null) {
              const s = headingStill.push(magnetic, timestamp);
              r.still = s.still;
              r.stillForS = s.stillForS;
            }
          }
        }),
      );

      if (tier === 'fused') {
        DeviceMotion.setUpdateInterval(MOTION_INTERVAL_MS);
        subs.push(
          DeviceMotion.addListener(({ acceleration, accelerationIncludingGravity, rotationRate, rotation }) => {
            r.motionCount++;
            if (acceleration && accelerationIncludingGravity) {
              r.down = gravityFromMotion(
                [accelerationIncludingGravity.x, accelerationIncludingGravity.y, accelerationIncludingGravity.z],
                [acceleration.x, acceleration.y, acceleration.z],
              );
            }
            if (rotationRate) {
              const omega = gyroVector(rotationRate, PLATFORM);
              const t = rotationRate.timestamp;
              const rate = norm(omega);
              r.gyroDegS = rate;
              const s = gyroStill.push(rate, t);
              r.still = s.still;
              r.stillForS = s.stillForS;
              filter.rotate(omega, t);
              disagree.pushGyro(omega, t);
            }
            if (__DEV__ && rotation) r.osAttitude = attitudeHeading(rotation.alpha, PLATFORM);
            publish();
          }),
        );
      } else {
        Accelerometer.setUpdateInterval(FIELD_INTERVAL_MS);
        subs.push(
          Accelerometer.addListener(({ x, y, z, timestamp }) => {
            r.motionCount++;
            r.down = lowPass.push(downFromAccelerometer([x, y, z], PLATFORM), timestamp);
          }),
        );
      }

      // The platform's own compass: its accuracy flag, and its headings for the readout.
      const headingSub = await Location.watchHeadingAsync((sample) => {
        r.accuracy = sample.accuracy;
        if (__DEV__) {
          r.platformMag = sample.magHeading;
          r.platformTrue = sample.trueHeading;
        }
      }).catch(() => null);
      if (cancelled) headingSub?.remove();
      else if (headingSub) subs.push(headingSub);
    })();

    // The sensors take a moment to settle after they register; the lock cue is
    // armed only once that has passed, so an opening never rings it.
    const arm = setTimeout(() => primed.set(true), ARM_MS);

    const tick = setInterval(() => {
      const now = Date.now();
      if (r.lastMagWall > 0 && now - r.lastMagWall > FIELD_SILENT_MS) r.fieldUsable = false;
      const model = modelRef.current;
      const next = foldConfidence({
        hasCoords: model !== null,
        sensorsAvailable: r.sensorsAvailable,
        interference: r.fieldAnomaly || r.disagreement || now < r.interferenceUntil,
        fieldUsable: r.fieldUsable,
        accuracy: r.accuracy,
        stillForS: r.stillForS,
      });
      setConfidence((prev) => (prev === next ? prev : next));
      r.magHz = r.magCount * (1000 / CONFIDENCE_TICK_MS);
      r.motionHz = r.motionCount * (1000 / CONFIDENCE_TICK_MS);
      r.magCount = 0;
      r.motionCount = 0;
      if (__DEV__ && r.started && model) {
        setDebug({
          tier: r.tier,
          ourMag: r.ourMag,
          ourTrue: r.ourTrue,
          osAttitude: r.osAttitude,
          platformMag: r.platformMag,
          platformTrue: r.platformTrue,
          accuracy: r.accuracy,
          declination: model.declination,
          platformDeclination:
            r.platformMag !== null && r.platformTrue !== null ? declinationFromHeading(r.platformTrue, r.platformMag) : null,
          fieldUt: r.fieldUt,
          expectedUt: model.expected.magnitudeUt,
          dipDeg: r.dip,
          expectedDip: model.expected.dipDeg,
          pitch: r.pitch,
          gyroDegS: r.gyroDegS,
          magHz: r.magHz,
          motionHz: r.motionHz,
          still: r.still,
          fieldAnomaly: r.fieldAnomaly,
          disagreement: r.disagreement,
          fieldUsable: r.fieldUsable,
        });
      }
    }, CONFIDENCE_TICK_MS);

    return () => {
      cancelled = true;
      clearInterval(tick);
      clearTimeout(arm);
      subs.forEach((s) => s.remove());
      r.down = null;
      r.fieldUsable = false;
      r.fieldAnomaly = false;
      r.disagreement = false;
      r.interferenceUntil = 0;
      r.still = false;
      r.stillForS = 0;
      r.accuracy = null;
      r.lastMagWall = 0;
      r.magCount = 0;
      r.motionCount = 0;
      r.started = false;
      haveTarget.set(false);
      // The next first sample is an opening again, so it is silent again.
      primed.set(false);
    };
  }, [live, pitch, target, heading, haveTarget, primed]);

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
    debug,
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
