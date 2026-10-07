import { describe, expect, it } from 'vitest';
import type { Zekr } from '../data/types';
import { stageAt, stageEnds, stagesOf } from './stages';

const plain: Zekr = { id: 'x01', text: 'ذكر', count: 3, virtue: null, reference: null };
const tasbih: Zekr = {
  id: 's08',
  text: 'سبحان الله، والحمد لله، والله أكبر',
  count: 100,
  virtue: null,
  reference: null,
  stages: [
    { text: 'سبحان الله', count: 33 },
    { text: 'والحمد لله', count: 33 },
    { text: 'والله أكبر', count: 34 },
  ],
};

describe('stages', () => {
  it('treats a plain zekr as one stage', () => {
    expect(stagesOf(plain)).toEqual([{ text: 'ذكر', count: 3 }]);
    expect(stageEnds(plain)).toEqual([3]);
    expect(stageAt(plain, 0)).toEqual({ index: 0, start: 0, size: 3, said: 0 });
    expect(stageAt(plain, 3)).toEqual({ index: 0, start: 0, size: 3, said: 3 });
  });

  it('walks the stages by the cumulative count', () => {
    expect(stageEnds(tasbih)).toEqual([33, 66, 100]);
    expect(stageAt(tasbih, 0)).toEqual({ index: 0, start: 0, size: 33, said: 0 });
    expect(stageAt(tasbih, 32)).toEqual({ index: 0, start: 0, size: 33, said: 32 });
    // The stage is complete at its end; the next one only starts on the next tap.
    expect(stageAt(tasbih, 33)).toEqual({ index: 1, start: 33, size: 33, said: 0 });
    expect(stageAt(tasbih, 66)).toEqual({ index: 2, start: 66, size: 34, said: 0 });
    expect(stageAt(tasbih, 99)).toEqual({ index: 2, start: 66, size: 34, said: 33 });
  });

  it('stays on the last stage once the entry is complete', () => {
    expect(stageAt(tasbih, 100)).toEqual({ index: 2, start: 66, size: 34, said: 34 });
    expect(stageAt(tasbih, 140)).toEqual({ index: 2, start: 66, size: 34, said: 34 });
  });
});
