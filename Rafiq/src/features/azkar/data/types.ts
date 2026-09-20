export type AzkarSetId = 'morning' | 'evening';

export interface Zekr {
  /** Stable within a data version: `m01`…, `e01`…. */
  id: string;
  /** Vocalised text; `\n` separates the basmala or isti'adha from a surah. */
  text: string;
  /** How many times it is said. */
  count: number;
  /** The reward narrated for it, when the source gives one. */
  virtue: string | null;
  reference: string | null;
}

export interface AzkarSet {
  id: AzkarSetId;
  title: string;
  items: readonly Zekr[];
}
