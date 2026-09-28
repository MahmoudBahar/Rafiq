// The angle helpers are worklets too: the UI thread runs the same tested
// maths rather than a second copy of it.

/** Any angle into [0, 360). */
export function normalizeDeg(deg: number): number {
  'worklet';
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

/** Signed turn from `heading` to `bearing`, the short way: (-180, 180]. Positive = turn right. */
export function shortestDelta(bearing: number, heading: number): number {
  'worklet';
  const d = normalizeDeg(bearing - heading);
  return d > 180 ? d - 360 : d;
}

/** Between two headings the short way round: `a` at weight 1, `b` at weight 0. */
export function blendHeadings(a: number, b: number, weight: number): number {
  return normalizeDeg(b + weight * shortestDelta(a, b));
}

/** Below this much horizontal reach the top of the phone is handed over to the camera's heading… */
export const FLAT_BLEND_LOW = 0.15;
/** …and above this much it stands on its own; between them the two are blended, so raising the phone has no step. */
export const FLAT_BLEND_HIGH = 0.25;

/** How much of the top-edge heading to keep, 0..1, for a given horizontal reach of the top edge. */
export function flatBlendWeight(reach: number): number {
  const w = (reach - FLAT_BLEND_LOW) / (FLAT_BLEND_HIGH - FLAT_BLEND_LOW);
  return w < 0 ? 0 : w > 1 ? 1 : w;
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
  /** The leap must hold for this many samples in a row: one sample is a spike, not a jump. Default 1. */
  jumpSamples?: number;
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
export function createStillness({ windowMs, stableRangeDeg, jumpDeg, jumpSamples = 1 }: StillnessOptions): Stillness {
  let samples: { t: number; h: number }[] = [];
  let stable = false;
  let stableSince = 0;
  // Samples that have leapt away from a still heading, held back until they
  // either persist (a jump) or return (a spike, dropped).
  let leaping = 0;
  let lastReading: StillnessReading = { stable: false, jump: false, stableForMs: 0 };

  return {
    push(headingDeg, tMs) {
      const last = samples[samples.length - 1];
      const h = last ? unwrap(last.h, headingDeg) : headingDeg;
      const leapt = stable && last !== undefined && Math.abs(h - last.h) >= jumpDeg;
      if (leapt && ++leaping < jumpSamples) {
        // Not yet a jump; the window stands as it was.
        return { ...lastReading, stableForMs: stable ? tMs - stableSince : 0 };
      }
      const jump = leapt;
      leaping = 0;
      if (jump) {
        samples = [];
        stable = false;
      }
      samples.push({ t: tMs, h });
      // Keep one sample at or before the cutoff, so the window always spans the
      // full `windowMs` once it has filled, whatever the sample cadence.
      const cutoff = tMs - windowMs;
      while (samples.length > 2 && samples[1].t <= cutoff) samples.shift();

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
      lastReading = { stable, jump, stableForMs: stable ? tMs - stableSince : 0 };
      return lastReading;
    },
  };
}
