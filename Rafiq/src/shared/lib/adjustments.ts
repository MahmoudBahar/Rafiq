/** Pure helpers for manual per-prayer minute offsets. No React or native imports. */
export type PrayerKey = 'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';

/** Manual per-prayer offsets in minutes; missing keys mean 0. */
export type Adjustments = Partial<Record<PrayerKey, number>>;

export const ADJUST_LIMIT = 30;

export const clampAdjust = (n: number): number =>
  Math.max(-ADJUST_LIMIT, Math.min(ADJUST_LIMIT, Math.round(n)));

/** Drops non-finite and zero entries and clamps the rest. */
export function sanitizeAdjustments(raw: unknown): Adjustments {
  if (!raw || typeof raw !== 'object') return {};
  const out: Adjustments = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n) && n !== 0) out[k as PrayerKey] = clampAdjust(n);
  }
  return out;
}
