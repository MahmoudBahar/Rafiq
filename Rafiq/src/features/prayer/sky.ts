import type { DayTimes } from './engine';
import type { MoonState } from './engine/moon';

/**
 * Sun and Moon placement on the header arc. ViewBox is 330×104; the arc's
 * baseline is y=80 with the corners inset so a full disc plus halo fits on
 * them. The app is RTL, so bodies rise on the start (right, x=312) and set on
 * the end (left, x=18).
 *
 * Sun: on the arc from sunrise to sunset (adhan). The disc's crossing of the
 * horizon follows the Sun's true altitude: it climbs out of the rise corner in
 * the ~2.5 minutes after sunrise and sinks into the set corner in the ~2.5
 * minutes before sunset, so it is gone at Maghrib. A glow accompanies only the
 * crossing itself; between Fajr/sunrise and sunset/Isha nothing of the Sun is
 * drawn and only the star field follows the Sun's depth below the horizon.
 * Moon: on the arc from moonrise to moonset (astronomia), nothing else.
 */
interface Pt {
  x: number;
  y: number;
}

export const ARC_WIDTH = 330;
export const ARC_HEIGHT = 104;

/** Arc baseline: the horizon line the bodies rise from and sink below. */
export const HORIZON_Y = 80;
export const P_START: Readonly<Pt> = { x: 312, y: HORIZON_Y };
export const P_END: Readonly<Pt> = { x: 18, y: HORIZON_Y };
const CTRL: Pt = { x: 165, y: -14 };
/** adhan's sunrise/sunset: the upper limb at the refracted horizon (degrees). */
const UPPER_LIMB = -0.833;
/** Apparent solar diameter (degrees): the disc takes this much altitude to cross the horizon. */
const SUN_DIAMETER = 0.53;
/** Depth below the horizon where twilight is fully out (degrees). */
const TWILIGHT_DEPTH = 18;
/** How far the disc sinks past the corner when fully set (svg units, its own diameter). */
const DISC_DROP = 14;

