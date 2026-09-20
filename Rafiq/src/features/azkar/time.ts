import { useMemo } from 'react';
import { computeDay, type DayTimes } from '@/features/prayer/engine';
import { usePrayerConfig } from '@/features/prayer/usePrayerConfig';
import { addDays, isoDate } from '@/shared/lib/gregorian';
import { useWallClock } from '@/shared/lib/useWallClock';
import type { AzkarSetId } from './data';

/**
 * Which set belongs to this moment: the morning azkar from Fajr until Asr,
 * the evening azkar from Asr through the night until the next Fajr.
 */
export function azkarSideAt(now: Date, day: DayTimes): AzkarSetId {
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

/** The current side and day key, refreshed each minute. */
export function useAzkarClock(): { side: AzkarSetId; dayKey: string } {
  const cfg = usePrayerConfig();
  const now = useWallClock(60_000);
  const y = now.getFullYear();
  const mo = now.getMonth();
  const d = now.getDate();
  const day = useMemo(() => computeDay(cfg, new Date(y, mo, d)), [cfg, y, mo, d]);
  return { side: azkarSideAt(now, day), dayKey: azkarDayKey(now, day) };
}
