import uq from '@umalqura/core';
import { toArabicIndic } from './arabic';

const HIJRI_MONTHS = [
  'محرم',
  'صفر',
  'ربيع الأول',
  'ربيع الآخر',
  'جمادى الأولى',
  'جمادى الآخرة',
  'رجب',
  'شعبان',
  'رمضان',
  'شوال',
  'ذو القعدة',
  'ذو الحجة',
];

/**
 * Hijri date in Arabic, e.g. `١٢ ربيع الأول ١٤٤٨`.
 * The Hijri day begins at sunset, so once `maghrib` has passed the next day is shown.
 */
export function hijriString(date: Date = new Date(), maghrib?: Date): string {
  try {
    const effective = maghrib && date.getTime() >= maghrib.getTime() ? new Date(date.getTime() + 86_400_000) : date;
    const h = uq(effective);
    const month = HIJRI_MONTHS[h.hm - 1] ?? '';
    return `${toArabicIndic(h.hd)} ${month} ${toArabicIndic(h.hy)}`;
  } catch {
    return '';
  }
}

/**
 * Hijri span covered by a Gregorian month, e.g. `ربيع الآخر ١٤٤٨` or
 * `ربيع الأول – ربيع الآخر ١٤٤٨` (years are both shown only when they differ).
 */
export function hijriMonthRange(first: Date, last: Date): string {
  try {
    const a = uq(first);
    const b = uq(last);
    const am = HIJRI_MONTHS[a.hm - 1] ?? '';
    const bm = HIJRI_MONTHS[b.hm - 1] ?? '';
    if (a.hy === b.hy && a.hm === b.hm) return `${am} ${toArabicIndic(a.hy)}`;
    if (a.hy === b.hy) return `${am} – ${bm} ${toArabicIndic(a.hy)}`;
    return `${am} ${toArabicIndic(a.hy)} – ${bm} ${toArabicIndic(b.hy)}`;
  } catch {
    return '';
  }
}
