import type { Madhab } from '@/shared/storage/settings';

/**
 * Fixed Cairo-like timetable carried over from the design prototype.
 * TODO(prayer-engine): replace this file with an `adhan`-based calculation
 * driven by the stored location, method and madhab.
 */
export type PrayerKey = 'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';

export interface PrayerDef {
  key: PrayerKey;
  name: string;
  /** Sunrise is a marker, not a prayer. */
  isPrayer: boolean;
}

export const PRAYERS: PrayerDef[] = [
  { key: 'fajr', name: 'الفجر', isPrayer: true },
  { key: 'sunrise', name: 'الشروق', isPrayer: false },
  { key: 'dhuhr', name: 'الظهر', isPrayer: true },
  { key: 'asr', name: 'العصر', isPrayer: true },
  { key: 'maghrib', name: 'المغرب', isPrayer: true },
  { key: 'isha', name: 'العشاء', isPrayer: true },
];

export type HM = readonly [hours: number, minutes: number];

const FIXED: Record<Exclude<PrayerKey, 'asr'>, HM> = {
  fajr: [4, 32],
  sunrise: [6, 8],
  dhuhr: [12, 58],
  maghrib: [19, 47],
  isha: [21, 17],
};

const ASR: Record<Madhab, HM> = { shafii: [16, 34], hanafi: [17, 25] };

export function timeFor(key: PrayerKey, madhab: Madhab): HM {
  return key === 'asr' ? ASR[madhab] : FIXED[key];
}

/** Today's (relative to `base`) Date for a given clock time, optionally shifted by whole days. */
export function dateAt(base: Date, [h, m]: HM, dayOffset = 0): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d;
}

export interface PrayerTime extends PrayerDef {
  hm: HM;
  at: Date;
}

export function getTimes(madhab: Madhab, base: Date): PrayerTime[] {
  return PRAYERS.map((p) => {
    const hm = timeFor(p.key, madhab);
    return { ...p, hm, at: dateAt(base, hm) };
  });
}

export interface NextPrayer {
  key: PrayerKey;
  name: string;
  at: Date;
}

/** First real prayer after `now`; wraps to tomorrow's Fajr after Isha. */
export function nextPrayer(now: Date, madhab: Madhab): NextPrayer {
  const list = getTimes(madhab, now).filter((p) => p.isPrayer);
  const found = list.find((p) => p.at.getTime() > now.getTime());
  if (found) return { key: found.key, name: found.name, at: found.at };
  const fajr = list[0];
  return { key: fajr.key, name: fajr.name, at: dateAt(now, fajr.hm, 1) };
}
