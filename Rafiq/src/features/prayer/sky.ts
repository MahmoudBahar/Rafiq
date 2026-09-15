import type { DayTimes } from './engine';
import type { MoonState } from './engine/moon';

/**
 * Sun and Moon placement on the header arc. ViewBox is 330×104; the arc's
 * baseline is y=80 with the corners inset so a full disc plus halo fits on
 * them. The app is RTL, so bodies rise on the start (right, x=312) and set on
 * the end (left, x=18).
 *
 * Sun: on the arc from sunrise to sunset (adhan). Twilight is drawn as the sun
 * sitting below the rise corner from Fajr, climbing to it by sunrise, and
 * sinking below the set corner from sunset until Isha.
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
/** How far below a corner a twilight sun sits (svg units). */
const DEPTH = 16;

const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const quad = (t: number): Pt => lerp(lerp(P_START, CTRL, t), lerp(CTRL, P_END, t), t);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (t: number) => t * t * (3 - 2 * t);
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
}

const hiddenSun: SkySun = { visible: false, x: P_START.x, y: P_START.y, opacity: 0, trail: [], glow: 0 };

export function skyState({ now, day, moon }: SkyInputs): SkyState {
  const n = now.getTime();
  const { fajr, sunrise, isha } = day.byKey;
  const { sunset } = day;

  const gapAt = moon.up ? moon.t : null;
  let sun: SkySun = hiddenSun;
  let stars = 1;
  if (n >= sunrise.getTime() && n < sunset.getTime()) {
    const t = progress(n, sunrise, sunset);
    const p = quad(t);
    sun = { visible: true, x: r1(p.x), y: r1(p.y), opacity: 1, trail: segments(0, t, gapAt), glow: 0 };
    stars = 0.15;
  } else if (n >= fajr.getTime() && n < sunrise.getTime()) {
    const d = progress(n, fajr, sunrise);
    sun = {
      visible: true,
      x: P_START.x,
      y: r1(P_START.y + DEPTH * (1 - smooth(d))),
      opacity: 0.3 + 0.7 * d,
      trail: [],
      glow: d,
    };
    stars = 1 - 0.7 * d;
  } else if (n >= sunset.getTime() && n < isha.getTime()) {
    const e = progress(n, sunset, isha);
    sun = {
      visible: true,
      x: P_END.x,
      y: r1(P_END.y + DEPTH * smooth(e)),
      opacity: 1 - 0.7 * e,
      trail: [],
      glow: 1 - e,
    };
    stars = 0.3 + 0.7 * e;
  }

  const mp = quad(moon.t);
  const moonOut: SkyMoon = {
    visible: moon.up,
    x: r1(mp.x),
    y: r1(mp.y),
    phase: moon.phase,
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
