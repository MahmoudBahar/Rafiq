import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useSettings } from '@/shared/storage/settings';
import { retryDelay } from './engine';
import { refreshLocation, sinceLastAnswer } from './location';

/** iOS flips inactive → active around every system sheet; one fix covers them all. */
const MIN_GAP_MS = 5 * 60_000;

/**
 * Keeps auto mode honest: on launch and on every return to the foreground the
 * device is asked where it is, and a fix that has moved replaces the saved
 * one. It is silent throughout: no prompt, no error, and the saved place
 * stays whenever a fix cannot be had. A fix that could not be had is asked for
 * again a few times while the app stays open. Manual mode is never touched.
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
    let misses = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const run = async () => {
      // A tap on "locate me" counts as an answer too, so turning auto on does not fetch twice.
      if (busy || sinceLastAnswer() < MIN_GAP_MS) return;
      busy = true;
      clearTimeout(retry);
      const { coords, city, country } = latest.current;
      const found = await refreshLocation({ coords, city, country });
      busy = false;
      if (stopped) return;
      if (found === 'unavailable') {
        // Indoors, or just off a plane: try again shortly, while someone is still looking.
        const delay = retryDelay(misses++);
        if (delay !== null && AppState.currentState === 'active') retry = setTimeout(run, delay);
        return;
      }
      misses = 0;
      // The user may have picked a city by hand while the fix was on its way.
      if (found === 'unmoved' || found === 'denied' || latest.current.locationMode !== 'auto') return;
      update({
        city: found.city,
        country: found.country,
        coords: { latitude: found.latitude, longitude: found.longitude },
      });
    };

    run();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        misses = 0;
        run();
      } else {
        clearTimeout(retry);
      }
    });
    return () => {
      stopped = true;
      clearTimeout(retry);
      sub.remove();
    };
  }, [enabled, update]);
}
