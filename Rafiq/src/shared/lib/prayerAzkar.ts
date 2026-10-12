/** Pure helpers for how long the after-prayer azkar stay featured. No React or native imports. */

export const PRAYER_AZKAR_MIN = 5;
export const PRAYER_AZKAR_MAX = 120;
/** Minutes after each adhan during which أذكار بعد الصلاة lead the azkar page. */
export const PRAYER_AZKAR_DEFAULT = 45;

export const clampPrayerAzkar = (n: number): number =>
  Math.max(PRAYER_AZKAR_MIN, Math.min(PRAYER_AZKAR_MAX, Math.round(n)));

/** The default unless a finite persisted value is there, clamped. */
export function sanitizePrayerAzkar(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  return raw !== undefined && raw !== null && Number.isFinite(n) ? clampPrayerAzkar(n) : PRAYER_AZKAR_DEFAULT;
}
