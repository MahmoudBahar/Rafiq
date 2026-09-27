/** Inside this the heading counts as on the Qibla. */
export const LOCK_ENTER_DEG = 3;
/** Once locked it holds out to here, so the edge does not flicker. */
export const LOCK_LEAVE_DEG = 4;
/** Inside this the visuals begin to warm. */
export const NEAR_DEG = 10;

export type Band = 'far' | 'near' | 'locked';

/** Which band a signed delta (bearing − heading) falls in, given the band it was in. */
export function bandFor(deltaDeg: number, prev: Band): Band {
  const a = Math.abs(deltaDeg);
  if (a <= (prev === 'locked' ? LOCK_LEAVE_DEG : LOCK_ENTER_DEG)) return 'locked';
  return a <= NEAR_DEG ? 'near' : 'far';
}
