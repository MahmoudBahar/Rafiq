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
