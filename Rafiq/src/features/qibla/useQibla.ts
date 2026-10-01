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
  RESET_STEP_DEG,
  SETTLE_MS,
  confidence as foldConfidence,
  createFieldWatch,
  createHeadingFuser,
  createSignCheck,
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
  upFromAttitude,
  type Band,
  type Confidence,
  type Coords,
  type FieldWatch,
  type SignCheck,
} from './engine';

/** Which way the phone is "pointing" for this screen: its top (the dial, held flat) or its back camera. */
export type HeadingMode = 'flat' | 'camera';

const MOTION_INTERVAL_MS = 33;
/** The magnetometer is the compass truth, so it is read often. */
const FIELD_INTERVAL_MS = 50;
/** How often the confidence state (and the dev readout) is re-evaluated. */
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
/** A leap must hold for three samples (~100 ms) to be a jump; one is a magnetometer spike. */
const STILLNESS = { windowMs: 1000, stableRangeDeg: 4, jumpDeg: 15, jumpSamples: 3 };
/**
 * The fused step a sample may contribute: what the gyroscope says the phone
 * turned in that interval, with slack, plus a margin for sensor grain. A
 * larger step is a platform correction of its own yaw, not a turn of the hand.
 */
const GATE_MARGIN_DEG = 6;
const GATE_SLACK = 1.5;
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
  compass: number;
  fused: number;
  platform: string;
  fieldUt: number;
  dipDeg: number;
  pitch: number;
  /** The dip is reading mirrored against the model: a convention to pin, or a reversed magnet nearby. */
  mirrored: boolean;
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
  fieldWatch: FieldWatch;
  signCheck: SignCheck;
}

