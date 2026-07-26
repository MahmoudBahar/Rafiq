import { FadeInDown, FadeInUp, FadeOut, useReducedMotion } from 'react-native-reanimated';

/** Entering/exiting presets that become no-ops when the OS asks for reduced motion. */
export function useMotion() {
  const reduced = useReducedMotion();
  return {
    reduced,
    fadeInUp: (delay = 0, duration = 500) =>
      reduced ? undefined : FadeInUp.duration(duration).delay(delay),
    fadeInDown: (delay = 0, duration = 320) =>
      reduced ? undefined : FadeInDown.duration(duration).delay(delay),
    fadeOut: (duration = 180) => (reduced ? undefined : FadeOut.duration(duration)),
  };
}
