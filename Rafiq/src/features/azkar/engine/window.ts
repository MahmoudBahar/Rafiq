/** When the after-prayer azkar are "now". Pure: no React, no native imports. */
import type { DayTimes } from '@/features/prayer/engine/types';
import type { FardKey } from '@/shared/lib/adjustments';
import { isoDate } from '@/shared/lib/gregorian';

export interface PrayerMoment {
  key: FardKey;
  /** The adhan, ms since epoch. */
  adhanAt: number;
}

export interface PrayerWindow {
  inWindow: boolean;
  /** Whole minutes since the adhan. */
  sinceMin: number;
  /** Whole minutes until the window closes; 0 once it has. */
  minutesLeft: number;
  endsAt: number;
}

const MIN = 60_000;

/** The last fard prayer whose adhan has passed; before today's Fajr that is yesterday's Isha. */
export function latestPrayer(today: DayTimes, yesterday: DayTimes, nowMs: number): PrayerMoment {
  let latest: PrayerMoment = { key: 'isha', adhanAt: yesterday.byKey.isha.getTime() };
  for (const p of today.times) {
    if (!p.isPrayer) continue;
    const at = p.at.getTime();
    if (at <= nowMs) latest = { key: p.key as FardKey, adhanAt: at };
  }
  return latest;
}

/** The window of `minutes` after the adhan during which that prayer's azkar lead the page. */
export function afterPrayerWindow(m: PrayerMoment, nowMs: number, minutes: number): PrayerWindow {
  const endsAt = m.adhanAt + minutes * MIN;
  const sinceMin = Math.floor((nowMs - m.adhanAt) / MIN);
  return {
    inWindow: nowMs >= m.adhanAt && nowMs < endsAt,
    sinceMin,
    minutesLeft: Math.max(0, Math.ceil((endsAt - nowMs) / MIN)),
    endsAt,
  };
}

/** The next fard adhan after `nowMs`, or tomorrow's Fajr once Isha has passed. */
export function nextAdhanAfter(today: DayTimes, nowMs: number): number {
  for (const p of today.times) {
    if (p.isPrayer && p.at.getTime() > nowMs) return p.at.getTime();
  }
  return today.nextFajr.getTime();
}

/**
 * The day a waking session belongs to is the calendar day: waking at 4:40 for
 * Fajr is the new day's, even though the azkar day (which turns at Fajr) is
 * still yesterday's at that hour.
 */
export const wakingDayKey = (now: Date): string => isoDate(now);

/** An after-prayer session is one prayer of one azkar day. */
export const prayerSessionKey = (dayKey: string, key: FardKey): string => `${dayKey}|${key}`;
