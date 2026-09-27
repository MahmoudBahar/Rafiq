/** Any angle into [0, 360). */
export function normalizeDeg(deg: number): number {
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

/** Signed turn from `heading` to `bearing`, the short way: (-180, 180]. Positive = turn right. */
export function shortestDelta(bearing: number, heading: number): number {
  const d = normalizeDeg(bearing - heading);
  return d > 180 ? d - 360 : d;
}

/**
 * `next` shifted by whole turns so it lies within a half turn of `prev`. A
 * value smoothed toward the unwrapped target never spins the long way round
 * across the 0/360 seam.
 */
export function unwrap(prev: number, next: number): number {
  return next + 360 * Math.round((prev - next) / 360);
}

export interface StillnessOptions {
  /** How long the heading must hold before it counts as still. */
  windowMs: number;
  /** Largest spread inside the window that still counts as still. */
  stableRangeDeg: number;
  /** A step this large from a still heading is a jump (something magnetic came close). */
  jumpDeg: number;
}

export interface StillnessReading {
  stable: boolean;
  /** True on the one sample that leapt from a still heading. */
  jump: boolean;
  /** How long the heading has been still, 0 when it is not. */
  stableForMs: number;
}

export interface Stillness {
  push(headingDeg: number, tMs: number): StillnessReading;
}

/** Tracks whether the heading is holding still, and catches sudden leaps while it is. */
export function createStillness({ windowMs, stableRangeDeg, jumpDeg }: StillnessOptions): Stillness {
  let samples: { t: number; h: number }[] = [];
  let stable = false;
  let stableSince = 0;

  return {
    push(headingDeg, tMs) {
      const last = samples[samples.length - 1];
      const h = last ? unwrap(last.h, headingDeg) : headingDeg;
      const jump = stable && last !== undefined && Math.abs(h - last.h) >= jumpDeg;
      if (jump) {
        samples = [];
        stable = false;
      }
      samples.push({ t: tMs, h });
      const cutoff = tMs - windowMs;
      while (samples.length > 1 && samples[0].t < cutoff) samples.shift();

      let min = Infinity;
      let max = -Infinity;
      for (const s of samples) {
        if (s.h < min) min = s.h;
        if (s.h > max) max = s.h;
      }
      const filled = tMs - samples[0].t >= windowMs;
      const wasStable = stable;
      stable = filled && max - min <= stableRangeDeg;
      if (stable && !wasStable) stableSince = tMs;
      return { stable, jump, stableForMs: stable ? tMs - stableSince : 0 };
    },
  };
}
