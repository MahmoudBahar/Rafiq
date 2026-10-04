import { isFiniteVec, type Vec3 } from './vec';

/**
 * What the native module sends, about once a frame: every sample since the
 * last batch, as flat arrays of `[t, x, y, z]` quadruples. Times are seconds
 * on the sensor clock (Android `elapsedRealtimeNanos`, iOS time since boot),
 * shared by all three streams of a platform.
 */
export interface MotionBatch {
  /** Earth-up in device coordinates (unit-ish), from the platform's fused gravity. */
  up: number[];
  /** Angular rate, rad/s, device frame, right-handed. */
  gyro: number[];
  /** Calibrated magnetic field, µT, device frame. */
  mag: number[];
  /** The platform's magnetometer calibration, 0 (unreliable) … 3 (high); -1 unknown. */
  magAccuracy: number;
  /** Bumps whenever the platform re-estimates the magnetometer's hard-iron bias. */
  biasEpoch: number;
  /** Samples the native queue had to drop (it keeps at most a second). */
  dropped: number;
}

export type StreamKind = 'gyro' | 'up' | 'mag';

export interface Sample {
  kind: StreamKind;
  t: number;
  v: Vec3;
}

/** Samples are released this far behind the slowest stream, so a late one still lands in order. */
export const WATERMARK_MARGIN_S = 0.02;
/** A stream silent this long behind the others no longer holds them back. */
export const STALL_S = 0.25;
/**
 * A sample stamped this far ahead of every other stream and of its own stream's last sample is a
 * glitched timestamp, not a measurement: taken, it would hold its stream's clock in the future and
 * every later sample of that stream would be rejected as a reversal.
 */
export const MAX_LEAD_S = 1;

// At one timestamp (iOS delivers all three together): turn first, then
// correct the tilt, then measure north with the corrected attitude.
const ORDER: Record<StreamKind, number> = { gyro: 0, up: 1, mag: 2 };

export interface StreamMerger {
  /** Takes a batch's raw arrays; returns the samples now safe to process, in time order. */
  push(batch: Pick<MotionBatch, 'up' | 'gyro' | 'mag'>): Sample[];
  /** Samples of one stream received but not yet released, oldest first (read-only). */
  pending(kind: StreamKind): readonly Sample[];
  /** Samples dropped as non-finite, duplicate or out of order (diagnostics). */
  readonly rejected: number;
  /** The newest accepted sample time of any stream (-Infinity before any). */
  readonly newest: number;
  reset(): void;
}

/**
 * Android delivers the three sensors as separate event streams that can
 * straddle batch boundaries, each with its own small delay. Processing them
 * as they come would pair a magnetometer reading with the wrong attitude.
 * This merges them by timestamp and releases a sample only once every live
 * stream has reported past it (a watermark), so the engine always sees one
 * time-ordered sequence.
 */
export function createStreamMerger(kinds: readonly StreamKind[]): StreamMerger {
  const queues = new Map<StreamKind, Sample[]>();
  const lastT = new Map<StreamKind, number>();
  let released = -Infinity;
  let rejected = 0;
  /** The first sample time ever seen, for the start-up hold. */
  let first = Infinity;
  for (const k of kinds) queues.set(k, []);

  /** The newest time any other stream has reached, or undefined while none has spoken. */
  function newestOther(kind: StreamKind): number | undefined {
    let n: number | undefined;
    for (const [k, t] of lastT) if (k !== kind && (n === undefined || t > n)) n = t;
    return n;
  }

  function take(kind: StreamKind, flat: number[] | undefined) {
    const q = queues.get(kind);
    if (!q || !flat) return;
    for (let i = 0; i + 3 < flat.length; i += 4) {
      const t = flat[i];
      const v: Vec3 = [flat[i + 1], flat[i + 2], flat[i + 3]];
      const prev = lastT.get(kind) ?? -Infinity;
      if (!Number.isFinite(t) || !isFiniteVec(v) || t <= prev || t <= released) {
        rejected++;
        continue;
      }
      // Far ahead of everything, its own stream included: a glitch. (A stream resuming after a
      // silence is ahead of its own last sample but in line with the others; a lone stream running
      // on while the others are silent is in line with its own last sample.)
      const others = newestOther(kind);
      if (others !== undefined && t - others > MAX_LEAD_S && t - prev > MAX_LEAD_S) {
        rejected++;
        continue;
      }
      lastT.set(kind, t);
      if (t < first) first = t;
      q.push({ kind, t, v });
    }
  }

  return {
    push(batch) {
      take('gyro', batch.gyro);
      take('up', batch.up);
      take('mag', batch.mag);

      let newest = -Infinity;
      for (const t of lastT.values()) if (t > newest) newest = t;
      if (newest === -Infinity) return [];
      // The watermark is the slowest live stream; a stalled or silent one is left out.
      let watermark = Infinity;
      for (const k of kinds) {
        const t = lastT.get(k);
        if (t === undefined || newest - t > STALL_S) continue;
        if (t < watermark) watermark = t;
      }
      // A stream that has not spoken yet holds the others back for a moment, so the first samples line up.
      for (const k of kinds) if (lastT.get(k) === undefined && newest - first < STALL_S) return [];
      watermark -= WATERMARK_MARGIN_S;

      const out: Sample[] = [];
      for (const q of queues.values()) {
        let n = 0;
        while (n < q.length && q[n].t <= watermark) n++;
        if (n > 0) out.push(...q.splice(0, n));
      }
      out.sort((a, b) => a.t - b.t || ORDER[a.kind] - ORDER[b.kind]);
      if (out.length > 0) released = out[out.length - 1].t;
      return out;
    },
    pending(kind) {
      return queues.get(kind) ?? [];
    },
    get rejected() {
      return rejected;
    },
    get newest() {
      let n = -Infinity;
      for (const t of lastT.values()) if (t > n) n = t;
      return n;
    },
    reset() {
      for (const q of queues.values()) q.length = 0;
      lastT.clear();
      released = -Infinity;
      rejected = 0;
      first = Infinity;
    },
  };
}
