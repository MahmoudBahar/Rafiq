import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useSettings } from '@/shared/storage/settings';
import { retryDelay } from './engine';
import { refreshLocation, sinceLastAnswer } from './location';

/** Between two answers. iOS also flips inactive → active around every system sheet; one fix covers them all. */
const MIN_GAP_MS = 5 * 60_000;

/**
 * Keeps auto mode honest: on launch and on every return to the foreground the
 * device is asked where it is, and a fix that has moved replaces the saved
 * one. It is silent throughout: no prompt, no error, and the saved place
 * stays whenever a fix cannot be had. A missed fix is asked for again up to
 * five times while the app is open, on a backoff that a trip to the
 * background does not restart. Manual mode is never touched.
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
    // The retries are spent: nothing more until a foreground that comes after `notBefore`.
    let resting = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // One entry point: it asks when asking is due, and sets the timer when a retry is owed.
    const run = async () => {
      clearTimeout(timer);
      if (busy || stopped || AppState.currentState === 'background') return;
      // Answered lately: the next foreground asks again, not a timer. A tap on
      // "locate me" counts as an answer too, so turning auto on does not fetch twice.
      if (sinceLastAnswer() < MIN_GAP_MS) return;
      // Wall-clock time, so hours asleep in a pocket count. A wait longer than
      // any this hook sets means the clock was moved; it is not honoured.
      const wait = notBefore - Date.now();
      if (wait > 0 && wait <= MIN_GAP_MS) {
        if (!resting) timer = setTimeout(run, wait);
        return;
      }
      resting = false;

      busy = true;
      const asked = latest.current;
      const found = await refreshLocation({ coords: asked.coords, city: asked.city, country: asked.country });
      busy = false;
      if (stopped) return;
      // Without the permission there is nothing to wait for; the next foreground looks again.
      if (found === 'denied') return;
      if (found === 'unavailable') {
        // Indoors, or just off a plane.
        const delay = retryDelay(++misses);
        resting = delay === null;
        if (resting) misses = 0;
        notBefore = Date.now() + (delay ?? MIN_GAP_MS);
      } else {
        misses = 0;
        // A tap may have saved a place of its own while this fix was on its way (that one is newer),
        // or picked a city by hand.
        const current = latest.current;
        if (found !== 'unmoved' && current.locationMode === 'auto' && current.coords === asked.coords) {
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
