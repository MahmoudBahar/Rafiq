/** Compound entries: one page, several phrases, each said its own number of times. Pure. */
import type { Zekr, ZekrStage } from '../data/types';

export interface StagePos {
  index: number;
  /** Cumulative count at which this stage starts. */
  start: number;
  size: number;
  /** Repetitions said within this stage. */
  said: number;
}

export const stagesOf = (z: Zekr): readonly ZekrStage[] => z.stages ?? [{ text: z.text, count: z.count }];

/** The cumulative count at which each stage completes. */
export function stageEnds(z: Zekr): number[] {
  let acc = 0;
  return stagesOf(z).map((s) => (acc += s.count));
}

/**
 * The stage a cumulative `count` sits in: the first stage not yet complete, or
 * the last one (full) once the entry is done. A stage that has just completed
 * therefore reads as the next stage at zero; the reader holds the finished
 * strand itself for the pause before re-threading.
 */
export function stageAt(z: Zekr, count: number): StagePos {
  const stages = stagesOf(z);
  let start = 0;
  for (let index = 0; index < stages.length; index++) {
    const size = stages[index].count;
    if (count < start + size || index === stages.length - 1) {
      return { index, start, size, said: Math.max(0, Math.min(size, count - start)) };
    }
    start += size;
  }
  return { index: 0, start: 0, size: z.count, said: Math.min(z.count, count) };
}
