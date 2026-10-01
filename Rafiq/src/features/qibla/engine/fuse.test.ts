import { describe, expect, it } from 'vitest';
import { createHeadingFuser, FUSE_GAIN, RESET_STEP_DEG } from './fuse';

// Each push carries the compass truth (magnetometer heading) and the fused
// sensor's own heading, whose changes carry the motion.
describe('createHeadingFuser', () => {
  it('starts on the compass, not on the fused sensor', () => {
    const f = createHeadingFuser();
    expect(f.push(130, 275)).toBeCloseTo(130, 6);
  });

  it('moves by the fused sensor’s motion between compass readings', () => {
    const f = createHeadingFuser();
    f.push(130, 275);
    // The compass is noisy and lags; the fused sensor turned 20° cleanly.
    const h = f.push(130, 295);
    expect(h).toBeGreaterThan(145);
    expect(h).toBeLessThanOrEqual(150);
  });

  it('is pulled back onto the compass when the fused sensor drifts', () => {
    const f = createHeadingFuser();
    f.push(130, 275);
    let h = 130;
    // Fused sensor wanders 40° while the compass insists on 130.
    for (let i = 0; i < 90; i++) h = f.push(130, 275 + (40 * Math.min(i, 30)) / 30);
    expect(Math.abs(h - 130)).toBeLessThan(2);
  });

  it('ignores an impossible fused step, which is a fusion reset, not a turn', () => {
    const f = createHeadingFuser();
    f.push(130, 275);
    const h = f.push(130, 275 + RESET_STEP_DEG + 30);
    expect(h).toBeCloseTo(130, 1);
  });

  it('takes a per-sample step limit, for what the gyroscope says the hand could have turned', () => {
    const f = createHeadingFuser();
    f.push(130, 275);
    // A 20° fused step while the gyroscope allows only 10°: a platform correction, not a turn.
    expect(f.push(130, 295, 10)).toBeCloseTo(130, 1);
    // The same step when the gyroscope allows 30°: a real turn.
    const h = f.push(130, 315, 30);
    expect(h).toBeGreaterThan(145);
  });

  it('pulls less toward the compass when the field looks unhealthy, so the motion carries the heading', () => {
    const healthy = createHeadingFuser();
    const bent = createHeadingFuser();
    healthy.push(130, 275);
    bent.push(130, 275);
    // The compass swings 50° (a bent floor) while the fused sensor holds still.
    let a = 130, b = 130;
    for (let i = 0; i < 30; i++) {
      a = healthy.push(180, 275, undefined, 1);
      b = bent.push(180, 275, undefined, 0.1);
    }
    expect(a).toBeGreaterThan(165);
    expect(b).toBeLessThan(140);
  });

  it('runs unwrapped across the seam so a turn through north stays continuous', () => {
    const f = createHeadingFuser();
    f.push(350, 10);
    const h = f.push(5, 25);
    // Unwrapped: 350 → ~365, never a jump down to 5.
    expect(h).toBeGreaterThan(355);
    expect(h).toBeLessThan(370);
  });

  it('exposes a gain that converges in about a second at 30 Hz', () => {
    const perSecond = 1 - Math.pow(1 - FUSE_GAIN, 30);
    expect(perSecond).toBeGreaterThan(0.7);
    expect(perSecond).toBeLessThan(0.98);
  });
});
