import { useCallback, useEffect, useMemo } from 'react';
import { I18nManager, useWindowDimensions } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import {
  Easing,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import { detent } from '@/shared/lib/haptics';
import { useMotion } from '@/shared/lib/motion';

export const COL_PAD = 20;
const COMMIT_FRACTION = 0.22;
const COMMIT_VELOCITY = 650;
const NUDGE_PX = 34;
const SPRING = { damping: 20, stiffness: 220 };
const NUDGE_SPRING = { damping: 14, stiffness: 180 };

export interface CarouselValues {
  /** Day offset currently centred, as seen by the UI thread. */
  center: SharedValue<number>;
  /** Live drag / slide translation in px. */
  tx: SharedValue<number>;
  /** Whole-strip opacity, used for instant jumps. */
  op: SharedValue<number>;
  /** +1 under RTL (next day sits to the left), −1 under LTR. */
  dir: number;
  width: number;
}

/**
 * Full-width horizontal day pager.
 *
 * Three columns form a ring buffer; their on-screen position is computed on
 * the UI thread from `center` and `tx`. A commit advances `center` and resets
 * `tx` in the same UI update, so the hand-off to React (which re-slots the
 * off-screen column) is visually a no-op.
 *
 * Direction: days run in reading order, so under RTL tomorrow sits to the
 * LEFT of today. Finger moving right reveals it (next day); left → previous.
 */
export function useDayCarousel(offset: number, onCommit: (delta: number) => void) {
  const { width } = useWindowDimensions();
  const { reduced } = useMotion();
  const dir = I18nManager.isRTL ? 1 : -1;

  const center = useSharedValue(offset);
  const tx = useSharedValue(0);
  const op = useSharedValue(1);
  const busy = useSharedValue(false);

  // After React re-slots the columns: re-sync (deep links / multi-day jumps) and release.
  useEffect(() => {
    scheduleOnUI(() => {
      'worklet';
      center.set(offset);
      tx.set(0);
      op.set(reduced ? 1 : withTiming(1, { duration: 160 }));
      busy.set(false);
    });
  }, [offset, reduced, center, tx, op, busy]);

  const commitPage = useMemo(() => {
    return (delta: number) => {
      'worklet';
      if (busy.get() || delta === 0) return;
      busy.set(true);
      if (reduced || Math.abs(delta) !== 1) {
        const finish = () => {
          'worklet';
          center.set(center.get() + delta);
          tx.set(0);
          scheduleOnRN(detent);
          scheduleOnRN(onCommit, delta);
        };
        if (reduced) {
          finish();
        } else {
          op.set(
            withTiming(0, { duration: 120 }, (finished) => {
              'worklet';
              if (finished) finish();
              else busy.set(false);
            }),
          );
        }
        return;
      }
      tx.set(
        withTiming(delta * dir * width, { duration: 260, easing: Easing.out(Easing.cubic) }, (finished) => {
          'worklet';
          if (!finished) {
            busy.set(false);
            return;
          }
          center.set(center.get() + delta);
          tx.set(0);
          scheduleOnRN(detent);
          scheduleOnRN(onCommit, delta);
        }),
      );
    };
  }, [busy, center, dir, onCommit, op, reduced, tx, width]);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-14, 14])
        .failOffsetY([-12, 12])
        .onUpdate((e) => {
          // A plain assignment also cancels a running nudge.
          if (!busy.get()) tx.set(Math.max(-width, Math.min(width, e.translationX)));
        })
        .onEnd((e) => {
          if (busy.get()) return;
          const far = Math.abs(e.translationX) > width * COMMIT_FRACTION;
          const fast = Math.abs(e.velocityX) > COMMIT_VELOCITY;
          if (far || fast) {
            commitPage(Math.sign(e.translationX || e.velocityX) * dir);
          } else {
            tx.set(withSpring(0, SPRING));
          }
        }),
    [busy, commitPage, dir, tx, width],
  );

  const values: CarouselValues = useMemo(() => ({ center, tx, op, dir, width }), [center, tx, op, dir, width]);

  const go = (delta: number) => scheduleOnUI(commitPage, delta);

  /** Discoverability hint: slide a little toward tomorrow and spring back. */
  const nudge = useCallback(() => {
    if (reduced) return;
    scheduleOnUI(() => {
      'worklet';
      if (busy.get()) return;
      tx.set(
        withSequence(
          withTiming(dir * NUDGE_PX, { duration: 240, easing: Easing.out(Easing.cubic) }),
          withSpring(0, NUDGE_SPRING),
        ),
      );
    });
  }, [busy, dir, reduced, tx]);

  return { gesture, values, go, nudge };
}
