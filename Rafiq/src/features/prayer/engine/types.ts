import type { Adjustments, FardKey, PrayerKey } from '@/shared/lib/adjustments';
import type { IqamaOffsets } from '@/shared/lib/iqama';
import type { Coords, Madhab, Method } from '@/shared/storage/settings';

export type { Adjustments, Coords, FardKey, IqamaOffsets, Madhab, Method, PrayerKey };

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

export interface FardDef extends PrayerDef {
  key: FardKey;
}

const isFard = (p: PrayerDef): p is FardDef => p.isPrayer;

/** The five obligatory prayers, in order. */
export const FARD_PRAYERS: readonly FardDef[] = PRAYERS.filter(isFard);

/** Everything the engine needs to compute a day. Plain data, safe to memoize on. */
export interface PrayerConfig {
  coords: Coords;
  method: Method;
  madhab: Madhab;
  /** Manual per-prayer minute offsets on top of the method. */
  adjustments: Adjustments;
  /** Minutes from adhan to iqama per prayer; 0 = no iqama. */
  iqama: IqamaOffsets;
}

export interface PrayerTime extends PrayerDef {
  at: Date;
  /** Iqama moment; null for sunrise and for prayers whose delay is 0. */
  iqama: Date | null;
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

/** What the home countdown runs toward: an adhan, that prayer's iqama, or sunrise (end of Fajr). */
export type EventKind = 'adhan' | 'iqama' | 'sunrise';

export interface NextEvent {
  kind: EventKind;
  /** The prayer this event belongs to (`sunrise` for the sunrise event). */
  key: PrayerKey;
  name: string;
  at: Date;
  /** True after Isha's last event, when the next one is tomorrow's Fajr adhan. */
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
