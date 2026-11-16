import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useSettings } from '@/shared/storage/settings';
import { retryDelay } from './engine';
import { refreshLocation, sinceLastAnswer } from './location';

/** Between two answers. iOS also flips inactive → active around every system sheet; one fix covers them all. */
const MIN_GAP_MS = 5 * 60_000;

/**
 * Keeps auto mode honest: on launch, on every return to the foreground and
 * every few minutes while the app stays open, the device is asked where it
 * is, and a fix that has moved replaces the saved one. It is silent
 * throughout: no prompt, no error, and the saved place stays whenever a fix
 * cannot be had. A missed fix is asked for again on a backoff that a trip to
 * the background does not reset. Manual mode is never touched.
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
    let notBefore = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // One entry point: it asks when asking is due, and otherwise sets the timer for when it will be.
    const run = async () => {
      clearTimeout(timer);
      if (busy || stopped || AppState.currentState === 'background') return;
      // A tap on "locate me" counts as an answer too, so turning auto on does not fetch twice.
      const wait = Math.max(notBefore - performance.now(), MIN_GAP_MS - sinceLastAnswer());
      if (wait > 0) {
        timer = setTimeout(run, wait);
        return;
      }

      busy = true;
      const asked = latest.current;
      const found = await refreshLocation({ coords: asked.coords, city: asked.city, country: asked.country });
      busy = false;
      if (stopped) return;
      // Without the permission there is nothing to wait for; the next foreground looks again.
      if (found === 'denied') return;
      if (found === 'unavailable') {
        // Indoors, or just off a plane.
        notBefore = performance.now() + retryDelay(++misses);
      } else {
        misses = 0;
        // A tap may have saved a place of its own while this fix was on its way; that one is newer.
        if (found !== 'unmoved' && latest.current.coords === asked.coords) {
          update({
            city: found.city,
            country: found.country,
            coords: { latitude: found.latitude, longitude: found.longitude },
          });
        }
      }
      run();
    };

    run();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
      else if (state === 'background') clearTimeout(timer);
    });
    return () => {
      stopped = true;
      clearTimeout(timer);
      sub.remove();
    };
  }, [enabled, update]);
}
