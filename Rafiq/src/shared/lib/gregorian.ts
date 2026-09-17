import { toArabicIndic } from './arabic';

/** Egyptian Arabic month names. */
export const MONTHS_AR = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
] as const;

/** Indexed by `Date#getDay` (0 = Sunday). */
export const WEEKDAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'] as const;

export const monthName = (month0: number): string => MONTHS_AR[month0] ?? '';
export const weekdayName = (date: Date): string => WEEKDAYS_AR[date.getDay()];

/** `١٥ سبتمبر` */
export const dayMonthString = (date: Date): string => `${toArabicIndic(date.getDate())} ${monthName(date.getMonth())}`;

/** `١٥ سبتمبر ٢٠٢٦` */
export const gregorianString = (date: Date): string => `${dayMonthString(date)} ${toArabicIndic(date.getFullYear())}`;

export const daysInMonth = (year: number, month0: number): number => new Date(year, month0 + 1, 0).getDate();

/** Calendar-day arithmetic that survives DST changes. */
export const addDays = (date: Date, days: number): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

export const isSameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** `YYYY-MM-DD` of the local calendar day, for route params. */
export const isoDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Inverse of `isoDate`; null when malformed. */
export function parseIsoDate(s: string | undefined): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return new Date(y, m - 1, d);
}
