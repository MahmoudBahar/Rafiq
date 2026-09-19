/** Pure helpers for the per-prayer iqama delay. No React or native imports. */
import { FARD_KEYS, type FardKey } from './adjustments';

/** Minutes between the adhan and the iqama, per prayer; 0 disables the iqama for that prayer. */
export type IqamaOffsets = Record<FardKey, number>;

export const IQAMA_LIMIT = 60;

/** A common Egyptian mosque pattern; every value is editable. */
export const IQAMA_DEFAULTS: IqamaOffsets = { fajr: 20, dhuhr: 15, asr: 15, maghrib: 10, isha: 15 };

export const clampIqama = (n: number): number => Math.max(0, Math.min(IQAMA_LIMIT, Math.round(n)));

/** Defaults overlaid with any finite persisted values, clamped. */
export function sanitizeIqama(raw: unknown): IqamaOffsets {
  const out: IqamaOffsets = { ...IQAMA_DEFAULTS };
  if (!raw || typeof raw !== 'object') return out;
  const rec = raw as Record<string, unknown>;
  for (const k of FARD_KEYS) {
    const v = rec[k];
    const n = typeof v === 'number' ? v : Number(v);
    if (v !== undefined && Number.isFinite(n)) out[k] = clampIqama(n);
  }
  return out;
}

export const isDefaultIqama = (iq: IqamaOffsets): boolean => FARD_KEYS.every((k) => iq[k] === IQAMA_DEFAULTS[k]);

/** Friday: minutes from the first adhan to the adhan of the khutbah (the imam on the minbar); 0 = off. */
export const KHUTBAH_DEFAULT = 20;
export const sanitizeKhutbah = (raw: unknown): number => {
  const n = typeof raw === 'number' ? raw : Number(raw);
  return raw !== undefined && Number.isFinite(n) ? clampIqama(n) : KHUTBAH_DEFAULT;
};
