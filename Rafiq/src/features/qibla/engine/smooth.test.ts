import { describe, expect, it } from 'vitest';
import { blendHeadings, flatBlendWeight, normalizeDeg, shortestDelta, unwrap } from './smooth';

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

describe('flatBlendWeight', () => {
  it('keeps the top edge while it has reach, hands over below it, blends between', () => {
    expect(flatBlendWeight(1)).toBe(1);
    expect(flatBlendWeight(0.25)).toBe(1);
    expect(flatBlendWeight(0.2)).toBeCloseTo(0.5, 6);
    expect(flatBlendWeight(0.15)).toBe(0);
    expect(flatBlendWeight(0)).toBe(0);
  });
});
