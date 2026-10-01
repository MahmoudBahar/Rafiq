/** A vector in the device frame: X to the right of the screen, Y toward the top edge, Z out of the screen. */
export type Vec3 = readonly [number, number, number];

export const EPS = 1e-9;

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function norm(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

export function scale(v: Vec3, k: number): Vec3 {
  return [v[0] * k, v[1] * k, v[2] * k];
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/** `v` at unit length, or null when it has no length to speak of. */
export function unit(v: Vec3): Vec3 | null {
  const n = norm(v);
  return n < EPS ? null : [v[0] / n, v[1] / n, v[2] / n];
}

/**
 * `v` rotated by `thetaRad` about the unit axis `k`, right-handed (Rodrigues).
 * Exact for any angle, so a fast turn over one sample loses nothing.
 */
export function rotate(v: Vec3, k: Vec3, thetaRad: number): Vec3 {
  const c = Math.cos(thetaRad);
  const s = Math.sin(thetaRad);
  const kv = cross(k, v);
  const kd = dot(k, v) * (1 - c);
  return [v[0] * c + kv[0] * s + k[0] * kd, v[1] * c + kv[1] * s + k[1] * kd, v[2] * c + kv[2] * s + k[2] * kd];
}
