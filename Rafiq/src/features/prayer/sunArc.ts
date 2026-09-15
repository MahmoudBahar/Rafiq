/**
 * Sun/moon position along the quadratic arc used by the home header.
 * ViewBox is 330×104; the horizon is the arc's baseline at y=96. The app is
 * RTL, so sunrise sits on the start (right, x=324) and Maghrib on the end
 * (left, x=6). By day the sun travels right→left; by night the moon travels
 * back left→right. Between Fajr and sunrise ("dawn") the sun is still below
 * the horizon and rises into view at the arc start.
 */
interface Pt {
  x: number;
  y: number;
}

export const ARC_WIDTH = 330;
export const ARC_HEIGHT = 104;
export const HORIZON_Y = 96;

const P_START: Pt = { x: 324, y: HORIZON_Y };
const CTRL: Pt = { x: 165, y: -30 };
const P_END: Pt = { x: 6, y: HORIZON_Y };
/** How far below the horizon the sun hides at Fajr (svg units). */
const DAWN_DEPTH = 8;

export const FULL_ARC_D = `M${P_END.x} ${P_END.y} Q${CTRL.x} ${CTRL.y} ${P_START.x} ${P_START.y}`;

const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const quad = (p0: Pt, c: Pt, p1: Pt, t: number): Pt => lerp(lerp(p0, c, t), lerp(c, p1, t), t);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r1 = (n: number) => Math.round(n * 10) / 10;

export type ArcPhase = 'night' | 'dawn' | 'day';

export interface ArcPosition {
  phase: ArcPhase;
  /** 0..1 progress along the current arc (day or night); 0 during dawn. */
  t: number;
  /** 0..1 progress from Fajr to sunrise; 0 outside dawn. */
  dawn: number;
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
  /** Yesterday's Maghrib, used before today's Fajr. */
  prevMaghrib: Date;
  /** Tomorrow's Fajr, used after today's Maghrib. */
  nextFajr: Date;
}

export function sunArc({ now, fajr, sunrise, maghrib, prevMaghrib, nextFajr }: ArcInputs): ArcPosition {
  const n = now.getTime();

  if (n >= fajr.getTime() && n < sunrise.getTime()) {
    const dawn = clamp((n - fajr.getTime()) / (sunrise.getTime() - fajr.getTime()), 0, 1);
    return {
      phase: 'dawn',
      t: 0,
      dawn,
      x: P_START.x,
      y: r1(HORIZON_Y + DAWN_DEPTH * (1 - dawn)),
      pathD: '',
    };
  }

  if (n >= sunrise.getTime() && n < maghrib.getTime()) {
    const t = clamp((n - sunrise.getTime()) / (maghrib.getTime() - sunrise.getTime()), 0.03, 0.97);
    const p = quad(P_START, CTRL, P_END, t);
    const c1 = lerp(P_START, CTRL, t); // de Casteljau: control point of the sub-curve
    return {
      phase: 'day',
      t,
      dawn: 0,
      x: r1(p.x),
      y: r1(p.y),
      pathD: `M${P_START.x} ${P_START.y} Q${r1(c1.x)} ${r1(c1.y)} ${r1(p.x)} ${r1(p.y)}`,
    };
  }

  const from = n >= maghrib.getTime() ? maghrib : prevMaghrib;
  const to = n >= maghrib.getTime() ? nextFajr : fajr;
  const t = clamp((n - from.getTime()) / (to.getTime() - from.getTime()), 0.03, 0.97);
  const p = quad(P_END, CTRL, P_START, t);
  return { phase: 'night', t, dawn: 0, x: r1(p.x), y: r1(p.y), pathD: '' };
}
