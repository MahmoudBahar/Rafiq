import { FadeIn, FadeInDown, FadeInUp, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { useSettings } from '@/shared/storage/settings';

/**
 * Entering/exiting presets that become no-ops when motion is reduced: by the
 * app's own setting, or by the OS when the setting says to follow it. The
 * root layout mirrors the same choice into Reanimated's global config so
 * timing/spring animations and layout transitions agree.
 */
export function useMotion() {
  const { settings } = useSettings();
  const system = useReducedMotion();
  const reduced = settings.motion === 'reduced' || (settings.motion === 'system' && system);
  return {
    reduced,
    fadeIn: (delay = 0, duration = 220) => (reduced ? undefined : FadeIn.duration(duration).delay(delay)),
    fadeInUp: (delay = 0, duration = 500) =>
      reduced ? undefined : FadeInUp.duration(duration).delay(delay),
    fadeInDown: (delay = 0, duration = 320) =>
      reduced ? undefined : FadeInDown.duration(duration).delay(delay),
    fadeOut: (duration = 180) => (reduced ? undefined : FadeOut.duration(duration)),
  };
}
