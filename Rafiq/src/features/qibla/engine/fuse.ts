import { shortestDelta } from './smooth';

/** Pull toward the compass per push (~30 Hz): about a second to close a gap. */
export const FUSE_GAIN = 0.05;
/** A fused step this large in one sample is no turn of the hand: the fusion reset itself. */
export const RESET_STEP_DEG = 45;

export interface HeadingFuser {
  /**
   * Feed the compass truth and the fused sensor's current heading; returns
   * the heading to show, unwrapped (it runs past 360 rather than wrapping).
   * `maxStepDeg` caps the fused step this sample may contribute: what the
   * gyroscope says the hand could have turned, else the reset cap. `trust`
   * (0..1, the field's health) scales the pull toward the compass: on a
   * bent field the motion carries the heading instead.
   */
  push(magHeading: number, fusedHeading: number, maxStepDeg?: number, trust?: number): number;
  reset(): void;
}

/**
 * The compass says where north is; the fused rotation sensor says how the
 * phone is turning. The output moves by the fused sensor's motion, sample to
 * sample, and is pulled back onto the compass a little every sample, so the
 * fused sensor's drift never accumulates and its absolute heading never
 * matters. A step larger than the hand could have made (a fusion reset, or
 * a platform's discrete yaw correction) is dropped. It starts on the compass.
 */
export function createHeadingFuser(): HeadingFuser {
  let heading: number | null = null;
  let lastFused = 0;
  return {
    push(magHeading, fusedHeading, maxStepDeg = RESET_STEP_DEG, trust = 1) {
      if (heading === null) {
        heading = magHeading;
        lastFused = fusedHeading;
        return heading;
      }
      let step = shortestDelta(fusedHeading, lastFused);
      lastFused = fusedHeading;
      if (Math.abs(step) > Math.min(maxStepDeg, RESET_STEP_DEG)) step = 0;
      heading += step;
      heading += FUSE_GAIN * trust * shortestDelta(magHeading, heading);
      return heading;
    },
    reset() {
      heading = null;
    },
  };
}
