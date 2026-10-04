// Angle helpers, in degrees. The ones marked as worklets also run on the UI
// thread, so the frame loop uses the same tested maths as the engine.

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

/** Any angle into [0, 360). */
export function normalizeDeg(deg: number): number {
  'worklet';
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

/** The signed turn from `from` to `to`, the short way: (-180, 180]. Positive = clockwise (turn right). */
export function wrap180(to: number, from: number): number {
  'worklet';
  const d = normalizeDeg(to - from);
  return d > 180 ? d - 360 : d;
}

/**
 * `next` shifted by whole turns so it lies within a half turn of `prev`: a
 * heading carried this way runs past 360 instead of wrapping, so anything
 * eased toward it never spins the long way round across north.
 */
export function unwrap(prev: number, next: number): number {
  'worklet';
  return next + 360 * Math.round((prev - next) / 360);
}

/**
 * Running circular statistics of a set of angles: the mean direction and how
 * tightly they agree. Angles are summed as unit vectors, so 359° and 1°
 * average to 0°, not 180°.
 */
export interface CircularStats {
  add(deg: number, weight?: number): void;
  readonly count: number;
  /** Mean direction in [0, 360); NaN when empty or perfectly cancelling. */
  mean(): number;
  /** Mean resultant length, 0..1: 1 when every angle agrees. */
  resultant(): number;
  /** Circular standard deviation in degrees: sqrt(-2 ln R). */
  spread(): number;
  clear(): void;
}

export function circularStats(): CircularStats {
  let s = 0;
  let c = 0;
  let w = 0;
  let n = 0;
  return {
    add(deg, weight = 1) {
      s += weight * Math.sin(deg * DEG);
      c += weight * Math.cos(deg * DEG);
      w += weight;
      n++;
    },
    get count() {
      return n;
    },
    mean() {
      if (w <= 0 || (s === 0 && c === 0)) return NaN;
      return normalizeDeg(Math.atan2(s, c) * RAD);
    },
    resultant() {
      return w > 0 ? Math.hypot(s, c) / w : 0;
    },
    spread() {
      const r = this.resultant();
      return r <= 0 ? Infinity : r >= 1 ? 0 : Math.sqrt(-2 * Math.log(r)) * RAD;
    },
    clear() {
      s = c = w = 0;
      n = 0;
    },
  };
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
