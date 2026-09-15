import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * Wall-clock `Date` that refreshes every `intervalMs` while the app is active,
 * plus once right after `wakeAt` (epoch ms) when given, so a coarse clock still
 * reacts on time to a known boundary such as the next adhan.
 */
export function useWallClock(intervalMs: number, wakeAt?: number): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    let wake: ReturnType<typeof setTimeout> | null = null;
    const start = () => {
      if (interval) return;
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), intervalMs);
      if (wakeAt !== undefined) {
        const wait = wakeAt - Date.now() + 250;
        if (wait > 0) wake = setTimeout(() => setNow(new Date()), wait);
      }
    };
    const stop = () => {
      if (interval) clearInterval(interval);
      if (wake) clearTimeout(wake);
      interval = null;
      wake = null;
    };
    start();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') start();
      else stop();
    });
    return () => {
      stop();
      sub.remove();
    };
  }, [intervalMs, wakeAt]);

  return now;
}
