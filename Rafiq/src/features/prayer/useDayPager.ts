import { useEffect, useMemo } from 'react';
import { I18nManager, useWindowDimensions } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import { useMotion } from '@/shared/lib/motion';

const COMMIT_FRACTION = 0.22;
const COMMIT_VELOCITY = 650;
const FOLLOW = 0.85;
const SPRING = { damping: 20, stiffness: 220 };

/**
 * Horizontal swipe between days with a slide + fade hand-off.
 *
 * Direction: days run in reading order, so under RTL tomorrow sits to the
 * LEFT of today. Dragging the finger toward the right reveals the left page
 * (next day); dragging left reveals the previous day. LTR is mirrored.
 * The content slides out toward `dirOut`, is parked on the opposite side
 * while React swaps the day, then slides back in.
 */
export function useDayPager(offset: number, onCommit: (delta: number) => void) {
  const { width } = useWindowDimensions();
  const { reduced } = useMotion();
  const rtl = I18nManager.isRTL;

  const tx = useSharedValue(0);
  const op = useSharedValue(1);
  const busy = useSharedValue(false);

  // Runs after each committed offset change: bring the parked content back in.
  useEffect(() => {
    if (reduced) {
      tx.set(0);
      op.set(1);
      busy.set(false);
      return;
    }
    tx.set(withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) }));
    op.set(
      withTiming(1, { duration: 200 }, () => {
        'worklet';
        busy.set(false);
      }),
    );
  }, [offset, reduced, tx, op, busy]);

  const slideOut = useMemo(() => {
    return (delta: number) => {
      'worklet';
      if (busy.get()) return;
      if (reduced) {
        scheduleOnRN(onCommit, delta);
        return;
      }
      busy.set(true);
      const dirOut = delta * (rtl ? 1 : -1);
      op.set(withTiming(0, { duration: 140 }));
      tx.set(
        withTiming(dirOut * width, { duration: 180, easing: Easing.out(Easing.cubic) }, (finished) => {
          'worklet';
          if (finished) {
            tx.set(-dirOut * width);
            scheduleOnRN(onCommit, delta);
          } else {
            busy.set(false);
          }
        }),
      );
    };
  }, [busy, reduced, rtl, width, onCommit, op, tx]);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-14, 14])
        .failOffsetY([-12, 12])
        .onUpdate((e) => {
          if (!busy.get()) tx.set(e.translationX * FOLLOW);
        })
        .onEnd((e) => {
          if (busy.get()) return;
          const far = Math.abs(e.translationX) > width * COMMIT_FRACTION;
          const fast = Math.abs(e.velocityX) > COMMIT_VELOCITY;
          if (far || fast) {
            const delta = Math.sign(e.translationX || e.velocityX) * (rtl ? 1 : -1);
            slideOut(delta);
          } else {
            tx.set(withSpring(0, SPRING));
          }
        }),
    [busy, rtl, slideOut, tx, width],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: op.get(),
    transform: [{ translateX: tx.get() }],
  }));

  const go = (delta: number) => scheduleOnUI(slideOut, delta);

  return { gesture, animatedStyle, go };
}
