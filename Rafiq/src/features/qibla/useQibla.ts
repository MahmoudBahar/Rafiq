import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  Easing,
  useAnimatedReaction,
  useFrameCallback,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import RafiqMotion from '../../../modules/rafiq-motion';
import { lock } from '@/shared/lib/haptics';
import { useMotion } from '@/shared/lib/motion';
import {
  POSTURE,
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
/**
 * The mat rolls up when the phone is raised and unrolls when it lies flat
 * again: critically damped springs (ω 7 rad/s up, a little quicker, 9 rad/s,
 * back down), so it winds without bouncing.
 */
const ROLL_UP = { stiffness: 49, damping: 14, mass: 1 };
const UNROLL = { stiffness: 81, damping: 18, mass: 1 };
/** The dial fades in over this long… */
const READY_FADE_MS = 400;
/** …once north is known to within this (1σ, degrees). Until then it points, but faintly. */
const CONFIDENT_SIGMA_DEG = 20;
/**
 * No batch for this long while the sensors should be running means the feed has gone silent (the
 * developer "Sensors off" tile, a sensor service restarting, CoreMotion stopping): the heading on
 * screen is no longer current…
 */
const SILENT_MS = 1000;
/** …checked this often… */
const WATCHDOG_MS = 500;
/** …and the sensors are restarted at most this often while it lasts. */
const RESTART_EVERY_MS = 5000;
/** How long the repaint nudge runs when the sensors start: a few frames of fresh props (see repaint.ts). */
const REPAINT_MS = 120;
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
  /** 0..1, sprung: the phone is held up instead of flat (the mat rolls up and the screen asks to lay it down). */
  raisedT: SharedValue<number>;
  /** 0 until north is known to within 20°, then fades to 1: until then the dial is unsure and says so by staying faint. */
  readyT: SharedValue<number>;
  /** Which edge of the phone points up (0 top, 90 right, 180 bottom, −90 left): the lay-flat ghost mirrors it. */
  edgeUp: SharedValue<number>;
  /** Nudged for a few frames whenever the sensors start, so styles a background trip could leave stale push fresh props (see repaint.ts). */
  repaint: SharedValue<number>;
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
  /** A heading has arrived since the sensors started; before that the turn numbers mean nothing. */
  ready: boolean;
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
  /** The screen's angle from facing up, any direction (see `EngineOutput.tiltDeg`): what "raised" is judged by. */
  const tilt = useSharedValue(0);
  const edgeUp = useSharedValue(0);
  const lockT = useSharedValue(0);
  const edgeT = useSharedValue(0);
  const raisedT = useSharedValue(0);
  const readyT = useSharedValue(0);
  const repaint = useSharedValue(0);
  const bearingSv = useSharedValue(bearing ?? 0);
  const haveTarget = useSharedValue(false);
  /** The compass has read good for a moment since the sensors started: only then does a lock get its cue. */
  const primed = useSharedValue(false);
  // UI-thread bookkeeping for the band, the turn number and the posture.
  const bandSv = useSharedValue<Band>('far');
  const shownTurn = useSharedValue(-1);
  const raisedSv = useSharedValue(false);
  const trustedSv = useSharedValue(false);
  useEffect(() => {
    bearingSv.set(bearing ?? 0);
  }, [bearing, bearingSv]);

  const [band, setBand] = useState<Band>('far');
  const [turn, setTurn] = useState({ deg: 0, right: true });
  const [raised, setRaised] = useState(false);
  const [ready, setReady] = useState(false);
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
  const reducedRef = useRef(reduced);
  useEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);
  const engineRef = useRef<QiblaEngine | null>(null);
  useEffect(() => {
    modeRef.current = mode;
    engineRef.current?.setMode(mode);
  }, [mode]);
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
      },
      modelRef.current,
    );
    engine.setMode(modeRef.current);
    engineRef.current = engine;
    // Plain locals for the JS side: a shared value read back on the JS thread right after a
    // JS-thread write can still answer with the old value.
    let started = false;
    let last = 0;
    let shown: Confidence | null = null;
    let latest: QiblaDebug | null = null;
    let arm: ReturnType<typeof setTimeout> | null = null;
    let shownFull = false;

    let lastBatchAt = Date.now();
    let lastRestart = 0;
    // The heading in hand is no longer current (north is being found again, or the feed went
    // silent): the dial goes faint, the hint says it is finding the direction, the band starts over.
    const lose = () => {
      if (!started) return;
      started = false;
      shownFull = false;
      haveTarget.set(false);
      readyT.set(reducedRef.current ? 0 : withTiming(0, { duration: READY_FADE_MS }));
      bandSv.set('far');
      shownTurn.set(-1);
      setReady(false);
      setBand('far');
    };

    const sub = module.addListener('batch', (batch) => {
      lastBatchAt = Date.now();
      const out = engine.push(batch);
      if (!out) return;
      // Before north is found there is no heading, but the confidence still says why
      // (an iPhone sends no field at all until its magnetometer is calibrated).
      const raw = modeRef.current === 'camera' ? out.camera : out.flat;
      // The tilt arrives before north does: held upright, the phone is asked to lie flat at once.
      if (Number.isFinite(out.pitch)) pitch.set(out.pitch);
      if (Number.isFinite(out.tiltDeg)) tilt.set(out.tiltDeg);
      if (Number.isFinite(out.edgeUpDeg)) edgeUp.set(out.edgeUpDeg);
      // North is being found again (a gap in the gyro).
      if (!out.ready) lose();
      if (out.ready) {
        const next = started ? unwrap(last, raw) : raw;
        last = next;
        target.set(next);
        if (!started) {
          // First heading: start there rather than sweeping in from zero.
          started = true;
          heading.set(next);
          haveTarget.set(true);
          setReady(true);
        }
        if (!shownFull && out.sigmaDeg <= CONFIDENT_SIGMA_DEG) {
          // Confident now: the dial comes up to full strength.
          shownFull = true;
          readyT.set(reducedRef.current ? 1 : withTiming(1, { duration: READY_FADE_MS }));
        }
      }
      if (out.confidence !== shown) {
        shown = out.confidence;
        setSensed(out.confidence);
        if (out.confidence === 'good' && arm === null) arm = setTimeout(() => primed.set(true), ARM_MS);
      }
      if (__DEV__) latest = { ...out.debug, heading: raw };
    });
    module.start();
    // Back in front (or on the tab): the views take their current values afresh (see repaint.ts).
    repaint.set(withSequence(withTiming(1, { duration: REPAINT_MS }), withTiming(0, { duration: 0 })));

    const tick = __DEV__ ? setInterval(() => latest && setDebug(latest), DEBUG_TICK_MS) : null;

    // A silent feed would otherwise leave the last heading, the pill and a lit lamp standing while
    // the user turns. When the samples come back, the engine sees a gyro gap and finds north again.
    const watchdog = setInterval(() => {
      const now = Date.now();
      if (now - lastBatchAt < SILENT_MS) return;
      lose();
      if (shown !== 'settling') {
        shown = 'settling';
        setSensed('settling');
      }
      if (now - lastRestart > RESTART_EVERY_MS) {
        lastRestart = now;
        module.stop();
        module.start();
      }
    }, WATCHDOG_MS);

    return () => {
      sub.remove();
      module.stop();
      if (tick) clearInterval(tick);
      clearInterval(watchdog);
      if (arm) clearTimeout(arm);
      engineRef.current = null;
      haveTarget.set(false);
      readyT.set(0);
      setReady(false);
      // The next start is an opening again, so it is silent again.
      primed.set(false);
      // The pill keeps its state while the sensors are off: changing it off-screen or in the
      // background animated its width with no frames to draw, leaving it at the old width.
      // The first reading of the next session sets it, in view.
      // A lock belongs to the session that found it: the band starts over from far and is
      // judged afresh from the first new heading (silently, as the cue is not armed yet).
      bandSv.set('far');
      shownTurn.set(-1);
      lockT.set(0);
      edgeT.set(0);
      setBand('far');
      setTurn({ deg: 0, right: true });
    };
  }, [live, available, heading, target, pitch, tilt, edgeUp, haveTarget, readyT, primed, bandSv, shownTurn, lockT, edgeT, repaint]);

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

  // The lamp, the halo and the lock cue are for a compass that can be believed: within 3° of
  // the Qibla on a disturbed or uncalibrated compass, nothing lights up (the hint says why).
  useEffect(() => {
    trustedSv.set(confidence === 'good');
  }, [confidence, trustedSv]);

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
  useAnimatedReaction(
    // Nothing to judge before the first heading: `delta` starts at 0, which is not a lock.
    () => (haveTarget.get() ? delta.get() : null),
    (d) => {
      if (d === null) return;
      const prev = bandSv.get();
      const next = bandFor(d, prev);
      if (next !== prev) {
        bandSv.set(next);
        scheduleOnRN(setBand, next);
        // No cue while the phone is held up (the mat is rolled away and the screen is asking to lay
        // it down), nor on a compass that cannot be believed.
        if (next === 'locked' && primed.get() && !raisedSv.get() && trustedSv.get()) {
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

  // The mat lights while locked on a trusted compass, and goes out when either stops.
  useAnimatedReaction(
    () => bandSv.get() === 'locked' && trustedSv.get(),
    (lit, was) => {
      if (lit !== was) lockT.set(withTiming(lit ? 1 : 0, { duration: LOCK_FADE_MS }));
    },
  );

  // Posture: the dial wants the phone flat, the camera wants it up. The same measure (the screen's
  // tilt, in any direction: raised, tipped toward the user, on its side or face down) and the same
  // thresholds (`POSTURE`) at which the engine stops and starts listening to the magnetometer, so
  // the screen asks to lay the phone flat exactly when the compass stops being corrected.
  const { flat: FLAT, camera: CAMERA } = POSTURE;
  useAnimatedReaction(
    () => tilt.get(),
    (p) => {
      const was = raisedSv.get();
      const is =
        mode === 'flat'
          ? p > (was ? FLAT.returnDeg : FLAT.leaveDeg)
          : p < (was ? CAMERA.returnDeg : CAMERA.leaveDeg);
      if (is !== was) {
        raisedSv.set(is);
        raisedT.set(reduced ? (is ? 1 : 0) : withSpring(is ? 1 : 0, is ? ROLL_UP : UNROLL));
        scheduleOnRN(setRaised, is);
      }
    },
    [mode, reduced],
  );

  return {
    bearing,
    band,
    turnDeg: turn.deg,
    turnRight: turn.right,
    confidence,
    ready,
    raised,
    values: { heading, delta, pitch, lockT, edgeT, raisedT, readyT, edgeUp, repaint },
    debug,
  };
}

function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState !== 'background');
  useEffect(() => {
    // iOS reports 'inactive' for a pulled-down notification shade, the app switcher or a system
    // alert (the location prompt behind «تحديد موقعي»): the app is still on screen, so the compass
    // keeps running rather than starting over. Only the background stops it.
    const sub = AppState.addEventListener('change', (s) => setActive(s !== 'background'));
    return () => sub.remove();
  }, []);
  return active;
}
