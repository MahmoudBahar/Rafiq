import { describe, expect, it } from 'vitest';
import type { DayTimes, PrayerTime } from '@/features/prayer/engine/types';
import { PRAYERS } from '@/features/prayer/engine/types';
import { afterPrayerWindow, latestPrayer, nextAdhanAfter, prayerSessionKey, wakingDayKey } from './window';

/** A day of fixed times (local), as the engine would hand them over. */
function fakeDay(iso: string, hm: Record<string, string>): DayTimes {
  const at = (date: string, t: string) => {
    const [h, m] = t.split(':').map(Number);
    const [y, mo, d] = date.split('-').map(Number);
    return new Date(y, mo - 1, d, h, m);
  };
  const next = new Date(at(iso, '00:00').getTime() + 86_400_000);
  const nextIso = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
  const times: PrayerTime[] = PRAYERS.map((p) => ({ ...p, at: at(iso, hm[p.key]), iqama: null }));
  const byKey = Object.fromEntries(times.map((t) => [t.key, t.at])) as DayTimes['byKey'];
  return { times, byKey, sunset: byKey.maghrib, nextFajr: at(nextIso, hm.fajr), nextSunrise: at(nextIso, hm.sunrise) };
}
const HM = { fajr: '04:30', sunrise: '05:50', dhuhr: '11:50', asr: '15:10', maghrib: '17:40', isha: '19:00' };
const today = fakeDay('2026-10-07', HM);
const yesterday = fakeDay('2026-10-06', HM);
const t = (h: number, m: number) => new Date(2026, 9, 7, h, m).getTime();

describe('latestPrayer', () => {
  it('is the last adhan that has passed today', () => {
    expect(latestPrayer(today, yesterday, t(13, 5)).key).toBe('dhuhr');
    expect(latestPrayer(today, yesterday, t(15, 9)).key).toBe('dhuhr');
    expect(latestPrayer(today, yesterday, t(15, 10)).key).toBe('asr');
    expect(latestPrayer(today, yesterday, t(23, 59)).key).toBe('isha');
  });
  it("is yesterday's isha before today's fajr", () => {
    const m = latestPrayer(today, yesterday, t(0, 30));
    expect(m.key).toBe('isha');
    expect(m.adhanAt).toBe(yesterday.byKey.isha.getTime());
    expect(latestPrayer(today, yesterday, t(4, 29)).adhanAt).toBe(yesterday.byKey.isha.getTime());
    expect(latestPrayer(today, yesterday, t(4, 30)).key).toBe('fajr');
  });
});

describe('afterPrayerWindow', () => {
  const dhuhr = { key: 'dhuhr' as const, adhanAt: today.byKey.dhuhr.getTime() };
  it('counts minutes from the adhan and closes exactly at the limit', () => {
    expect(afterPrayerWindow(dhuhr, t(11, 50), 45)).toEqual({ inWindow: true, sinceMin: 0, minutesLeft: 45, endsAt: t(12, 35) });
    expect(afterPrayerWindow(dhuhr, t(12, 34), 45).inWindow).toBe(true);
    expect(afterPrayerWindow(dhuhr, t(12, 34), 45).minutesLeft).toBe(1);
    expect(afterPrayerWindow(dhuhr, t(12, 35), 45).inWindow).toBe(false);
    expect(afterPrayerWindow(dhuhr, t(12, 35), 45).minutesLeft).toBe(0);
  });
  it('follows the setting', () => {
    expect(afterPrayerWindow(dhuhr, t(11, 56), 5).inWindow).toBe(false);
    expect(afterPrayerWindow(dhuhr, t(13, 40), 120).inWindow).toBe(true);
    expect(afterPrayerWindow(dhuhr, t(13, 40), 120).endsAt).toBe(t(13, 50));
  });
  it('spans midnight for isha', () => {
    const isha = latestPrayer(today, yesterday, t(0, 10));
    expect(afterPrayerWindow(isha, t(0, 10), 45).sinceMin).toBe(310);
    expect(afterPrayerWindow(isha, t(0, 10), 45).inWindow).toBe(false);
  });
});

describe('nextAdhanAfter', () => {
  it('is the next fard adhan, or tomorrow\'s fajr after isha', () => {
    expect(nextAdhanAfter(today, t(4, 0))).toBe(today.byKey.fajr.getTime());
    expect(nextAdhanAfter(today, t(4, 30))).toBe(today.byKey.dhuhr.getTime());
    expect(nextAdhanAfter(today, t(12, 0))).toBe(today.byKey.asr.getTime());
    expect(nextAdhanAfter(today, t(19, 0))).toBe(today.nextFajr.getTime());
    expect(nextAdhanAfter(today, t(23, 0))).toBe(today.nextFajr.getTime());
  });
  it('skips sunrise', () => {
    expect(nextAdhanAfter(today, t(5, 0))).toBe(today.byKey.dhuhr.getTime());
  });
});

describe('session keys', () => {
  it('files a pre-fajr wake under the calendar day', () => {
    expect(wakingDayKey(new Date(2026, 9, 7, 4, 40))).toBe('2026-10-07');
    expect(wakingDayKey(new Date(2026, 9, 7, 23, 50))).toBe('2026-10-07');
  });
  it('keys an after-prayer session by day and prayer', () => {
    expect(prayerSessionKey('2026-10-07', 'asr')).toBe('2026-10-07|asr');
  });
});
