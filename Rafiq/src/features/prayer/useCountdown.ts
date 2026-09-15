import { useEffect, useMemo, useRef, useState } from 'react';
import { adhan } from '@/shared/lib/haptics';
import { useWallClock } from '@/shared/lib/useWallClock';
import { computeDay, nextPrayerIn, type DayTimes, type NextPrayer, type PrayerConfig } from './engine';

export interface Countdown {
  /** Coarse wall clock: refreshes every few seconds and right after the next prayer. */
  now: Date;
  /** Today's computed times; recomputed only when config or the calendar day changes. */
  day: DayTimes;
  next: NextPrayer;
}

/** Everything on the home screen except the ticking digits can live with this cadence. */
const COARSE_MS = 10_000;

/**
 * Coarse clock for the home screen. The per-second digits are rendered by
 * `CountdownDigits`, which keeps its own one-second clock, so the rest of the
 * screen is not re-rendered every second.
 */
export function useCountdown(cfg: PrayerConfig): Countdown {
  // The clock also wakes right after the next prayer (known from the previous
  // render), so the banner and highlight flip on time despite the coarse tick.
  const [wakeAt, setWakeAt] = useState<number | undefined>(undefined);
  const now = useWallClock(COARSE_MS, wakeAt);

  // Primitive deps: the engine only runs again on a config change or at midnight.
  const y = now.getFullYear();
  const mo = now.getMonth();
  const d = now.getDate();
  const day = useMemo(() => computeDay(cfg, new Date(y, mo, d)), [cfg, y, mo, d]);

  const next = nextPrayerIn(day, now);
  const nextAt = next.at.getTime();
  if (nextAt !== wakeAt) setWakeAt(nextAt); // derived state, adjusted during render

  // When "next" rolls over because its time just passed (not because the
  // config changed or the app woke hours later), pulse: the adhan is now.
  const prevAt = useRef(nextAt);
  useEffect(() => {
    const before = prevAt.current;
    prevAt.current = nextAt;
    if (before === nextAt) return;
    const late = now.getTime() - before;
    if (late >= 0 && late < 2 * COARSE_MS) adhan();
  }, [nextAt, now]);

  return { now, day, next };
}
