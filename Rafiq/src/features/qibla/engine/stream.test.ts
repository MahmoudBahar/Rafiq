import { describe, expect, it } from 'vitest';
import { STALL_S, createStreamMerger } from './stream';

const flat = (...samples: [number, number][]) => samples.flatMap(([t, x]) => [t, x, 0, 0]);

describe('createStreamMerger', () => {
  it('releases samples in time order, only up to the slowest stream', () => {
    const m = createStreamMerger(['gyro', 'up', 'mag']);
    const out1 = m.push({ gyro: flat([1.0, 1], [1.01, 2], [1.02, 3]), up: flat([1.005, 4]), mag: flat([1.0, 5]) });
    // The slowest stream (mag) is at 1.0; 20 ms margin: nothing past 0.98 yet.
    expect(out1).toEqual([]);
    const out2 = m.push({ gyro: flat([1.03, 6], [1.04, 7]), up: flat([1.015, 8], [1.035, 9]), mag: flat([1.04, 10]) });
    expect(out2.map((s) => s.t)).toEqual([1.0, 1.0, 1.005, 1.01, 1.015]);
    // At one timestamp: gyro, then up, then mag.
    expect(out2.slice(0, 2).map((s) => s.kind)).toEqual(['gyro', 'mag']);
  });

  it('drops duplicates, reversals and non-finite samples', () => {
    const m = createStreamMerger(['gyro']);
    m.push({ gyro: [...flat([1, 1], [1, 2], [0.9, 3]), 1.1, NaN, 0, 0], up: [], mag: [] });
    expect(m.rejected).toBe(3);
  });

  it('a stalled stream stops holding the others back', () => {
    const m = createStreamMerger(['gyro', 'mag']);
    m.push({ gyro: flat([1, 0]), up: [], mag: flat([1, 0]) });
    const gyro: [number, number][] = [];
    for (let t = 1.01; t < 1 + STALL_S + 0.1; t += 0.01) gyro.push([t, 0]);
    const out = m.push({ gyro: flat(...gyro), up: [], mag: [] });
    expect(out.length).toBeGreaterThan(gyro.length - 5);
  });

  it('a stream that never speaks holds the start only briefly', () => {
    const m = createStreamMerger(['gyro', 'mag']);
    expect(m.push({ gyro: flat([1, 0], [1.1, 0]), up: [], mag: [] })).toEqual([]);
    expect(m.push({ gyro: flat([1.3, 0]), up: [], mag: [] }).length).toBeGreaterThan(0);
  });
});
