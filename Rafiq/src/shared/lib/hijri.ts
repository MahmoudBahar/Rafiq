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
 * TODO(hijri): roll the day over at Maghrib once real prayer times land.
 */
export function hijriString(date: Date = new Date()): string {
  try {
    const h = uq(date);
    const month = HIJRI_MONTHS[h.hm - 1] ?? '';
    return `${toArabicIndic(h.hd)} ${month} ${toArabicIndic(h.hy)}`;
  } catch {
    return '';
  }
}
