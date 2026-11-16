import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { locationAllowed } from './location';

/**
 * True while `watch` is on and the OS no longer lets the app read the
 * location (revoked in the system settings, or a one-time grant run out).
 * Read on mount, on every return to the foreground (which is also what a
 * closing permission prompt looks like) and whenever `rev` changes.
 */
export function useLocationLost(watch: boolean, rev: unknown): boolean {
  const [lost, setLost] = useState(false);

  useEffect(() => {
    if (!watch) return;
    let stopped = false;
    const check = () => {
      locationAllowed().then((allowed) => {
        if (!stopped) setLost(allowed === false);
      });
    };
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      stopped = true;
      sub.remove();
    };
  }, [watch, rev]);

  return watch && lost;
}
