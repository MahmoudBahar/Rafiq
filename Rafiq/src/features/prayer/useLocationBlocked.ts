import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { locationAllowed } from './location';

/**
 * True while `watch` is on and the OS no longer lets the app read the
 * location (revoked in the system settings, or iOS "Allow Once" run out).
 * Checked on mount, on every return to the foreground and whenever `rev` changes.
 */
export function useLocationBlocked(watch: boolean, rev: unknown): boolean {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!watch) return;
    let stopped = false;
    const check = () => {
      locationAllowed().then((allowed) => {
        if (!stopped) setBlocked(allowed === false);
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

  return watch && blocked;
}
