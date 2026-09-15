import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { addDays } from '@/shared/lib/gregorian';
import { DaylightContext } from '@/shared/theme/daylight';
import { timeFor, type PrayerConfig } from './engine';
import { usePrayerConfig } from './usePrayerConfig';

interface Daylight {
  isDay: boolean;
  /** Next moment the answer flips. */
  next: Date;
}

function evaluate(cfg: PrayerConfig, now: Date): Daylight {
  const sunrise = timeFor('sunrise', cfg, now);
  const maghrib = timeFor('maghrib', cfg, now);
  if (now < sunrise) return { isDay: false, next: sunrise };
  if (now < maghrib) return { isDay: true, next: maghrib };
  return { isDay: false, next: timeFor('sunrise', cfg, addDays(now, 1)) };
}

/**
 * Tracks whether the sun is up for the current location. Re-evaluates exactly
 * at the next sunrise / Maghrib and whenever the app returns to the foreground.
 */
export function DaylightProvider({ children }: { children: ReactNode }) {
  const cfg = usePrayerConfig();
  const [tick, setTick] = useState(() => Date.now());
  const { isDay, next } = useMemo(() => evaluate(cfg, new Date(tick)), [cfg, tick]);

  useEffect(() => {
    const timer = setTimeout(() => setTick(Date.now()), Math.max(1000, next.getTime() - Date.now() + 500));
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setTick(Date.now());
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [next]);

  return <DaylightContext value={isDay}>{children}</DaylightContext>;
}
