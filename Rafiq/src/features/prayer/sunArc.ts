/**
 * Sun/moon position along the quadratic arc used by the home header.
 * ViewBox is 330×104; the arc's baseline is y=96. The app is RTL, so sunrise
 * sits on the start (right, x=324) and Maghrib on the end (left, x=6).
 *
 * Phases: by day the sun travels right→left; by night the moon travels back
 * left→right and only sets at sunrise. Between Fajr and sunrise ("dawn") the
 * moon is still up but fading while a glow grows where the sun will appear.
 */
interface Pt {
  x: number;
  y: number;
}

export const ARC_WIDTH = 330;
export const ARC_HEIGHT = 104;

const P_START: Pt = { x: 324, y: 96 };
const CTRL: Pt = { x: 165, y: -30 };
const P_END: Pt = { x: 6, y: 96 };
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const quad = (p0: Pt, c: Pt, p1: Pt, t: number): Pt => lerp(lerp(p0, c, t), lerp(c, p1, t), t);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r1 = (n: number) => Math.round(n * 10) / 10;

/** The sun never sits on the arc's end points (it would clip and cover the labels). */
const T_MIN = 0.03;
const T_MAX = 0.97;

/** Where the sun first appears at sunrise; the dawn glow grows on this spot. */
export const SUNRISE_POINT: Readonly<Pt> = (() => {
  const p = quad(P_START, CTRL, P_END, T_MIN);
  return { x: r1(p.x), y: r1(p.y) };
})();
export const FULL_ARC_D = `M${P_END.x} ${P_END.y} Q${CTRL.x} ${CTRL.y} ${P_START.x} ${P_START.y}`;

/** Sub-curve of the day arc from sunrise to parameter `t`. */
function fromStart(t: number): string {
  const p = quad(P_START, CTRL, P_END, t);
  const c1 = lerp(P_START, CTRL, t); // de Casteljau: control point of the sub-curve
  return `M${P_START.x} ${P_START.y} Q${r1(c1.x)} ${r1(c1.y)} ${r1(p.x)} ${r1(p.y)}`;
}

export type ArcPhase = 'night' | 'dawn' | 'day';

export interface ArcPosition {
  phase: ArcPhase;
  /** 0..1 progress along the current arc (day, or night for night/dawn). */
  t: number;
  /** 0..1 progress from Fajr to sunrise; 0 outside dawn. */
  dawn: number;
  /** Sun (day) or moon (night/dawn) position. */
  x: number;
  y: number;
  /** Accent path from sunrise to the sun; empty outside the day phase. */
  pathD: string;
}

export interface ArcInputs {
  now: Date;
  fajr: Date;
  sunrise: Date;
  maghrib: Date;
  /** Yesterday's Maghrib, used before today's sunrise. */
  prevMaghrib: Date;
  /** Tomorrow's sunrise, used after today's Maghrib. */
  nextSunrise: Date;
}

export function sunArc({ now, fajr, sunrise, maghrib, prevMaghrib, nextSunrise }: ArcInputs): ArcPosition {
  const n = now.getTime();

  if (n >= sunrise.getTime() && n < maghrib.getTime()) {
    const t = clamp((n - sunrise.getTime()) / (maghrib.getTime() - sunrise.getTime()), T_MIN, T_MAX);
    const p = quad(P_START, CTRL, P_END, t);
    return { phase: 'day', t, dawn: 0, x: r1(p.x), y: r1(p.y), pathD: fromStart(t) };
  }

  const from = n >= maghrib.getTime() ? maghrib : prevMaghrib;
  const to = n >= maghrib.getTime() ? nextSunrise : sunrise;
  const t = clamp((n - from.getTime()) / (to.getTime() - from.getTime()), T_MIN, T_MAX);
  const p = quad(P_END, CTRL, P_START, t);
  const isDawn = n >= fajr.getTime() && n < sunrise.getTime();
  const dawn = isDawn ? clamp((n - fajr.getTime()) / (sunrise.getTime() - fajr.getTime()), 0, 1) : 0;
  return {
    phase: isDawn ? 'dawn' : 'night',
    t,
    dawn,
    x: r1(p.x),
    y: r1(p.y),
    pathD: '',
  };
}
