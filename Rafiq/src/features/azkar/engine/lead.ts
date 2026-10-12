/** What the drawer says about each set. Pure: no React, no native imports. */
import type { FardKey } from '@/shared/lib/adjustments';
import { toArabicIndic } from '@/shared/lib/arabic';
import type { AzkarSetId } from '../data/types';

export interface SetStanding {
  done: number;
  total: number;
  complete: boolean;
  started: boolean;
}

const FARD_NAMES: Record<FardKey, string> = { fajr: 'الفجر', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };

/** The set's name on the drawer: the after-prayer set names its prayer. */
export const drawerTitle = (set: AzkarSetId, title: string, prayer: FardKey): string =>
  set === 'prayer' ? `بعد ${FARD_NAMES[prayer]}` : title.replace('أذكار ', '');

/** A count of azkar with the noun in the form Arabic gives it: «ذكر واحد»، «ذكران»، «٤ أذكار»، «٣١ ذكرًا»، «١٠٠ ذكر». */
export function zekrCount(n: number): string {
  if (n === 1) return 'ذكر واحد';
  if (n === 2) return 'ذكران';
  const rest = n % 100;
  if (rest >= 3 && rest <= 10) return `${toArabicIndic(n)} أذكار`;
  if (rest >= 11) return `${toArabicIndic(n)} ذكرًا`;
  return `${toArabicIndic(n)} ذكر`;
}

/** «أتممتها، تقبّل اللّٰه» / «٢ من ٦» / «٤ أذكار», with the minutes left in front while the set leads. */
export function drawerStatus(s: SetStanding, minutesLeft: number | null): string {
  const base = s.complete ? 'أتممتها، تقبّل اللّٰه' : s.started ? `${toArabicIndic(s.done)} من ${toArabicIndic(s.total)}` : zekrCount(s.total);
  return minutesLeft !== null && !s.complete ? `بقي ${toArabicIndic(minutesLeft)} دقيقة · ${base}` : base;
}

export const drawerAction = (s: SetStanding): string => (s.complete ? 'أعد القراءة' : s.started ? 'تابع' : 'ابدأ');

/**
 * Which set leads the drawer: the after-prayer set while its window is open,
 * otherwise the first of the three still owed, otherwise the first. The two
 * windows the waking and sleep sets could have are deliberately not here yet.
 */
export function leadSet(inWindow: boolean, order: readonly AzkarSetId[], standing: (set: AzkarSetId) => SetStanding): AzkarSetId {
  if (inWindow) return 'prayer';
  return order.find((s) => !standing(s).complete) ?? order[0];
}
