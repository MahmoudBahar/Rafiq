import { useMemo, useState } from 'react';
import { useWallClock } from '@/shared/lib/useWallClock';
import { computeDay, nextEventIn, type DayTimes, type NextEvent, type PrayerConfig } from './engine';

export interface Countdown {
  /** Coarse wall clock: refreshes every few seconds and right after the next event. */
  now: Date;
  /** Today's computed times; recomputed only when config or the calendar day changes. */
  day: DayTimes;
  /** Next adhan, iqama or sunrise. */
  next: NextEvent;
}

/** Everything on the home screen except the ticking digits can live with this cadence. */
const COARSE_MS = 10_000;

/**
 * Coarse clock for the home screen. The per-second digits are rendered by
 * `CountdownDigits`, which keeps its own one-second clock, so the rest of the
 * screen is not re-rendered every second.
 */
export function useCountdown(cfg: PrayerConfig): Countdown {
  // The clock also wakes right after the next event (known from the previous
  // render), so the banner and highlight flip on time despite the coarse tick.
  const [wakeAt, setWakeAt] = useState<number | undefined>(undefined);
  const now = useWallClock(COARSE_MS, wakeAt);

  // Primitive deps: the engine only runs again on a config change or at midnight.
  const y = now.getFullYear();
  const mo = now.getMonth();
  const d = now.getDate();
  const day = useMemo(() => computeDay(cfg, new Date(y, mo, d)), [cfg, y, mo, d]);

  const next = nextEventIn(day, now);
  const nextAt = next.at.getTime();
  if (nextAt !== wakeAt) setWakeAt(nextAt); // derived state, adjusted during render

  return { now, day, next };
}
