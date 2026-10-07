import type { FardKey } from '@/shared/lib/adjustments';
import { EVENING_AZKAR, MORNING_AZKAR, PRAYER_AZKAR, SLEEP_AZKAR, WAKING_AZKAR } from './azkar.generated';
import type { AzkarSet, AzkarSetId, DialSide, Zekr } from './types';

export { AZKAR_DATA_VERSION } from './azkar.generated';
export type { AzkarSet, AzkarSetId, DialSide, Zekr, ZekrStage } from './types';

export const AZKAR_SETS: Record<AzkarSetId, AzkarSet> = {
  morning: { id: 'morning', title: 'أذكار الصباح', items: MORNING_AZKAR },
  evening: { id: 'evening', title: 'أذكار المساء', items: EVENING_AZKAR },
  waking: { id: 'waking', title: 'أذكار الاستيقاظ', items: WAKING_AZKAR },
  prayer: { id: 'prayer', title: 'أذكار بعد الصلاة', items: PRAYER_AZKAR },
  sleep: { id: 'sleep', title: 'أذكار النوم', items: SLEEP_AZKAR },
};

/** The sets below the dial, in the day's order. */
export const NEW_SET_ORDER: readonly AzkarSetId[] = ['waking', 'prayer', 'sleep'];

export const isDialSide = (s: string | undefined): s is DialSide => s === 'morning' || s === 'evening';
// The reader still opens the dial's two sets only; the others follow once it can show them.
export const isAzkarSetId = (s: string | undefined): s is AzkarSetId => isDialSide(s);

/**
 * The entries said after `prayer`, each with its index in the set's full list:
 * progress is saved against the full list, so the index is what the counts
 * are keyed by.
 */
export function itemsForPrayer(prayer: FardKey): readonly { zekr: Zekr; index: number }[] {
  return PRAYER_AZKAR.map((zekr, index) => ({ zekr, index })).filter(({ zekr }) => !zekr.prayers || zekr.prayers.includes(prayer));
}
