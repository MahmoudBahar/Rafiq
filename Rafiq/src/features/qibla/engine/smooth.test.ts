import { describe, expect, it } from 'vitest';
import { blendHeadings, createStillness, normalizeDeg, shortestDelta, unwrap } from './smooth';

describe('blendHeadings', () => {
  it('is the first heading at weight 1 and the second at weight 0', () => {
    expect(blendHeadings(130, 200, 1)).toBeCloseTo(130, 6);
    expect(blendHeadings(130, 200, 0)).toBeCloseTo(200, 6);
  });
  it('goes the short way round between them', () => {
    expect(blendHeadings(350, 10, 0.5)).toBeCloseTo(0, 6);
    expect(blendHeadings(10, 350, 0.25)).toBeCloseTo(355, 6);
  });
});

describe('normalizeDeg', () => {
  it('maps any angle into [0, 360)', () => {
    expect(normalizeDeg(370)).toBe(10);
    expect(normalizeDeg(-10)).toBe(350);
    expect(normalizeDeg(360)).toBe(0);
    expect(normalizeDeg(0)).toBe(0);
  });
});

describe('shortestDelta', () => {
  it('is the signed turn from heading to bearing, the short way round', () => {
    expect(shortestDelta(136, 120)).toBe(16);
    expect(shortestDelta(136, 150)).toBe(-14);
    expect(shortestDelta(10, 350)).toBe(20);
    expect(shortestDelta(350, 10)).toBe(-20);
  });
  it('treats a half turn as +180', () => {
    expect(shortestDelta(180, 0)).toBe(180);
  });
});

describe('unwrap', () => {
  it('keeps the next heading within a half turn of the previous one', () => {
    expect(unwrap(350, 10)).toBe(370);
    expect(unwrap(10, 350)).toBe(-10);
    expect(unwrap(725, 10)).toBe(730);
  });
  it('leaves a small step untouched', () => {
    expect(unwrap(100, 104)).toBe(104);
  });
});

describe('createStillness', () => {
  const opts = { windowMs: 1000, stableRangeDeg: 4, jumpDeg: 15, jumpSamples: 2 };

  it('is not stable until the window has filled', () => {
    const s = createStillness(opts);
    expect(s.push(100, 0).stable).toBe(false);
    expect(s.push(100, 500).stable).toBe(false);
  });

  it('is stable once a full window stays within the range', () => {
    const s = createStillness(opts);
    let r = s.push(100, 0);
    for (let t = 100; t <= 1100; t += 100) r = s.push(100 + (t % 200 ? 1.5 : -1.5), t);
    expect(r.stable).toBe(true);
  });

  it('is not stable while the heading wanders more than the range', () => {
    const s = createStillness(opts);
    let r = s.push(100, 0);
    for (let t = 100; t <= 1100; t += 100) r = s.push(100 + (t / 100) * 0.8, t);
    expect(r.stable).toBe(false);
  });

  it('flags a jump once a still heading has leapt for `jumpSamples` samples', () => {
    const s = createStillness(opts);
    for (let t = 0; t <= 1100; t += 100) s.push(100, t);
    expect(s.push(125, 1200).jump).toBe(false);
    expect(s.push(126, 1233).jump).toBe(true);
  });

  it('ignores a single spike and stays still', () => {
    const s = createStillness(opts);
    for (let t = 0; t <= 1100; t += 100) s.push(100, t);
    const spike = s.push(140, 1200);
    expect(spike.jump).toBe(false);
    expect(spike.stable).toBe(true);
    const back = s.push(100.5, 1233);
    expect(back.jump).toBe(false);
    expect(back.stable).toBe(true);
    // Its stillness clock kept running: the spike did not reset it.
    expect(back.stableForMs).toBeGreaterThan(100);
  });

  it('does not flag a jump while turning', () => {
    const s = createStillness(opts);
    let r = s.push(0, 0);
    for (let t = 100; t <= 1500; t += 100) r = s.push((t / 100) * 20, t);
    expect(r.jump).toBe(false);
  });

  it('is stable across the 360° seam', () => {
    const s = createStillness(opts);
    let r = s.push(359, 0);
    for (let t = 100; t <= 1100; t += 100) r = s.push(t % 200 ? 1 : 358, t);
    expect(r.stable).toBe(true);
  });
});
