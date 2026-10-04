/**
 * Small 3-vector and quaternion kit.
 *
 * Frames used throughout the engine:
 *  - device: X to the right edge, Y to the top edge, Z out of the screen
 *    (the convention both Android and iOS use for their sensors);
 *  - world: x east, y north, z up. "North" is whatever the gyro-carried
 *    frame calls north; the north filter finds where magnetic north lies in it.
 *
 * A quaternion `[x, y, z, w]` here is always device → world:
 * v_world = q · v_device · q*.
 */

export type Vec3 = readonly [number, number, number];
export type Quat = readonly [number, number, number, number];

export const IDENTITY: Quat = [0, 0, 0, 1];
const EPS = 1e-12;

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

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/** The unit vector along `v`, or null for a zero or non-finite vector. */
export function unit(v: Vec3): Vec3 | null {
  const n = norm(v);
  if (!(n > EPS) || !Number.isFinite(n)) return null;
  return [v[0] / n, v[1] / n, v[2] / n];
}

export function isFiniteVec(v: readonly number[]): boolean {
  for (const x of v) if (!Number.isFinite(x)) return false;
  return true;
}

export function qMul(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function qConj(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]];
}

/** `q` scaled back to unit length; identity for a degenerate quaternion. */
export function qNormalize(q: Quat): Quat {
  const n = Math.hypot(q[0], q[1], q[2], q[3]);
  if (!(n > EPS) || !Number.isFinite(n)) return IDENTITY;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

/** q · v · q*: a device vector in world coordinates. */
export function qRotate(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  // t = 2 (q.xyz × v); v' = v + w t + q.xyz × t
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}

/** q* · v · q: a world vector in device coordinates. */
export function qRotateInverse(q: Quat, v: Vec3): Vec3 {
  return qRotate(qConj(q), v);
}

/** The rotation by `angle` radians about the unit `axis`. */
export function qAxisAngle(axis: Vec3, angle: number): Quat {
  const h = angle / 2;
  const s = Math.sin(h);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(h)];
}

/**
 * The rotation a body turning at `w` (rad/s, any frame) makes in `dt`
 * seconds: exp(w dt / 2), exact for a constant rate.
 */
export function qFromRate(w: Vec3, dt: number): Quat {
  const rate = norm(w);
  const angle = rate * dt;
  if (angle < 1e-9) return qNormalize([(w[0] * dt) / 2, (w[1] * dt) / 2, (w[2] * dt) / 2, 1]);
  return qAxisAngle([w[0] / rate, w[1] / rate, w[2] / rate], angle);
}

/** The rotation about the world vertical by `angle` radians, counter-clockwise seen from above. */
export function qYaw(angle: number): Quat {
  return [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)];
}

/**
 * The shortest rotation taking unit `from` onto unit `to`. Its axis is
 * from × to, so when `to` is the world vertical the axis is horizontal and
 * the rotation has no twist about the vertical: a pure tilt.
 */
export function qBetween(from: Vec3, to: Vec3): Quat {
  const d = dot(from, to);
  if (d < -1 + 1e-9) {
    // Opposite: any axis perpendicular to `from` will do.
    const axis = unit(Math.abs(from[0]) < 0.9 ? cross(from, [1, 0, 0]) : cross(from, [0, 1, 0])) ?? [1, 0, 0];
    return [axis[0], axis[1], axis[2], 0];
  }
  const c = cross(from, to);
  return qNormalize([c[0], c[1], c[2], 1 + d]);
}

/**
 * The twist of `q` about the world vertical, radians, counter-clockwise:
 * 2·atan2(z, w) of its swing–twist decomposition. For a world-frame step
 * `q_k · q_{k-1}*` this is the turn about the vertical the step made.
 */
export function twistZ(q: Quat): number {
  const t = 2 * Math.atan2(q[2], q[3]);
  // Into (-π, π].
  return t > Math.PI ? t - 2 * Math.PI : t <= -Math.PI ? t + 2 * Math.PI : t;
}

/** The angle of the rotation `q`, radians, in [0, π]. */
export function qAngle(q: Quat): number {
  return 2 * Math.acos(Math.min(1, Math.abs(q[3])));
}

/**
 * The device→world quaternion whose world axes, written in device
 * coordinates, are `east`, `north` and `up` (orthonormal, right-handed): the
 * rotation matrix's rows. Shepperd's method, stable for every attitude.
 */
export function qFromWorldAxes(east: Vec3, north: Vec3, up: Vec3): Quat {
  const m00 = east[0], m01 = east[1], m02 = east[2];
  const m10 = north[0], m11 = north[1], m12 = north[2];
  const m20 = up[0], m21 = up[1], m22 = up[2];
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = 2 * Math.sqrt(trace + 1);
    return qNormalize([(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4]);
  }
  if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    return qNormalize([s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]);
  }
  if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    return qNormalize([(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s]);
  }
  const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
  return qNormalize([(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s]);
}
