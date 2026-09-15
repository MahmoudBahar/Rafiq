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

/** `١٢ سبتمبر – ١١ أكتوبر ٢٠٢٦`, collapsing the month when both ends share it. */
export function gregorianRange(first: Date, last: Date): string {
  const sameYear = first.getFullYear() === last.getFullYear();
  const sameMonth = sameYear && first.getMonth() === last.getMonth();
  if (sameMonth) {
    return `${toArabicIndic(first.getDate())} – ${toArabicIndic(last.getDate())} ${monthName(first.getMonth())} ${toArabicIndic(first.getFullYear())}`;
  }
  if (sameYear) return `${dayMonthString(first)} – ${dayMonthString(last)} ${toArabicIndic(first.getFullYear())}`;
  return `${gregorianString(first)} – ${gregorianString(last)}`;
}

export const daysInMonth = (year: number, month0: number): number => new Date(year, month0 + 1, 0).getDate();

/** Calendar-day arithmetic that survives DST changes. */
export const addDays = (date: Date, days: number): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

export const isSameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
