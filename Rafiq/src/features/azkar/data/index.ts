import { EVENING_AZKAR, MORNING_AZKAR } from './azkar.generated';
import type { AzkarSet, AzkarSetId } from './types';

export { AZKAR_DATA_VERSION } from './azkar.generated';
export type { AzkarSet, AzkarSetId, Zekr } from './types';

export const AZKAR_SETS: Record<AzkarSetId, AzkarSet> = {
  morning: { id: 'morning', title: 'أذكار الصباح', items: MORNING_AZKAR },
  evening: { id: 'evening', title: 'أذكار المساء', items: EVENING_AZKAR },
};

export const isAzkarSetId = (s: string | undefined): s is AzkarSetId => s === 'morning' || s === 'evening';