/**
 * The live Qibla: sensors in, one smoothed heading out on the UI thread, and
 * the derived band / confidence as React state. Subscribes only while
 * `active` (the tab focused, the app in front): sensors cost battery.
 *
 * North comes from the magnetometer, tilt-corrected by gravity, the way a
 * compass app does it. The fused rotation sensor contributes its pitch and
 * roll (the tilt, gyro-stabilised and free of the hand's own acceleration)
 * and its motion between magnetometer readings, and is pulled back onto the
 * compass every sample: its absolute heading is never trusted (on a Samsung
 * it sat 145° off for a minute on a still desk while reporting accuracy 3).
 * The magnetometer runs at 20 Hz against the 30 Hz motion loop, so a compass
 * sample can be up to 50 ms old; the fused motion covers the gap.
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
  // tears the sensors down, resets the fuser or re-arms the cue.
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
    const field = expectedField(here, new Date());
    modelRef.current = {
      declination: declinationFromModel(here, new Date()),
      fieldWatch: createFieldWatch(field),
      signCheck: createSignCheck(field.dipDeg),
    };
  }, [latitude, longitude]);

  // The readings the confidence tick folds; the listeners just drop values here.
  // Plain refs for the JS side: a shared value read on the JS thread right after
  // it was set there can still answer with the old value, so the JS side keeps
  // its own copy of what it last wrote.
  const readings = useRef({
    sensorsAvailable: true,
    fieldAnomaly: false,
    accuracy: null as number | null,
    /** The platform's own declination when it has one (its true − magnetic). */
    declination: null as number | null,
    stableForMs: 0,
    /** Trust earned by holding still: kept once earned, so moving the phone does not fall back to "settling". */
    settled: false,
    interferenceUntil: 0,
    /** Latest calibrated field, device frame (µT); null before the magnetometer speaks. */
    mag: null as readonly number[] | null,
    started: false,
    // For the dev readout only.
    /** The dip is reading mirrored (see createSignCheck). */
    mirrored: false,
    compass: 0,
    fused: 0,
    locMag: null as number | null,
    locTrue: null as number | null,
    fieldUt: 0,
    dip: 0,
    pitch: 0,
  });
  const stillness = useMemo(() => createStillness(STILLNESS), []);
  const fuser = useMemo(() => createHeadingFuser(), []);

  const appActive = useAppActive();
  const live = active && appActive;

  // Sensors → `target` (JS thread).
  useEffect(() => {
    if (!live) return;
    const r = readings.current;
    let cancelled = false;
    const subs: { remove(): void }[] = [];

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
        DeviceMotion.addListener(({ rotation, rotationRate, interval }) => {
          const model = modelRef.current;
          if (!rotation || !r.mag || !model) return;
          const now = Date.now();
          const mode = modeRef.current;
          const declination = r.declination ?? model.declination;
          const attitude = toW3C(rotation, PLATFORM);

          // Down from the fused sensor's pitch and roll (gyro-stabilised, free of the
          // hand's own acceleration, untouched by its yaw); north from the magnetometer.
          const up = upFromAttitude(attitude);
          const down = [-up[0], -up[1], -up[2]];
          const m = r.mag;
          const dip = dipDeg(m, down);
          // Diagnostic only (see createSignCheck): a mirrored dip is either a platform
          // convention we have not pinned, or a reversed magnet nearby. It changes nothing.
          if (__DEV__) {
            const mirrored = model.signCheck.push(dip, now);
            if (mirrored && !r.mirrored) console.warn('[qibla] the dip has read mirrored for a second');
            r.mirrored = mirrored;
          }
          const field = headingsFromField(m, down);
          const magnetic = mode === 'camera' ? field.cameraHeading : field.flatHeading;
          const compass = magneticToTrue(magnetic, declination);

          // The motion: the fused sensor, whose changes are trusted and whose heading is not.
          // The gyroscope bounds how far a real turn could have gone this sample.
          const fused = headingsFromAttitude(attitude);
          const motionHeading = magneticToTrue(mode === 'camera' ? fused.cameraHeading : fused.flatHeading, declination);
          const dt = (interval > 0 ? interval : MOTION_INTERVAL_MS) / 1000;
          const rate = rotationRate ? Math.hypot(rotationRate.alpha, rotationRate.beta, rotationRate.gamma) : null;
          const maxStep = rate === null ? RESET_STEP_DEG : GATE_MARGIN_DEG + GATE_SLACK * rate * dt;
          const next = fuser.push(compass, motionHeading, maxStep);

          const still = stillness.push(compass, now);
          r.stableForMs = still.stableForMs;
          if (still.stableForMs >= SETTLE_MS) r.settled = true;
          if (still.jump) r.interferenceUntil = now + INTERFERENCE_HOLD_MS;
          const fieldUt = Math.hypot(m[0], m[1], m[2]);
          r.fieldAnomaly = model.fieldWatch.push({ magnitudeUt: fieldUt, dipDeg: dip }, now);

          if (__DEV__) {
            r.compass = compass;
            r.fused = motionHeading;
            r.fieldUt = fieldUt;
            r.dip = dip;
            r.pitch = field.pitch;
          }

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
        if (__DEV__) {
          r.locMag = sample.magHeading;
          r.locTrue = sample.trueHeading;
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
      const next = foldConfidence({
        hasCoords: modelRef.current !== null,
        sensorsAvailable: r.sensorsAvailable,
        fieldAnomaly: r.fieldAnomaly,
        jump: now < r.interferenceUntil,
        accuracy: r.accuracy,
        // "Settling" is for a feed that has not earned trust yet, not for a phone in motion.
        stableForMs: r.settled ? SETTLE_MS : r.stableForMs,
      });
      setConfidence((prev) => (prev === next ? prev : next));
      if (__DEV__ && r.started) {
        setDebug({
          compass: r.compass,
          fused: r.fused,
          platform: `${r.locMag === null ? '—' : Math.round(r.locMag)}/${r.locTrue === null ? '—' : Math.round(r.locTrue)} acc ${r.accuracy ?? '—'}`,
          fieldUt: r.fieldUt,
          dipDeg: r.dip,
          pitch: r.pitch,
          mirrored: r.mirrored,
        });
      }
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
      r.settled = false;
      r.mag = null;
      r.started = false;
      haveTarget.set(false);
      // The next first sample is an opening again, so it is silent again.
      primed.set(false);
    };
  }, [live, stillness, fuser, pitch, target, heading, haveTarget, primed]);

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
