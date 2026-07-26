/**
 * Sun/moon position along the quadratic arc used by the home header.
 * ViewBox is 330×104. The app is RTL, so Fajr sits on the start (right,
 * x=324) and Maghrib on the end (left, x=6). By day the sun travels
 * right→left; by night the moon travels back left→right.
 */
interface Pt {
  x: number;
  y: number;
}

export const ARC_WIDTH = 330;
export const ARC_HEIGHT = 104;

const P_FAJR: Pt = { x: 324, y: 96 };
const CTRL: Pt = { x: 165, y: -30 };
const P_MAGHRIB: Pt = { x: 6, y: 96 };

export const FULL_ARC_D = `M${P_MAGHRIB.x} ${P_MAGHRIB.y} Q${CTRL.x} ${CTRL.y} ${P_FAJR.x} ${P_FAJR.y}`;

const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const quad = (p0: Pt, c: Pt, p1: Pt, t: number): Pt => lerp(lerp(p0, c, t), lerp(c, p1, t), t);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r1 = (n: number) => Math.round(n * 10) / 10;

export interface ArcPosition {
  /** 0..1 progress along the current arc (day or night). */
  t: number;
  x: number;
  y: number;
  isNight: boolean;
  /** Accent path from Fajr to the sun; empty at night. */
  pathD: string;
}

export interface ArcInputs {
  now: Date;
  fajr: Date;
  maghrib: Date;
  /** Yesterday's Maghrib, used before today's Fajr. */
  prevMaghrib: Date;
  /** Tomorrow's Fajr, used after today's Maghrib. */
  nextFajr: Date;
}

export function sunArc({ now, fajr, maghrib, prevMaghrib, nextFajr }: ArcInputs): ArcPosition {
  const n = now.getTime();
  const isNight = n < fajr.getTime() || n >= maghrib.getTime();

  if (!isNight) {
    const t = clamp((n - fajr.getTime()) / (maghrib.getTime() - fajr.getTime()), 0.03, 0.97);
    const p = quad(P_FAJR, CTRL, P_MAGHRIB, t);
    const c1 = lerp(P_FAJR, CTRL, t); // de Casteljau: control point of the sub-curve
    return {
      t,
      x: r1(p.x),
      y: r1(p.y),
      isNight,
      pathD: `M${P_FAJR.x} ${P_FAJR.y} Q${r1(c1.x)} ${r1(c1.y)} ${r1(p.x)} ${r1(p.y)}`,
    };
  }

  const from = n >= maghrib.getTime() ? maghrib : prevMaghrib;
  const to = n >= maghrib.getTime() ? nextFajr : fajr;
  const t = clamp((n - from.getTime()) / (to.getTime() - from.getTime()), 0.03, 0.97);
  const p = quad(P_MAGHRIB, CTRL, P_FAJR, t);
  return { t, x: r1(p.x), y: r1(p.y), isNight, pathD: '' };
}
