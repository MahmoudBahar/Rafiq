/**
 * Sun/moon position along the quadratic arc used by the home header.
 * The arc lives in a 330×104 box whose baseline is y=96; the SVG canvas is
 * padded around it so a disc can sit fully visible on either end. The app is
 * RTL, so sunrise sits on the start (right, x=324) and sunset on the end
 * (left, x=6).
 *
 * Phases: by day the sun travels right→left; by night the moon travels back
 * left→right. The two twilights are hand-offs on the arc ends: at dawn
 * (Fajr → sunrise) the moon fades out while an ember grows where the sun will
 * rise; at dusk (sunset → Isha) the sun collapses into an ember that fades
 * while the moon fades in.
 */
interface Pt {
  x: number;
  y: number;
}

export const ARC_WIDTH = 330;
export const ARC_HEIGHT = 104;
/** Canvas padding (svg units) so end-point discs and halos are not clipped. */
export const ARC_PAD = 18;

const P_START: Pt = { x: 324, y: 96 };
const CTRL: Pt = { x: 165, y: -30 };
const P_END: Pt = { x: 6, y: 96 };

export const FULL_ARC_D = `M${P_END.x} ${P_END.y} Q${CTRL.x} ${CTRL.y} ${P_START.x} ${P_START.y}`;

const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const quad = (p0: Pt, c: Pt, p1: Pt, t: number): Pt => lerp(lerp(p0, c, t), lerp(c, p1, t), t);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r1 = (n: number) => Math.round(n * 10) / 10;
const progress = (n: number, from: Date, to: Date) =>
  clamp((n - from.getTime()) / (to.getTime() - from.getTime()), 0, 1);

/** Sub-curve of the day arc from sunrise to parameter `t`. */
function fromStart(t: number): string {
  const p = quad(P_START, CTRL, P_END, t);
  const c1 = lerp(P_START, CTRL, t); // de Casteljau: control point of the sub-curve
  return `M${P_START.x} ${P_START.y} Q${r1(c1.x)} ${r1(c1.y)} ${r1(p.x)} ${r1(p.y)}`;
}

export type ArcPhase = 'night' | 'dawn' | 'day' | 'dusk';

export interface Ember {
  x: number;
  y: number;
  /** 0..1 glow strength. */
  k: number;
}

export interface ArcPosition {
  phase: ArcPhase;
  /** 0..1 progress along the current arc (day, or night for night/dawn/dusk). */
  t: number;
  /** Sun (day) or moon (night/dawn/dusk) position. */
  x: number;
  y: number;
  /** Moon visibility: fades out through dawn, in through dusk. */
  moonOpacity: number;
  /** Warm glow on the arc end during a twilight; null otherwise. */
  ember: Ember | null;
  /** Accent path from sunrise to the sun; empty outside the day phase. */
  pathD: string;
  /** 0..1 how much of the night sky (stars) should show. */
  night: number;
}

export interface ArcInputs {
  now: Date;
  fajr: Date;
  sunrise: Date;
  sunset: Date;
  isha: Date;
  /** Yesterday's sunset, used before today's sunrise. */
  prevSunset: Date;
  /** Tomorrow's sunrise, used after today's sunset. */
  nextSunrise: Date;
}

export function sunArc({ now, fajr, sunrise, sunset, isha, prevSunset, nextSunrise }: ArcInputs): ArcPosition {
  const n = now.getTime();

  if (n >= sunrise.getTime() && n < sunset.getTime()) {
    const t = progress(n, sunrise, sunset);
    const p = quad(P_START, CTRL, P_END, t);
    return {
      phase: 'day',
      t,
      x: r1(p.x),
      y: r1(p.y),
      moonOpacity: 0,
      ember: null,
      pathD: fromStart(t),
      night: 0,
    };
  }

  const afterSunset = n >= sunset.getTime();
  const t = afterSunset ? progress(n, sunset, nextSunrise) : progress(n, prevSunset, sunrise);
  const p = quad(P_END, CTRL, P_START, t);
  const base = { t, x: r1(p.x), y: r1(p.y), pathD: '' };

  if (afterSunset && n < isha.getTime()) {
    const k = 1 - progress(n, sunset, isha);
    return { ...base, phase: 'dusk', moonOpacity: 1 - k, ember: { ...P_END, k }, night: 1 - k };
  }
  if (!afterSunset && n >= fajr.getTime()) {
    const k = progress(n, fajr, sunrise);
    return { ...base, phase: 'dawn', moonOpacity: 1 - k, ember: { ...P_START, k }, night: 1 - k };
  }
  return { ...base, phase: 'night', moonOpacity: 1, ember: null, night: 1 };
}
