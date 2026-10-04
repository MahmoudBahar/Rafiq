import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useMotion } from '@/shared/lib/motion';
import { useTheme } from '@/shared/theme/useTheme';
import { snapQuarter } from '../engine';
import { repainted } from '../repaint';

/** How far the ghost phone tips: almost lying on the floor line, still readable as a phone. */
const LAID_DEG = 78;
/** One demonstration: stand 0.3 s, lie down over 1 s, stay 0.6 s, stand up again over 0.5 s. */
const STAND_MS = 290;
const LIE_MS = 1030;
const STAY_MS = 600;
const RISE_MS = 480;
const SLOW = 2.5;
const EASE = Easing.bezier(0.6, 0.05, 0.3, 1);
/**
 * The ghost stands in one of four positions, like a phone's screen rotation: upright, on either
 * side, or upside down. It holds still through the hand's wobble and moves on only once the phone
 * is this far past the halfway point (45°) toward the next position…
 */
const SNAP_HYSTERESIS_DEG = 20;
/** …with one quick quarter turn. */
const TURN_MS = 300;

interface LayFlatCoachProps {
  /** 0..1, the phone held up (the mat rolls up first; this follows once it is nearly rolled). */
  t: SharedValue<number>;
  /** Which edge of the phone points up (0 top, 90 right, 180 bottom, −90 left): the ghost stands the same way. */
  edgeUp: SharedValue<number>;
  /** Nudged when the sensors start, so the fade pushes fresh props (see repaint.ts). */
  repaint: SharedValue<number>;
  /** Run the demonstration loop: only while the phone is held up, so nothing animates otherwise. */
  active: boolean;
  /** The dial's size: the coach scales with it. */
  size: number;
}

/** The ghost phone, in dial units (scaled by size / 196): a 40 × 72 portrait phone. */
const PHONE_W = 40;
const PHONE_H = 72;
const DEG = Math.PI / 180;

/**
 * What to do, shown rather than described: a ghost phone standing on a floor
 * line lies down on it, again and again. The ghost stands the way the phone is
 * held: upright, on its side, or tipped toward the user (upside down), snapped
 * to those four positions so the hand's wobble never moves it; a clear change of
 * position turns it once, a quarter turn.
 * Whatever edge it stands on, it tips back about the floor line and lies flat.
 * The words («ضع الهاتف مستويًا») are the hint line's, under the dial. It fades
 * in once the mat has rolled up and out as it unrolls. (Face down has no
 * demonstration: the screen cannot be seen.)
 */
export function LayFlatCoach({ t, edgeUp, repaint, active, size }: LayFlatCoachProps) {
  const { c } = useTheme();
  const { reduced } = useMotion();
  const tip = useSharedValue(0);
  const k = size / 196;
  // The position the ghost holds (a multiple of 90°, unwrapped so a turn always goes the short
  // way), and the angle drawn, which eases to it.
  const quarter = useSharedValue(0);
  const held = useSharedValue(0);

  // Raised: the ghost takes the nearest position at once, with no turn on the way in.
  useEffect(() => {
    if (!active) return;
    const q = Math.round(edgeUp.get() / 90) * 90;
    quarter.set(q);
    held.set(q);
  }, [active, edgeUp, quarter, held]);

  // Held up: a new position only once the phone is clearly in it. Flat, the ghost is hidden and
  // which edge is "up" is the direction of a near-zero vector: nothing is judged.
  useAnimatedReaction(
    () => (t.get() > 0 ? edgeUp.get() : null),
    (a) => {
      if (a === null) return;
      const q = quarter.get();
      const next = snapQuarter(q, a, SNAP_HYSTERESIS_DEG);
      if (next === q) return;
      quarter.set(next);
      held.set(reduced ? next : withTiming(next, { duration: TURN_MS, easing: Easing.out(Easing.cubic) }));
    },
    [reduced],
  );

  useEffect(() => {
    if (!active) {
      cancelAnimation(tip);
      tip.set(0);
      return;
    }
    const pace = reduced ? SLOW : 1;
    tip.set(
      withRepeat(
        withSequence(
          withDelay(STAND_MS * pace, withTiming(LAID_DEG, { duration: LIE_MS * pace, easing: EASE })),
          withDelay(STAY_MS * pace, withTiming(0, { duration: RISE_MS * pace, easing: EASE })),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(tip);
  }, [active, reduced, tip]);

  const shown = useAnimatedStyle(() => {
    const x = Math.min(1, Math.max(0, (t.get() - 0.75) / 0.25));
    const e = x * x * (3 - 2 * x);
    return { opacity: repainted(e, repaint.get()), transform: [{ translateY: (1 - e) * 14 * k + 34 * k }] };
  });
  // The app is portrait-locked, so with the phone on its side the whole screen is turned in the hand.
  // The scene (floor line and ghost) is turned back so it stands upright in the room: its floor is the
  // room's floor, whichever edge of the phone is up.
  const scene = useAnimatedStyle(() => ({ transform: [{ rotate: `${held.get()}deg` }] }));
  // Tipping back about the floor line, whichever edge the ghost stands on.
  const stage = useAnimatedStyle(() => ({
    transform: [{ perspective: 260 * k }, { rotateX: `${tip.get()}deg` }],
  }));
  // Standing the way the phone is held: within the upright scene, turned so the edge that points up on
  // the phone points up on the ghost (on its long edge when held sideways, upside down when tipped
  // toward the user), then lowered until its lowest side rests on the floor line.
  const pose = useAnimatedStyle(() => {
    const a = held.get() * DEG;
    const halfExtent = (Math.abs(Math.cos(a)) * PHONE_H + Math.abs(Math.sin(a)) * PHONE_W) / 2;
    return {
      transform: [{ translateY: (PHONE_H / 2 - halfExtent) * k }, { rotate: `${-held.get()}deg` }],
    };
  });

  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, shown]}>
      <Animated.View style={[{ width: 120 * k, height: 92 * k }, scene]}>
        <View style={[styles.floor, { left: 6 * k, right: 6 * k, bottom: 8 * k, backgroundColor: c.tm }]} />
        <Animated.View style={[styles.stage, stage, { width: PHONE_H * k, height: PHONE_H * k, marginLeft: (-PHONE_H / 2) * k, bottom: 10 * k }]}>
          <Animated.View
            style={[
              styles.ghost,
              pose,
              {
                width: PHONE_W * k,
                height: PHONE_H * k,
                left: ((PHONE_H - PHONE_W) / 2) * k,
                borderRadius: 9 * k,
                borderColor: c.accent,
                backgroundColor: `${c.accent}1f`,
              },
            ]}
          >
            <View style={[styles.speaker, { width: 10 * k, height: 3 * k, top: 5 * k, backgroundColor: c.accent }]} />
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', alignItems: 'center', left: 0, right: 0 },
  floor: { position: 'absolute', height: 2, borderRadius: 1, opacity: 0.5 },
  // Centred by a half-width margin on each side's own terms, so an RTL swap of left/right changes nothing.
  stage: { position: 'absolute', left: '50%', transformOrigin: 'center bottom' },
  ghost: { position: 'absolute', top: 0, borderWidth: 2, alignItems: 'center' },
  speaker: { position: 'absolute', borderRadius: 2, opacity: 0.6 },
});
