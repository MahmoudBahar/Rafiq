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

export const P_START: Readonly<Pt> = { x: 312, y: 80 };
export const P_END: Readonly<Pt> = { x: 18, y: 80 };
const CTRL: Pt = { x: 165, y: -14 };
/** How far below a corner a twilight sun sits (svg units). */
const DEPTH = 16;

export const FULL_ARC_D = `M${P_END.x} ${P_END.y} Q${CTRL.x} ${CTRL.y} ${P_START.x} ${P_START.y}`;

const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const quad = (t: number): Pt => lerp(lerp(P_START, CTRL, t), lerp(CTRL, P_END, t), t);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (t: number) => t * t * (3 - 2 * t);
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Accent path from the rise corner to the sun. */
function fromStart(t: number): string {
  const p = quad(t);
  const c1 = lerp(P_START, CTRL, t); // de Casteljau: control point of the sub-curve
  return `M${P_START.x} ${P_START.y} Q${r1(c1.x)} ${r1(c1.y)} ${r1(p.x)} ${r1(p.y)}`;
}

const progress = (now: number, from: Date, to: Date) =>
  clamp01((now - from.getTime()) / (to.getTime() - from.getTime()));

export interface SkySun {
  visible: boolean;
  x: number;
  y: number;
  opacity: number;
  /** Accent arc behind the sun; empty during twilight. */
  pathD: string;
  /** Twilight glow strength 0..1. */
  glow: number;
}

export interface SkyMoon {
  visible: boolean;
  x: number;
  y: number;
  phase: number;
  fraction: number;
}

export interface SkyState {
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

const hiddenSun: SkySun = { visible: false, x: P_START.x, y: P_START.y, opacity: 0, pathD: '', glow: 0 };

export function skyState({ now, day, moon }: SkyInputs): SkyState {
  const n = now.getTime();
  const { fajr, sunrise, isha } = day.byKey;
  const { sunset } = day;

  let sun: SkySun = hiddenSun;
  let stars = 1;
  if (n >= sunrise.getTime() && n < sunset.getTime()) {
    const t = progress(n, sunrise, sunset);
    const p = quad(t);
    sun = { visible: true, x: r1(p.x), y: r1(p.y), opacity: 1, pathD: fromStart(t), glow: 0 };
    stars = 0.15;
  } else if (n >= fajr.getTime() && n < sunrise.getTime()) {
    const d = progress(n, fajr, sunrise);
    sun = {
      visible: true,
      x: P_START.x,
      y: r1(P_START.y + DEPTH * (1 - smooth(d))),
      opacity: 0.3 + 0.7 * d,
      pathD: '',
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
      pathD: '',
      glow: 1 - e,
    };
    stars = 0.3 + 0.7 * e;
  }

  const mp = quad(moon.t);
  const moonOut: SkyMoon = { visible: moon.up, x: r1(mp.x), y: r1(mp.y), phase: moon.phase, fraction: moon.fraction };

  const empty = !sun.visible && !moon.up;
  let next: SkyState['next'] = null;
  if (empty) {
    const nextSunrise = n < sunrise.getTime() ? sunrise : day.nextSunrise;
    next = { kind: 'sun', at: nextSunrise };
    if (moon.nextRise && moon.nextRise.getTime() < nextSunrise.getTime()) next = { kind: 'moon', at: moon.nextRise };
  }

  return { sun, moon: moonOut, stars, empty, next };
}
