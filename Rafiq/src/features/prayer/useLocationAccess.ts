import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { locationAccess, type LocationAccess } from './location';

/**
 * Where the OS permission stands while `watch` is on; null while off or not
 * yet known. Read on mount, on every return to the foreground and whenever
 * `rev` changes. An answer never outlives the question it was for, so a
 * permission just granted is not reported as missing for a frame.
 */
export function useLocationAccess(watch: boolean, rev: unknown): LocationAccess | null {
  const [access, setAccess] = useState<LocationAccess | null>(null);

  useEffect(() => {
    if (!watch) return;
    let stopped = false;
    const check = () => {
      locationAccess().then((now) => {
        if (!stopped) setAccess(now);
      });
    };
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      stopped = true;
      sub.remove();
      setAccess(null);
    };
  }, [watch, rev]);

  return watch ? access : null;
}
