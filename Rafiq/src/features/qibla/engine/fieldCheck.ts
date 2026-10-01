import { DEG, clamp } from './angles';
import type { EarthField } from './geomag';

/**
 * How far the measured dip may sit from the model's before it means
 * anything: the tilt the dip is measured against and the phone's own
 * calibration each carry a degree or two.
 */
export const DIP_ALLOWANCE_DEG = 5;
/** Implied heading error above which the field counts as bent (degrees)… */
export const BENT_ENTER_DEG = 10;
/** …and below which it counts as straight again. */
export const BENT_LEAVE_DEG = 7;
/** A field outside this many times the model's strength is a magnet or steel right by the phone, whatever its direction. */
export const RATIO_ENTER_LOW = 0.4;
export const RATIO_ENTER_HIGH = 2.0;
export const RATIO_LEAVE_LOW = 0.45;
export const RATIO_LEAVE_HIGH = 1.8;
/**
 * Within this ratio of the model's strength the size is a phone's ordinary
 * error (soft-iron scale, a charging current) and costs nothing. Beyond it
 * the magnetometer is listened to less, but no warning is raised: a field
 * that is only stronger, pointing the same way, moves the heading by 0°
 * (a Samsung on a desk with a cable read ×1.5 with a correct heading).
 */
export const RATIO_FREE = 1.25;
/** Each unit of |ln ratio| beyond the free band counts as this many degrees of doubt. */
const RATIO_DOUBT_DEG_PER_LN = 30;
/** The field must look wrong this long before it is reported… */
export const SHAPE_ENTER_S = 1;
/** …and right this long before the report clears. */
export const SHAPE_LEAVE_S = 1.5;
/** An implied error is never taken as larger than this. */
const MAX_IMPLIED_DEG = 90;

export interface FieldReading {
  /** |B|, µT. */
  magnitudeUt: number;
  /** The field's angle below the horizontal, degrees. */
  dipDeg: number;
}

export interface FieldVerdict {
  /** The heading error the dip departure implies, degrees (see `impliedHeadingError`). */
  impliedDeg: number;
  /** |B| over the model's total intensity. */
  ratio: number;
  /** Degrees of doubt from the size alone, beyond the free band. */
  sizeDoubtDeg: number;
  /** A health score in degrees of implied error, lower is better: what the north filter compares fields by. */
  scoreDeg: number;
  /** Extra measurement variance the shape earns, degrees². */
  rDeg2: number;
}

/**
 * The heading error a dip departure implies. A disturbance that tilts the
 * field out of the model's dip by Δ, if its direction is otherwise random,
 * also turns it within the horizontal plane by about Δ / cos(dip): the
 * horizontal part is the cos(dip) share of the field, so the same push
 * turns it further. A disturbance that only scales the field turns nothing.
 *
 * Checked against the two measured cases in Cairo (model 44 µT, dip 45°):
 * a desk with a charging cable read 65 µT dipping 43° with a correct
 * heading (0° here: not flagged); a laptop corner read 78 µT dipping 61°
 * with the heading wrong (15.6° here: flagged).
 */
export function impliedHeadingError(dipDeg: number, model: Pick<EarthField, 'dipDeg'>): number {
  const excess = Math.max(0, Math.abs(dipDeg - model.dipDeg) - DIP_ALLOWANCE_DEG);
  const c = Math.cos(clamp(Math.abs(model.dipDeg), 0, 89) * DEG);
  return Math.min(MAX_IMPLIED_DEG, excess / c);
}

export function judgeField(reading: FieldReading, model: EarthField): FieldVerdict {
  const impliedDeg = impliedHeadingError(reading.dipDeg, model);
  const ratio = model.totalUt > 0 ? reading.magnitudeUt / model.totalUt : 1;
  const lnOff = Math.abs(Math.log(Math.max(ratio, 1e-6)));
  const sizeDoubtDeg = RATIO_DOUBT_DEG_PER_LN * Math.max(0, lnOff - Math.log(RATIO_FREE));
  return {
    impliedDeg,
    ratio,
    sizeDoubtDeg,
    scoreDeg: impliedDeg + sizeDoubtDeg,
    rDeg2: impliedDeg * impliedDeg + sizeDoubtDeg * sizeDoubtDeg,
  };
}

export interface ShapeWatch {
  /** Feed a verdict at time `t`; returns whether the field currently counts as disturbed. */
  push(v: FieldVerdict, t: number): boolean;
  reset(): void;
}

/**
 * Whether the field's shape (its dip and size against the model) says
 * something is bending it. Hysteresis on both the thresholds and the time:
 * it must look wrong for a second to be reported and right for a second and
 * a half to clear, so a reading at the edge never flickers the warning.
 */
export function createShapeWatch(zone: EarthField['zone']): ShapeWatch {
  let disturbed = false;
  let since: number | null = null;
  return {
    push(v, t) {
      if (zone === 'blackout') return true;
      const bad = v.impliedDeg > BENT_ENTER_DEG || v.ratio < RATIO_ENTER_LOW || v.ratio > RATIO_ENTER_HIGH;
      const good =
        v.impliedDeg < BENT_LEAVE_DEG && v.ratio > RATIO_LEAVE_LOW && v.ratio < RATIO_LEAVE_HIGH;
      const wantsChange = disturbed ? good : bad;
      if (!wantsChange) {
        since = null;
        return disturbed;
      }
      if (since === null) since = t;
      if (t - since >= (disturbed ? SHAPE_LEAVE_S : SHAPE_ENTER_S)) {
        disturbed = !disturbed;
        since = null;
      }
      return disturbed;
    },
    reset() {
      disturbed = false;
      since = null;
    },
  };
}
