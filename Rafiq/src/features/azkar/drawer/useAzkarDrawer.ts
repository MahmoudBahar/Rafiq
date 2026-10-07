import { useCallback, useEffect, useMemo, useState } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type DerivedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import { detent } from '@/shared/lib/haptics';
import { useMotion } from '@/shared/lib/motion';

/** Lands with a little overshoot, so the band is felt to arrive. */
const SNAP = { damping: 16, stiffness: 150, mass: 1 };
/** How far the band follows the finger past either stop. */
const RUBBER = 0.3;
/** The release projects the velocity this far ahead before choosing a stop. */
const PROJECT_S = 0.15;
const NUDGE_PX = 30;

export interface DrawerValues {
  /** 0 closed … −travel open, in px. */
  y: SharedValue<number>;
  /** `y` as 0..1 open-ness, for everything that fades or moves with the band. */
  k: DerivedValue<number>;
}

/**
 * The ground band as a drawer: a vertical drag anywhere on it slides it up over
 * the dial, a release settles it open or closed by position and velocity, and
 * a tap toggles. `travel` is how far up it goes. The dial's own pan is
 * horizontal; the two share the screen by their activation offsets.
 */
export function useAzkarDrawer(travel: number) {
  const { reduced } = useMotion();
  const [open, setOpen] = useState(false);

  const y = useSharedValue(0);
  const startY = useSharedValue(0);
  const touching = useSharedValue(false);
  const travelSv = useSharedValue(travel);
  useEffect(() => {
    travelSv.set(travel);
  }, [travel, travelSv]);
  const k = useDerivedValue(() => {
    const t = travelSv.get();
    return t > 0 ? Math.min(1, Math.max(0, -y.get() / t)) : 0;
  });

  const settle = useMemo(
    () => (target: number, velocity: number) => {
      'worklet';
      y.set(reduced ? target : withSpring(target, { ...SNAP, velocity }));
      scheduleOnRN(setOpen, target !== 0);
    },
    [reduced, y],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-8, 8])
        .failOffsetX([-12, 12])
        .onStart(() => {
          startY.set(y.get());
          touching.set(true);
        })
        .onUpdate((e) => {
          const t = travelSv.get();
          const raw = startY.get() + e.translationY;
          y.set(raw < -t ? -t + (raw + t) * RUBBER : raw > 0 ? raw * RUBBER : raw);
        })
        .onEnd((e) => {
          touching.set(false);
          const t = travelSv.get();
          const projected = y.get() + e.velocityY * PROJECT_S;
          const wasOpen = -startY.get() > t / 2;
          const toOpen = projected < -t / 2;
          if (toOpen !== wasOpen) scheduleOnRN(detent);
          settle(toOpen ? -t : 0, e.velocityY);
        }),
    [settle, startY, touching, travelSv, y],
  );

  const toggle = useCallback(() => {
    scheduleOnUI(() => {
      'worklet';
      const t = travelSv.get();
      settle(-y.get() > t / 2 ? 0 : -t, 0);
    });
    detent();
  }, [settle, travelSv, y]);

  const close = useCallback(() => {
    scheduleOnUI(() => {
      'worklet';
      if (y.get() !== 0) settle(0, 0);
    });
  }, [settle, y]);

  /** A small rise and fall, so the band is seen to move: the once-a-day cue that it opens. */
  const nudge = useCallback(() => {
    if (reduced) return;
    scheduleOnUI(() => {
      'worklet';
      if (touching.get() || y.get() !== 0) return;
      y.set(
        withSequence(
          withTiming(-NUDGE_PX, { duration: 280, easing: Easing.out(Easing.quad) }),
          withSpring(0, { damping: 12, stiffness: 170, mass: 1 }),
        ),
      );
    });
  }, [reduced, touching, y]);

  const values: DrawerValues = useMemo(() => ({ y, k }), [y, k]);
  return { values, pan, open, toggle, close, nudge };
}
