import { describe, expect, it } from 'vitest';
import { LOCK_ENTER_DEG, LOCK_LEAVE_DEG, NEAR_DEG, bandFor } from './band';

describe('bandFor', () => {
  it('locks within the enter band', () => {
    expect(bandFor(2, 'far')).toBe('locked');
    expect(bandFor(-2.9, 'near')).toBe('locked');
  });
  it('stays locked until the wider leave band', () => {
    expect(bandFor(3.5, 'locked')).toBe('locked');
    expect(bandFor(3.5, 'near')).toBe('near');
    expect(bandFor(4.5, 'locked')).toBe('near');
  });
  it('is near up to the near band and far beyond it', () => {
    expect(bandFor(10, 'far')).toBe('near');
    expect(bandFor(-11, 'far')).toBe('far');
  });
  it('exposes the thresholds in the order enter < leave < near', () => {
    expect(LOCK_ENTER_DEG).toBeLessThan(LOCK_LEAVE_DEG);
    expect(LOCK_LEAVE_DEG).toBeLessThan(NEAR_DEG);
  });
});
