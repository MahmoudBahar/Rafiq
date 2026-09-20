import { useCallback, useEffect, useMemo, useState } from 'react';
import { I18nManager, useWindowDimensions } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import {
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withSpring,
  type DerivedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import { detent } from '@/shared/lib/haptics';
import type { AzkarSetId } from '../data';

/** Bodies rise on the right and set on the left under RTL, as on the home arc (see prayer/sky.ts). */
export const SKY_DIR = I18nManager.isRTL ? 1 : -1;

const SNAP = { damping: 18, stiffness: 140, mass: 1 };
/** A full-width drag turns the dial a little more than half a turn. */
const DRAG_GAIN = 1.15;
const RUBBER = 0.35;

export interface DialValues {
  /** 0 = sun up (morning), 180 = moon up (evening). */
  theta: SharedValue<number>;
  /** `theta` as 0..1, clamped: what the sky, stars and text fade on. */
  t: DerivedValue<number>;
}

const angleOf = (side: AzkarSetId) => (side === 'evening' ? 180 : 0);

/**
 * The dial's rotation: a horizontal drag anywhere on the sky turns it, a
 * release (or a tap on the disc) settles it on one of the two sides with a
 * spring, and a detent is felt as it crosses the half-way point. `side` is the React-side answer
 * and flips as the dial crosses the half-way point.
 */
export function useDial(clockSide: AzkarSetId) {
  const { width } = useWindowDimensions();
  const [side, setSide] = useState<AzkarSetId>(clockSide);

  const theta = useSharedValue(angleOf(clockSide));
  const start = useSharedValue(0);
  const goal = useSharedValue(angleOf(clockSide));
  // Once the user has turned the dial themselves, the clock stops steering it.
  const touched = useSharedValue(false);
  const t = useDerivedValue(() => Math.min(1, Math.max(0, theta.get() / 180)));

  const settle = useMemo(
    () => (target: number, velocity: number) => {
      'worklet';
      goal.set(target);
      theta.set(withSpring(target, { ...SNAP, velocity }));
    },
    [goal, theta],
  );

  useAnimatedReaction(
    () => theta.get() > 90,
    (evening, was) => {
      if (was === null || evening === was) return;
      // Felt as the dial tips over the half-way point, where the sky itself changes hands.
      scheduleOnRN(detent);
      scheduleOnRN(setSide, evening ? 'evening' : 'morning');
    },
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-10, 10])
        .failOffsetY([-16, 16])
        .onStart(() => {
          start.set(theta.get());
          touched.set(true);
        })
        .onUpdate((e) => {
          const raw = start.get() + ((-e.translationX * SKY_DIR) / width) * 180 * DRAG_GAIN;
          theta.set(raw < 0 ? raw * RUBBER : raw > 180 ? 180 + (raw - 180) * RUBBER : raw);
        })
        .onEnd((e) => {
          const v = ((-e.velocityX * SKY_DIR) / width) * 180 * DRAG_GAIN;
          settle(theta.get() + v * 0.12 > 90 ? 180 : 0, v);
        }),
    [settle, start, theta, touched, width],
  );

  const tap = useMemo(
    () =>
      Gesture.Tap()
        .maxDistance(10)
        .onEnd((_e, ok) => {
          if (!ok) return;
          touched.set(true);
          settle(goal.get() === 0 ? 180 : 0, 0);
        }),
    [goal, settle, touched],
  );

  // The hour moved on (Fajr or Asr passed): follow it, unless the user has turned the dial themselves.
  useEffect(() => {
    const angle = angleOf(clockSide);
    scheduleOnUI(() => {
      'worklet';
      if (!touched.get() && goal.get() !== angle) settle(angle, 0);
    });
  }, [clockSide, goal, settle, touched]);

  const toggle = useCallback(() => {
    scheduleOnUI(() => {
      'worklet';
      touched.set(true);
      settle(goal.get() === 0 ? 180 : 0, 0);
    });
  }, [goal, settle, touched]);

  const values: DialValues = useMemo(() => ({ theta, t }), [theta, t]);
  return { side, values, pan, tap, toggle };
}
