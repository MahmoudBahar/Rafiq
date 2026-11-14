import type { FardKey } from '@/shared/lib/adjustments';

export type AzkarSetId = 'morning' | 'evening' | 'waking' | 'prayer' | 'sleep';
/** The dial turns between these two; the other sets live below it. */
export type DialSide = 'morning' | 'evening';

/** One phrase of a compound entry, said `count` times before the next. */
export interface ZekrStage {
  text: string;
  count: number;
}

export interface Zekr {
  /** Stable within a data version: `m01`…, `e01`…, `w01`…, `p01`…, `s01`…. */
  id: string;
  /** Vocalised text; `\n` separates the basmala or isti'adha from a surah. */
  text: string;
  /** How many times it is said; for a staged entry, the sum of its stages. */
  count: number;
  /** The reward narrated for it, when the source gives one. */
  virtue: string | null;
  /** Where the virtue's hadith is found; the words themselves are sourced by `reference`. */
  virtueReference?: string;
  reference: string | null;
  /** `quran`: ayat with ۝ marks. `surahs`: the text is a label and `surahs` carries the reading. */
  kind?: 'quran' | 'surahs';
  stages?: readonly ZekrStage[];
  surahs?: readonly { name: string; text: string }[];
  /** After-prayer entries said only after these prayers; absent means every prayer. */
  prayers?: readonly FardKey[];
}

export interface AzkarSet {
  id: AzkarSetId;
  title: string;
  items: readonly Zekr[];
}
