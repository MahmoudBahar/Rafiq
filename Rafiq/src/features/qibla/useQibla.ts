import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
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
import RafiqMotion from '../../../modules/rafiq-motion';
import { lock } from '@/shared/lib/haptics';
import { useMotion } from '@/shared/lib/motion';
import {
  bandFor,
  createQiblaEngine,
  earthField,
  qiblaBearing,
  unwrap,
  wrap180,
  type Band,
  type Confidence,
  type Coords,
  type EngineDebug,
  type HeadingMode,
  type QiblaEngine,
} from './engine';

export type { HeadingMode } from './engine';

/** The screen eases toward the engine's heading over this long: just enough to hide the per-frame batches. */
const EASE_MS = 40;
const REDUCED_EASE_MS = 15;
const FRAME_MS = 1000 / 60;
const LOCK_FADE_MS = 250;
/** The edge bloom on lock: a quick rise, a slow fade. */
const EDGE_IN_MS = 140;
const EDGE_OUT_MS = 900;
/** The lock cue is armed this long after the compass first reads good: an opening never rings it. */
const ARM_MS = 500;
/** How often the dev readout refreshes. */
const DEBUG_TICK_MS = 250;

export interface QiblaValues {
  /** True heading, eased, unwrapped (runs past 360 rather than wrapping), so rotations stay continuous. */
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

/** The engine's raw numbers for a development readout; null in release builds. */
export type QiblaDebug = EngineDebug & { heading: number };

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

/**
 * The live Qibla: native sensor batches in, one heading out on the UI
 * thread, band / confidence as React state. Sensors run only while `active`
 * (the tab focused) and the app is in front.
 *
 * The engine (see `engine/engine.ts`) takes tilt from the platform's gravity,
 * turning from the gyroscope and north from the magnetometer; this hook only
 * wires it to the screen. A coordinates change updates the bearing and the
 * field model without restarting the sensors; a restart of the sensors
 * starts the engine over, since the gyroscope's frame is new.
 */
export function useQibla(coords: Coords | null, mode: HeadingMode, active: boolean): Qibla {
  const { reduced } = useMotion();
  const bearing = useMemo(() => (coords ? qiblaBearing(coords).bearing : null), [coords]);

  const heading = useSharedValue(0);
  const target = useSharedValue(0);
  const delta = useSharedValue(0);
  const pitch = useSharedValue(0);
  const lockT = useSharedValue(0);
  const edgeT = useSharedValue(0);
  const bearingSv = useSharedValue(bearing ?? 0);
  const haveTarget = useSharedValue(false);
  /** The compass has read good for a moment since the sensors started: only then does a lock get its cue. */
  const primed = useSharedValue(false);
  useEffect(() => {
    bearingSv.set(bearing ?? 0);
  }, [bearing, bearingSv]);

  const [band, setBand] = useState<Band>('far');
  const [turn, setTurn] = useState({ deg: 0, right: true });
  const [raised, setRaised] = useState(false);
  // What this phone has never changes: asked once.
  const available = useMemo(() => {
    const a = RafiqMotion?.getAvailability();
    return a && a.magnetometer && a.up ? a : null;
  }, []);
  const [sensed, setSensed] = useState<Exclude<Confidence, 'no-location'>>('settling');
  const confidence: Confidence = !coords ? 'no-location' : available ? sensed : 'unavailable';
  const [debug, setDebug] = useState<QiblaDebug | null>(null);

  // Read by the sensor listener through refs, so neither change tears the sensors down.
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  const engineRef = useRef<QiblaEngine | null>(null);
  const latitude = coords?.latitude;
  const longitude = coords?.longitude;
  const model = useMemo(
    () => (latitude === undefined || longitude === undefined ? null : earthField({ latitude, longitude }, new Date())),
    [latitude, longitude],
  );
  const modelRef = useRef(model);
  useEffect(() => {
    modelRef.current = model;
    engineRef.current?.setModel(model);
  }, [model]);

  const appActive = useAppActive();
  const live = active && appActive;

  // Native batches → engine → `target` (JS thread).
  useEffect(() => {
    const module = RafiqMotion;
    if (!live || !module || !available) return;
    const engine = createQiblaEngine(
      {
        hasGyro: available.gyro,
        hasMagnetometer: available.magnetometer,
        hasUp: available.up,
        upIsAccelerometer: available.upIsAccelerometer,
        trustAccuracy: available.trustAccuracy,
      },
      modelRef.current,
    );
    engineRef.current = engine;
    // Plain locals for the JS side: a shared value read back on the JS thread right after a
    // JS-thread write can still answer with the old value.
    let started = false;
    let last = 0;
    let shown: Confidence | null = null;
    let latest: QiblaDebug | null = null;
    let arm: ReturnType<typeof setTimeout> | null = null;

    const sub = module.addListener('batch', (batch) => {
      const out = engine.push(batch);
      if (!out) return;
      const raw = modeRef.current === 'camera' ? out.camera : out.flat;
      const next = started ? unwrap(last, raw) : raw;
      last = next;
      pitch.set(out.pitch);
      target.set(next);
      if (!started) {
        // First heading: start there rather than sweeping in from zero.
        started = true;
        heading.set(next);
        haveTarget.set(true);
      }
      if (out.confidence !== shown) {
        shown = out.confidence;
        setSensed(out.confidence);
        if (out.confidence === 'good' && arm === null) arm = setTimeout(() => primed.set(true), ARM_MS);
      }
      if (__DEV__) latest = { ...out.debug, heading: raw };
    });
    module.start();

    const tick = __DEV__ ? setInterval(() => latest && setDebug(latest), DEBUG_TICK_MS) : null;

    return () => {
      sub.remove();
      module.stop();
      if (tick) clearInterval(tick);
      if (arm) clearTimeout(arm);
      engineRef.current = null;
      haveTarget.set(false);
      // The next start is an opening again, so it is silent again.
      primed.set(false);
      setSensed('settling');
    };
  }, [live, available, heading, target, pitch, haveTarget, primed]);

  // `target` → `heading` (UI thread), every frame while live.
  const easeMs = reduced ? REDUCED_EASE_MS : EASE_MS;
  const frame = useFrameCallback((info) => {
    'worklet';
    if (!haveTarget.get()) return;
    const dt = info.timeSincePreviousFrame ?? FRAME_MS;
    const pull = 1 - Math.exp(-dt / easeMs);
    const h = heading.get() + (target.get() - heading.get()) * pull;
    heading.set(h);
    delta.set(wrap180(bearingSv.get(), h));
  }, false);
  useEffect(() => {
    frame.setActive(live);
  }, [frame, live]);

  // The lock cue also tells the engine: the haptic actuator is a magnet, and the
  // magnetometer is ignored while it runs.
  const ring = useMemo(
    () => () => {
      lock();
      engineRef.current?.noteActuator();
    },
    [],
  );

  // Band with hysteresis, the lock cue, and the turn hint's number, from the UI thread.
  // The cue is for turning into the lock: a page that opens already on the
  // Qibla shows it without a sound, like the wheel, which is silent on open.
  const bandSv = useSharedValue<Band>('far');
  const shownTurn = useSharedValue(-1);
  useAnimatedReaction(
    // Nothing to judge before the first heading: `delta` starts at 0, which is not a lock.
    () => (haveTarget.get() ? delta.get() : null),
    (d) => {
      if (d === null) return;
      const prev = bandSv.get();
      const next = bandFor(d, prev);
      if (next !== prev) {
        bandSv.set(next);
        lockT.set(withTiming(next === 'locked' ? 1 : 0, { duration: LOCK_FADE_MS }));
        scheduleOnRN(setBand, next);
        if (next === 'locked' && primed.get()) {
          scheduleOnRN(ring);
          edgeT.set(
            withSequence(
              withTiming(1, { duration: EDGE_IN_MS }),
              withTiming(0, { duration: EDGE_OUT_MS, easing: Easing.out(Easing.quad) }),
            ),
          );
        }
      }
      const deg = next === 'locked' ? 0 : Math.round(Math.abs(d));
      const code = deg * 2 + (d >= 0 ? 1 : 0);
      if (code !== shownTurn.get()) {
        shownTurn.set(code);
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
