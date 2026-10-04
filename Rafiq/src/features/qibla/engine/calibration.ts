/** The platform's accuracy must read low this long before it counts: a value that flickers on start-up is not a verdict. */
export const ACCURACY_LOW_S = 1;
/**
 * A phone that keeps reporting a low accuracy while its field matches the
 * World Magnetic Model this long is not believed: the field it measures is
 * Earth's, size and dip, so whatever the flag says, the compass works. This
 * is the guard against a phone whose flag is stuck low.
 */
export const HEALTHY_OVERRIDE_S = 10;

export interface CalibrationWatch {
  /** The platform's magnetometer accuracy, 0 (unreliable) … 3 (high), -1 unknown. */
  accuracy(value: number, t: number): void;
  /** Whether the field, at `t`, matches the model closely (see `fieldCheck`). */
  field(healthy: boolean, t: number): void;
  /** Whether the magnetometer needs calibrating. */
  needed(): boolean;
  /** The low accuracy is being ignored because the field matched the model for long enough (diagnostics). */
  readonly overridden: boolean;
  reset(): void;
}

/**
 * Whether to ask for the figure-eight: the platform's own verdict on its
 * magnetometer calibration. Android's TYPE_MAGNETIC_FIELD accuracy and
 * CoreMotion's calibration state both come from the platform's running
 * hard-iron fit, the one thing that knows whether its offset estimate has
 * converged, and both rise while the phone is waved about. So:
 *  - low (0–1) for a second → calibrate;
 *  - medium or high → clear, at once, never latched;
 *  - low but the measured field has matched the model for 10 s → not believed.
 *
 * Earlier this also guessed calibration from how |B| varied with the
 * phone's orientation. It could not tell an offset riding on the phone from
 * the phone being moved past furniture (the field changes with place too),
 * and it could only clear during slow, in-place turns, never during the
 * figure-eight it asked for. It is gone.
 */
export function createCalibrationWatch(): CalibrationWatch {
  let lowSince: number | null = null;
  let low = false;
  let healthySince: number | null = null;
  let healthyFor = 0;

  return {
    accuracy(value, t) {
      if (value >= 2 || value < 0) {
        // Calibrated, or no verdict at all: nothing to ask for.
        lowSince = null;
        low = false;
        return;
      }
      if (lowSince === null) lowSince = t;
      low = t - lowSince >= ACCURACY_LOW_S;
    },
    field(healthy, t) {
      if (!healthy) {
        healthySince = null;
        healthyFor = 0;
        return;
      }
      if (healthySince === null) healthySince = t;
      healthyFor = t - healthySince;
    },
    needed() {
      return low && healthyFor < HEALTHY_OVERRIDE_S;
    },
    get overridden() {
      return low && healthyFor >= HEALTHY_OVERRIDE_S;
    },
    reset() {
      lowSince = null;
      low = false;
      healthySince = null;
      healthyFor = 0;
    },
  };
}
