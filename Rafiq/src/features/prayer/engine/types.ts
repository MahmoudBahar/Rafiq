import type { Adjustments, PrayerKey } from '@/shared/lib/adjustments';
import type { Coords, Madhab, Method } from '@/shared/storage/settings';

export type { Adjustments, Coords, Madhab, Method, PrayerKey };

export interface PrayerDef {
  key: PrayerKey;
  name: string;
  /** Sunrise is a marker, not a prayer. */
  isPrayer: boolean;
}

export const PRAYERS: readonly PrayerDef[] = [
  { key: 'fajr', name: 'الفجر', isPrayer: true },
  { key: 'sunrise', name: 'الشروق', isPrayer: false },
  { key: 'dhuhr', name: 'الظهر', isPrayer: true },
  { key: 'asr', name: 'العصر', isPrayer: true },
  { key: 'maghrib', name: 'المغرب', isPrayer: true },
  { key: 'isha', name: 'العشاء', isPrayer: true },
];

/** Everything the engine needs to compute a day. Plain data, safe to memoize on. */
export interface PrayerConfig {
  coords: Coords;
  method: Method;
  madhab: Madhab;
  /** Manual per-prayer minute offsets on top of the method. */
  adjustments: Adjustments;
}

export interface PrayerTime extends PrayerDef {
  at: Date;
}

/** One calendar day of times plus the neighbours the UI needs (sun arc, post-Isha wrap). */
export interface DayTimes {
  /** In `PRAYERS` order. */
  times: PrayerTime[];
  byKey: Record<PrayerKey, Date>;
  /** Astronomical sunset (equals Maghrib for most methods). */
  sunset: Date;
  /** Tomorrow's Fajr. */
  nextFajr: Date;
  /** Tomorrow's sunrise. */
  nextSunrise: Date;
}

export interface NextPrayer {
  key: PrayerKey;
  name: string;
  at: Date;
  /** True after Isha, when the next prayer is tomorrow's Fajr. */
  isTomorrow: boolean;
}

/** One row of a monthly timetable. */
export interface DayRow {
  date: Date;
  /** Day of month, 1-based. */
  day: number;
  /** 0 = Sunday, as `Date#getDay`. */
  weekday: number;
  byKey: Record<PrayerKey, Date>;
}
