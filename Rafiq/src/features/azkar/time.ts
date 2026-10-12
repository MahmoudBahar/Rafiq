import { useMemo, useState } from 'react';
import { computeDay, type DayTimes } from '@/features/prayer/engine';
import { usePrayerConfig } from '@/features/prayer/usePrayerConfig';
import { addDays, isoDate } from '@/shared/lib/gregorian';
import { useWallClock } from '@/shared/lib/useWallClock';
import type { DialSide } from './data';
import { useSettings } from '@/shared/storage/settings';
import { afterPrayerWindow, latestPrayer, nextAdhanAfter, wakingDayKey, type PrayerMoment, type PrayerWindow } from './engine/window';

/**
 * Which set belongs to this moment: the morning azkar from Fajr until Asr,
 * the evening azkar from Asr through the night until the next Fajr.
 */
export function azkarSideAt(now: Date, day: DayTimes): DialSide {
  const t = now.getTime();
  return t >= day.byKey.fajr.getTime() && t < day.byKey.asr.getTime() ? 'morning' : 'evening';
}

/**
 * The day a session is filed under. It turns over at Fajr rather than at
 * midnight: evening azkar said at half past midnight still belong to the
 * evening that began at Asr, and the morning set is fresh exactly when its
 * window opens.
 */
export function azkarDayKey(now: Date, day: DayTimes): string {
  return isoDate(now.getTime() < day.byKey.fajr.getTime() ? addDays(now, -1) : now);
}

export interface AzkarClock {
  side: DialSide;
  /** The azkar day, turning at Fajr: morning, evening and sleep sessions file under it. */
  dayKey: string;
  /** The calendar day: a wake before Fajr belongs to the new day. */
  wakingKey: string;
  /** The last fard prayer whose adhan has passed. */
  latest: PrayerMoment;
  /** Whether that prayer's azkar lead the page right now, per the user's minutes setting. */
  window: PrayerWindow;
}

/**
 * The current side, session keys and latest prayer, refreshed each minute and
 * again right at the next turn (Fajr or Asr). The tab stays mounted for the
 * app's whole life, so without that wake it showed the finished session for up
 * to a minute past Fajr while a reader opened in the meantime was already on
 * the new day.
 */
export function useAzkarClock(): AzkarClock {
  const cfg = usePrayerConfig();
  const minutes = useSettings().settings.prayerAzkarMinutes;
  const [wakeAt, setWakeAt] = useState<number | undefined>(undefined);
  const now = useWallClock(60_000, wakeAt);
  const y = now.getFullYear();
  const mo = now.getMonth();
  const d = now.getDate();
  const day = useMemo(() => computeDay(cfg, new Date(y, mo, d)), [cfg, y, mo, d]);
  const yesterday = useMemo(() => computeDay(cfg, new Date(y, mo, d - 1)), [cfg, y, mo, d]);
  // After Asr the next turn is tomorrow's Fajr: wake at midnight, when `day` moves on and Fajr is ahead again.
  const t = now.getTime();
  const fajr = day.byKey.fajr.getTime();
  const asr = day.byKey.asr.getTime();
  const latest = latestPrayer(day, yesterday, t);
  const window = afterPrayerWindow(latest, t, minutes);
  // The after-prayer window opens at each adhan and closes `minutes` later: both are turns too.
  const nextAt = Math.min(t < fajr ? fajr : t < asr ? asr : new Date(y, mo, d + 1).getTime(), nextAdhanAfter(day, t), window.inWindow ? window.endsAt : Infinity);
  if (nextAt !== wakeAt) setWakeAt(nextAt); // derived state, adjusted during render
  return { side: azkarSideAt(now, day), dayKey: azkarDayKey(now, day), wakingKey: wakingDayKey(now), latest, window };
}
