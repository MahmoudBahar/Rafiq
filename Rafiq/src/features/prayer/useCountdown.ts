import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { computeDay, nextPrayerIn, type DayTimes, type NextPrayer, type PrayerConfig } from './engine';

export interface Countdown {
  now: Date;
  /** Today's computed times; recomputed only when config or the calendar day changes. */
  day: DayTimes;
  next: NextPrayer;
  h: number;
  m: number;
  s: number;
}

/** Ticks once a second while the app is active; always derives from the wall clock. */
export function useCountdown(cfg: PrayerConfig): Countdown {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      setNow(new Date());
      timer = setInterval(() => setNow(new Date()), 1000);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
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
  }, []);

  // Primitive deps: the engine only runs again on a config change or at midnight.
  const y = now.getFullYear();
  const mo = now.getMonth();
  const d = now.getDate();
  const day = useMemo(() => computeDay(cfg, new Date(y, mo, d)), [cfg, y, mo, d]);

  const next = nextPrayerIn(day, now);
  const diff = Math.max(0, Math.floor((next.at.getTime() - now.getTime()) / 1000));
  return {
    now,
    day,
    next,
    h: Math.floor(diff / 3600),
    m: Math.floor((diff % 3600) / 60),
    s: diff % 60,
  };
}
