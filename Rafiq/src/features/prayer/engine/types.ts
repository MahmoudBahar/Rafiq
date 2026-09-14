import type { Coords, Madhab, Method } from '@/shared/storage/settings';

export type { Coords, Madhab, Method };

export type PrayerKey = 'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';

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
}

export interface PrayerTime extends PrayerDef {
  at: Date;
}

/** One calendar day of times plus the neighbours the UI needs (sun arc, post-Isha wrap). */
export interface DayTimes {
  /** In `PRAYERS` order. */
  times: PrayerTime[];
  byKey: Record<PrayerKey, Date>;
  /** Yesterday's Maghrib. */
  prevMaghrib: Date;
  /** Tomorrow's Fajr. */
  nextFajr: Date;
}

export interface NextPrayer {
  key: PrayerKey;
  name: string;
  at: Date;
}
