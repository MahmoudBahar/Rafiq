import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useSettings } from '@/shared/storage/settings';
import { refreshLocation } from './location';

/** iOS flips inactive → active around every system sheet; one fix covers them all. */
const MIN_GAP_MS = 5 * 60_000;

/**
 * Keeps auto mode honest: on launch and on every return to the foreground the
 * device is asked where it is, and a fix that has moved replaces the saved
 * one. It is silent throughout: no prompt, no error, and the saved place
 * stays whenever a fix cannot be had. Manual mode is never touched.
 */
export function useAutoLocation(): void {
  const { settings, update } = useSettings();
  const latest = useRef(settings);
  useEffect(() => {
    latest.current = settings;
  });
  const enabled = settings.onboarded && settings.locationMode === 'auto';

  useEffect(() => {
    if (!enabled) return;
    let busy = false;
    let stopped = false;
    let lastAnswer = 0;

    const run = async () => {
      if (busy || Date.now() - lastAnswer < MIN_GAP_MS) return;
      busy = true;
      const found = await refreshLocation(latest.current.coords);
      busy = false;
      // A miss is not an answer: the next return to the foreground tries again.
      if (found === 'unavailable') return;
      lastAnswer = Date.now();
      // The user may have picked a city by hand while the fix was on its way.
      if (found === 'unmoved' || stopped || latest.current.locationMode !== 'auto') return;
      const { city, country, latitude, longitude } = found;
      update({ city, country, coords: { latitude, longitude } });
    };

    run();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    return () => {
      stopped = true;
      sub.remove();
    };
  }, [enabled, update]);
}
