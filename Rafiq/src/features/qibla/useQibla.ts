import * as Location from 'expo-location';
import { DeviceMotion, Magnetometer } from 'expo-sensors';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import {
  useAnimatedReaction,
  useFrameCallback,
  useSharedValue,
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
  createStillness,
  declinationFromHeading,
  declinationFromModel,
  headingsFromAttitude,
  magneticToTrue,
  qiblaBearing,
  shortestDelta,
  toW3C,
  unwrap,
  type Band,
  type Confidence,
  type Coords,
} from './engine';

/** Which way the phone is "pointing" for this screen: its top (the dial, held flat) or its back camera. */
export type HeadingMode = 'flat' | 'camera';

const MOTION_INTERVAL_MS = 33;
const FIELD_INTERVAL_MS = 200;
/** How often the confidence state is re-evaluated. */
const CONFIDENCE_TICK_MS = 250;
/** An interference reading holds this long so the card does not flicker with the field. */
const INTERFERENCE_HOLD_MS = 2000;
/** Per-frame pull toward the sensor heading at 60 fps: fast enough to feel live, slow enough to hide sensor grain. */
const SMOOTH_PER_FRAME = 0.18;
const REDUCED_PER_FRAME = 0.5;
const FRAME_MS = 1000 / 60;
const LOCK_FADE_MS = 250;
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
 */
export function useQibla(coords: Coords | null, mode: HeadingMode, active: boolean): Qibla {
  const { reduced } = useMotion();
  const bearing = useMemo(() => (coords ? qiblaBearing(coords) : null), [coords]);

  const heading = useSharedValue(0);
  const target = useSharedValue(0);
  const delta = useSharedValue(0);
  const pitch = useSharedValue(0);
  const lockT = useSharedValue(0);
  const bearingSv = useSharedValue(bearing ?? 0);
  const haveTarget = useSharedValue(false);
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
  const readings = useRef({
    sensorsAvailable: true,
    fieldAnomaly: false,
    accuracy: null as number | null,
    declination: null as number | null,
    jump: false,
    stableForMs: 0,
    interferenceUntil: 0,
  });
  const stillness = useMemo(() => createStillness(STILLNESS), []);
  const fieldWatch = useMemo(() => createFieldWatch(), []);

  // Sensors → `target` (JS thread). The declination comes from the platform's own
  // true/magnetic pair when it has one, else from the magnetic model.
  const appActive = useAppActive();
  const live = active && appActive;
  const latitude = coords?.latitude;
  const longitude = coords?.longitude;
  useEffect(() => {
    if (!live || latitude === undefined || longitude === undefined) return;
    const r = readings.current;
    let cancelled = false;
    const subs: { remove(): void }[] = [];
    const modelDeclination = declinationFromModel({ latitude, longitude }, new Date());

    (async () => {
      const [motion, magnet] = await Promise.all([DeviceMotion.isAvailableAsync(), Magnetometer.isAvailableAsync()]);
      if (cancelled) return;
      r.sensorsAvailable = motion && magnet;
      if (!r.sensorsAvailable) return;

      DeviceMotion.setUpdateInterval(MOTION_INTERVAL_MS);
      subs.push(
        DeviceMotion.addListener(({ rotation }) => {
          if (!rotation) return;
          const h = headingsFromAttitude(toW3C(rotation, PLATFORM));
          const magnetic = mode === 'camera' ? h.cameraHeading : h.flatHeading;
          const trueHeading = magneticToTrue(magnetic, r.declination ?? modelDeclination);
          const still = stillness.push(trueHeading, Date.now());
          r.stableForMs = still.stableForMs;
          if (still.jump) r.interferenceUntil = Date.now() + INTERFERENCE_HOLD_MS;
          pitch.set(h.pitch);
          target.set(unwrap(target.get(), trueHeading));
          if (!haveTarget.get()) {
            // First reading: start there rather than sweeping in from zero.
            heading.set(target.get());
            haveTarget.set(true);
          }
        }),
      );

      Magnetometer.setUpdateInterval(FIELD_INTERVAL_MS);
      subs.push(
        Magnetometer.addListener(({ x, y, z }) => {
          r.fieldAnomaly = fieldWatch.push(Math.hypot(x, y, z), Date.now());
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
      subs.forEach((s) => s.remove());
      r.fieldAnomaly = false;
      r.accuracy = null;
      r.stableForMs = 0;
      haveTarget.set(false);
    };
  }, [live, latitude, longitude, mode, stillness, fieldWatch, pitch, target, heading, haveTarget]);

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
  const primed = useSharedValue(false);
  const shown = useSharedValue(-1);
  useAnimatedReaction(
    () => delta.get(),
    (d) => {
      const a = Math.abs(d);
      const prev = bandSv.get();
      const next: Band =
        a <= (prev === 'locked' ? LOCK_LEAVE_DEG : LOCK_ENTER_DEG) ? 'locked' : a <= NEAR_DEG ? 'near' : 'far';
      if (next !== prev) {
        bandSv.set(next);
        lockT.set(withTiming(next === 'locked' ? 1 : 0, { duration: LOCK_FADE_MS }));
        scheduleOnRN(setBand, next);
        if (next === 'locked' && primed.get()) scheduleOnRN(lock);
      }
      primed.set(true);
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
    values: { heading, delta, pitch, lockT },
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
