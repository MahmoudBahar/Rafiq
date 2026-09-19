import { Coordinates, HighLatitudeRule, Madhab as AdhanMadhab, PrayerTimes } from 'adhan';
import { FARD_KEYS, clampAdjust } from '@/shared/lib/adjustments';
import { METHOD_BY_ID } from './methods';
import {
  PRAYERS,
  type DayRow,
  type DayTimes,
  type NextEvent,
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
  for (const key of FARD_KEYS) {
    const n = cfg.adjustments[key];
    if (typeof n === 'number' && Number.isFinite(n) && n !== 0) params.adjustments[key] = clampAdjust(n);
  }
  return new PrayerTimes(coords, date, params);
}

const MIN_MS = 60_000;

/** The six rows with each prayer's iqama attached. */
function timesOf(pt: PrayerTimes, cfg: PrayerConfig): PrayerTime[] {
  return PRAYERS.map((p) => {
    const at = pt[p.key];
    const delay = p.isPrayer ? cfg.iqama[p.key as keyof typeof cfg.iqama] : 0;
    const iqama = p.isPrayer && delay > 0 ? new Date(at.getTime() + delay * MIN_MS) : null;
    return { ...p, at, iqama };
  });
}

function shiftDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function getTimes(cfg: PrayerConfig, date: Date): PrayerTime[] {
  return timesOf(build(cfg, date), cfg);
}

export function timeFor(key: PrayerKey, cfg: PrayerConfig, date: Date): Date {
  return build(cfg, date)[key];
}

/** Today's six times plus sunset and tomorrow's Fajr / sunrise. */
export function computeDay(cfg: PrayerConfig, date: Date): DayTimes {
  const today = build(cfg, date);
  const tomorrow = build(cfg, shiftDays(date, 1));
  const times = timesOf(today, cfg);
  const byKey = Object.fromEntries(times.map((t) => [t.key, t.at])) as Record<PrayerKey, Date>;
  return { times, byKey, sunset: today.sunset, nextFajr: tomorrow.fajr, nextSunrise: tomorrow.sunrise };
}

type DayEvent = Omit<NextEvent, 'isTomorrow'>;

/**
 * The day's countdown targets in order: each adhan, then its iqama, with
 * sunrise as its own event. An iqama that would land after the following
 * adhan is dropped, so the list is always monotonic.
 */
export function dayEvents(day: DayTimes): DayEvent[] {
  const out: DayEvent[] = [];
  day.times.forEach((p, i) => {
    if (!p.isPrayer) {
      out.push({ kind: 'sunrise', key: p.key, name: p.name, at: p.at });
      return;
    }
    out.push({ kind: 'adhan', key: p.key, name: p.name, at: p.at });
    const following = day.times[i + 1]?.at ?? day.nextFajr;
    if (p.iqama && p.iqama.getTime() < following.getTime()) {
      out.push({ kind: 'iqama', key: p.key, name: p.name, at: p.iqama });
    }
  });
  return out;
}

/** First event after `now`; wraps to tomorrow's Fajr adhan after Isha's last event. */
export function nextEventIn(day: DayTimes, now: Date): NextEvent {
  const t = now.getTime();
  const found = dayEvents(day).find((e) => e.at.getTime() > t);
  if (found) return { ...found, isTomorrow: false };
  const fajr = PRAYERS[0];
  return { kind: 'adhan', key: fajr.key, name: fajr.name, at: day.nextFajr, isTomorrow: true };
}

export function nextEvent(now: Date, cfg: PrayerConfig): NextEvent {
  return nextEventIn(computeDay(cfg, now), now);
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
