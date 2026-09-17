import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';
import { FadeIn, FadeInDown, FadeInUp, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { useSettings } from '@/shared/storage/settings';

// Live copy of the device's reduce-motion switch. Reanimated's own
// `useReducedMotion` is frozen at launch (on Android the flag is the global
// transition-animation scale being 0), while React Native watches it and
// emits `reduceMotionChanged`; this store bridges the two.
let systemReduced: boolean | null = null;
const listeners = new Set<() => void>();
let subscribed = false;

function setSystem(value: boolean) {
  if (systemReduced === value) return;
  systemReduced = value;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!subscribed) {
    subscribed = true;
    AccessibilityInfo.isReduceMotionEnabled().then(setSystem, () => {});
    AccessibilityInfo.addEventListener('reduceMotionChanged', setSystem);
  }
  return () => {
    listeners.delete(listener);
  };
}

/** The device's reduce-motion setting, updated while the app runs. */
export function useSystemReducedMotion(): boolean {
  const atLaunch = useReducedMotion();
  const live = useSyncExternalStore(
    subscribe,
    () => systemReduced,
    () => systemReduced,
  );
  return live ?? atLaunch;
}

/**
 * Entering/exiting presets that become no-ops when motion is reduced: by the
 * app's own setting, or by the device when the setting says to follow it. The
 * root layout mirrors the same answer into Reanimated's global config so
 * timing/spring animations and layout transitions agree.
 */
export function useMotion() {
  const { settings } = useSettings();
  const system = useSystemReducedMotion();
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
