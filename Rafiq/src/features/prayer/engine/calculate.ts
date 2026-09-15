import { Coordinates, HighLatitudeRule, Madhab as AdhanMadhab, PrayerTimes } from 'adhan';
import { clampAdjust } from '@/shared/lib/adjustments';
import { METHOD_BY_ID } from './methods';
import {
  PRAYERS,
  type DayRow,
  type DayTimes,
  type NextPrayer,
  type PrayerConfig,
  type PrayerKey,
  type PrayerTime,
} from './types';

/**
 * adhan reads the local calendar day from the Date it receives and returns
 * instants; the UI formats them in the device timezone.
 */
function build(cfg: PrayerConfig, date: Date): PrayerTimes {
  const coords = new Coordinates(cfg.coords.latitude, cfg.coords.longitude);
  // Tolerate a stale persisted id rather than crash.
  const def = METHOD_BY_ID[cfg.method] ?? METHOD_BY_ID.egypt;
  const params = def.params();
  params.madhab = cfg.madhab === 'hanafi' ? AdhanMadhab.Hanafi : AdhanMadhab.Shafi;
  params.highLatitudeRule = HighLatitudeRule.recommended(coords);
  // adhan's `adjustments` is a full six-key object; merge the user's partial on top.
  for (const p of PRAYERS) {
    const n = cfg.adjustments[p.key];
    if (typeof n === 'number' && Number.isFinite(n) && n !== 0) params.adjustments[p.key] = clampAdjust(n);
  }
  return new PrayerTimes(coords, date, params);
}

function shiftDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function getTimes(cfg: PrayerConfig, date: Date): PrayerTime[] {
  const pt = build(cfg, date);
  return PRAYERS.map((p) => ({ ...p, at: pt[p.key] }));
}

export function timeFor(key: PrayerKey, cfg: PrayerConfig, date: Date): Date {
  return build(cfg, date)[key];
}

/** Today's six times plus yesterday's Maghrib and tomorrow's Fajr. */
export function computeDay(cfg: PrayerConfig, date: Date): DayTimes {
  const times = getTimes(cfg, date);
  const byKey = Object.fromEntries(times.map((t) => [t.key, t.at])) as Record<PrayerKey, Date>;
  return {
    times,
    byKey,
    prevMaghrib: build(cfg, shiftDays(date, -1)).maghrib,
    nextFajr: build(cfg, shiftDays(date, 1)).fajr,
  };
}

/** First real prayer after `now`; wraps to tomorrow's Fajr after Isha. Pure array scan. */
export function nextPrayerIn(day: DayTimes, now: Date): NextPrayer {
  const t = now.getTime();
  const found = day.times.find((p) => p.isPrayer && p.at.getTime() > t);
  if (found) return { key: found.key, name: found.name, at: found.at, isTomorrow: false };
  const fajr = PRAYERS[0];
  return { key: fajr.key, name: fajr.name, at: day.nextFajr, isTomorrow: true };
}

export function nextPrayer(now: Date, cfg: PrayerConfig): NextPrayer {
  return nextPrayerIn(computeDay(cfg, now), now);
}

/** Every calendar day from `first` to `last` inclusive (local dates; time parts ignored). */
export function computeRange(cfg: PrayerConfig, first: Date, last: Date): DayRow[] {
  const rows: DayRow[] = [];
  const end = new Date(last.getFullYear(), last.getMonth(), last.getDate()).getTime();
  for (
    let date = new Date(first.getFullYear(), first.getMonth(), first.getDate());
    date.getTime() <= end;
    date = shiftDays(date, 1)
  ) {
    const pt = build(cfg, date);
    const byKey = Object.fromEntries(PRAYERS.map((p) => [p.key, pt[p.key]])) as Record<PrayerKey, Date>;
    rows.push({ date, day: date.getDate(), weekday: date.getDay(), byKey });
  }
  return rows;
}

/** Every day of a Gregorian month (`month0` is 0-based). */
export function computeMonth(cfg: PrayerConfig, year: number, month0: number): DayRow[] {
  return computeRange(cfg, new Date(year, month0, 1), new Date(year, month0 + 1, 0));
}