const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const quad = (t: number): Pt => lerp(lerp(P_START, CTRL, t), lerp(CTRL, P_END, t), t);
/** Unit tangent of the arc at `t`, pointing in the direction of travel (rise → set). */
function tangent(t: number): Pt {
  const x = (1 - t) * (CTRL.x - P_START.x) + t * (P_END.x - CTRL.x);
  const y = (1 - t) * (CTRL.y - P_START.y) + t * (P_END.y - CTRL.y);
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
}
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Arc length in svg units (chord sum), for converting a gap size into a `t` span. */
const ARC_LEN = (() => {
  let len = 0;
  let prev = quad(0);
  for (let i = 1; i <= 100; i++) {
    const p = quad(i / 100);
    len += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return len;
})();
/** Half-width of the clear ring kept around the moon, along the arc. */
const GAP_T = 16 / ARC_LEN;
const MIN_SEG = 0.01;

/** Quadratic sub-curve between `t0` and `t1` (de Casteljau). */
function subArc(t0: number, t1: number): string {
  const a = quad(t0);
  const b = quad(t1);
  const c = lerp(lerp(P_START, CTRL, t0), lerp(CTRL, P_END, t0), t1);
  return `M${r1(a.x)} ${r1(a.y)} Q${r1(c.x)} ${r1(c.y)} ${r1(b.x)} ${r1(b.y)}`;
}

/** `[t0, t1]` of the arc as path segments, minus a ring around `gapAt` when given. */
function segments(t0: number, t1: number, gapAt: number | null): string[] {
  if (gapAt === null) return t1 - t0 > MIN_SEG ? [subArc(t0, t1)] : [];
  const out: string[] = [];
  const g0 = Math.max(t0, gapAt - GAP_T);
  const g1 = Math.min(t1, gapAt + GAP_T);
  if (g0 - t0 > MIN_SEG) out.push(subArc(t0, g0));
  if (t1 - g1 > MIN_SEG) out.push(subArc(g1, t1));
  return out;
}

const progress = (now: number, from: Date, to: Date) =>
  clamp01((now - from.getTime()) / (to.getTime() - from.getTime()));

export interface SkySun {
  visible: boolean;
  x: number;
  y: number;
  /** Where the twilight ember sits (the corner the disc sinks through). */
  glowX: number;
  glowY: number;
  opacity: number;
  /** Accent trail from the rise corner to the sun, split around the moon; empty during twilight. */
  trail: string[];
  /** Twilight glow strength 0..1. */
  glow: number;
}

export interface SkyMoon {
  visible: boolean;
  x: number;
  y: number;
  phase: number;
  /** Observer in the southern hemisphere (lit limb mirrored). */
  southern: boolean;
  fraction: number;
  /** Today's moonrise / moonset (null when the day has none). */
  rise: Date | null;
  set: Date | null;
}

export interface SkyState {
  /** Dashed full arc, split around the moon. */
  arc: string[];
  sun: SkySun;
  moon: SkyMoon;
  /** Star field visibility 0..1. */
  stars: number;
  /** Nothing on the arc. */
  empty: boolean;
  /** What rises next when the arc is empty. */
  next: { kind: 'sun' | 'moon'; at: Date } | null;
}

export interface SkyInputs {
  now: Date;
  day: DayTimes;
  moon: MoonState;
  /** Sun's geometric altitude in degrees. */
  sunAlt: number;
}

const hiddenSun: SkySun = {
  visible: false,
  x: P_START.x,
  y: P_START.y,
  glowX: P_START.x,
  glowY: P_START.y,
  opacity: 0,
  trail: [],
  glow: 0,
};

export function skyState({ now, day, moon, sunAlt }: SkyInputs): SkyState {
  const n = now.getTime();
  const { fajr, sunrise, isha } = day.byKey;
  const { sunset } = day;
  const inDay = n >= sunrise.getTime() && n < sunset.getTime();
  const inDawn = n >= fajr.getTime() && n < sunrise.getTime();
  const inDusk = n >= sunset.getTime() && n < isha.getTime();

  // 0 = disc fully up on the corner, 1 = fully below; outside the day it is always down.
  const sink = inDay ? clamp01((UPPER_LIMB + SUN_DIAMETER - sunAlt) / SUN_DIAMETER) : 1;
  // Sky brightness from the Sun's depth: 1 at the horizon, 0 at astronomical night.
  const twilight = clamp01((sunAlt + TWILIGHT_DEPTH) / (TWILIGHT_DEPTH + UPPER_LIMB));
  const gapAt = moon.up ? moon.t : null;

  let sun: SkySun = hiddenSun;
  let stars = 1;
  if (inDay) {
    const t = progress(n, sunrise, sunset);
    const p = quad(t);
    // The disc crosses the horizon along the arc's own line: back past the
    // rise corner before sunrise, on past the set corner at sunset.
    const dir = tangent(t);
    const drop = (t < 0.5 ? -1 : 1) * DISC_DROP * sink;
    sun = {
      visible: true,
      x: r1(p.x + dir.x * drop),
      y: r1(p.y + dir.y * drop),
      glowX: r1(p.x),
      glowY: r1(p.y),
      opacity: 1 - sink,
      trail: segments(0, t, gapAt),
      glow: twilight * Math.min(1, sink * 3), // ramps in as the disc starts to cross
    };
    stars = 0.15;
  } else if (inDawn || inDusk) {
    // No disc, no ember: only the sky itself changes with the Sun's depth.
    stars = 1 - 0.7 * twilight;
  }

  const mp = quad(moon.t);
  const moonOut: SkyMoon = {
    visible: moon.up,
    x: r1(mp.x),
    y: r1(mp.y),
    phase: moon.phase,
    southern: moon.southern,
    fraction: moon.fraction,
    rise: moon.dayRise,
    set: moon.daySet,
  };

  const empty = !sun.visible && !moon.up;
  let next: SkyState['next'] = null;
  if (empty) {
    const nextSunrise = n < sunrise.getTime() ? sunrise : day.nextSunrise;
    next = { kind: 'sun', at: nextSunrise };
    if (moon.nextRise && moon.nextRise.getTime() < nextSunrise.getTime()) next = { kind: 'moon', at: moon.nextRise };
  }

  return { arc: segments(0, 1, gapAt), sun, moon: moonOut, stars, empty, next };
}
