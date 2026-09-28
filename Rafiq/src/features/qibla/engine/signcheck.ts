/** The dip must read the wrong way this long before the gravity direction is declared flipped. */
export const SIGN_CHECK_MS = 1000;
/** Below this expected dip (near the magnetic equator) the sign says nothing. */
export const SIGN_MIN_DIP_DEG = 15;
/** How close to the mirrored value the measured dip must sit to count as "the wrong way". */
const MIRROR_TOLERANCE_DEG = 15;

export interface SignCheck {
  /** Feed the measured dip; true once, and from then on, the gravity direction must be negated. */
  push(measuredDipDeg: number, tMs: number): boolean;
}

/**
 * A platform convention that flips the gravity direction leaves north where
 * it is but mirrors east, so the compass looks alive and turns the wrong
 * way. The dip gives it away: it changes sign, and the magnetic model knows
 * the sign for these coordinates (down in the north, up in the south). Once
 * the dip has read mirrored for a second the flip is applied for good; the
 * corrected reading then looks right, which is the point.
 */
export function createSignCheck(expectedDipDeg: number): SignCheck {
  let flipped = false;
  let wrongSince: number | null = null;
  const decisive = Math.abs(expectedDipDeg) >= SIGN_MIN_DIP_DEG;
  return {
    push(measuredDipDeg, tMs) {
      if (flipped || !decisive) return flipped;
      const mirrored = Math.abs(measuredDipDeg + expectedDipDeg) <= MIRROR_TOLERANCE_DEG;
      if (!mirrored) {
        wrongSince = null;
        return false;
      }
      if (wrongSince === null) wrongSince = tMs;
      if (tMs - wrongSince >= SIGN_CHECK_MS) flipped = true;
      return flipped;
    },
  };
}
