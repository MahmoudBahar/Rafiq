import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import type { Madhab } from '@/shared/storage/settings';
import { nextPrayer, type NextPrayer } from './prayerTimes';

export interface Countdown {
  now: Date;
  next: NextPrayer;
  h: number;
  m: number;
  s: number;
}

/** Ticks once a second while the app is active; always derives from the wall clock. */
export function useCountdown(madhab: Madhab): Countdown {
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

  const next = nextPrayer(now, madhab);
  const diff = Math.max(0, Math.floor((next.at.getTime() - now.getTime()) / 1000));
  return {
    now,
    next,
    h: Math.floor(diff / 3600),
    m: Math.floor((diff % 3600) / 60),
    s: diff % 60,
  };
}
