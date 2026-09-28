/** The dip must read the wrong way this long before it is reported. */
export const SIGN_CHECK_MS = 1000;
/** Below this expected dip (near the magnetic equator) the sign says nothing. */
export const SIGN_MIN_DIP_DEG = 15;
/** How close to the mirrored value the measured dip must sit to count as "the wrong way". */
const MIRROR_TOLERANCE_DEG = 15;

export interface SignCheck {
  /** Feed the measured dip; true while it has been reading mirrored for `SIGN_CHECK_MS`. */
  push(measuredDipDeg: number, tMs: number): boolean;
}

/**
 * A platform convention that flips the gravity direction leaves north where
 * it is but mirrors east, so the compass looks alive and turns the wrong
 * way. The dip gives it away: it changes sign, and the magnetic model knows
 * the sign for these coordinates (down in the north, up in the south).
 *
 * This is a diagnostic, not a correction. A magnet with the wrong polarity
 * held near the phone mirrors the field just the same, and did: a desk
 * corner made the dip read −45° for a second, and an automatic flip then
 * mirrored the compass for the rest of the session. The conventions are
 * pinned per platform by the tests and checked by the dev readout instead;
 * this only says, for as long as it lasts, that the dip is reading mirrored.
 */
export function createSignCheck(expectedDipDeg: number): SignCheck {
  let wrongSince: number | null = null;
  const decisive = Math.abs(expectedDipDeg) >= SIGN_MIN_DIP_DEG;
  return {
    push(measuredDipDeg, tMs) {
      if (!decisive) return false;
      const mirrored = Math.abs(measuredDipDeg + expectedDipDeg) <= MIRROR_TOLERANCE_DEG;
      if (!mirrored) {
        wrongSince = null;
        return false;
      }
      if (wrongSince === null) wrongSince = tMs;
      return tMs - wrongSince >= SIGN_CHECK_MS;
    },
  };
}
