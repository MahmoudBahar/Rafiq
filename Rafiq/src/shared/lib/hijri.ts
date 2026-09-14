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
