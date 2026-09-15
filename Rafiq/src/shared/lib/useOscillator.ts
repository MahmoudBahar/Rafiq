import { useEffect } from 'react';
import {
  Easing,
  ReduceMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

/** Shared value that runs 0 → 1 → 0 forever with the given half-period; honours reduce-motion. */
export function useOscillator(ms: number): SharedValue<number> {
  const v = useSharedValue(0);
  useEffect(() => {
    if (ms <= 0) return;
    v.set(
      withRepeat(
        withTiming(1, { duration: ms, easing: Easing.inOut(Easing.ease), reduceMotion: ReduceMotion.System }),
        -1,
        true,
      ),
    );
  }, [ms, v]);
  return v;
}
