/**
 * Geometry of the floating tab bar, in physical pixels from the bar's left
 * edge. The active tab is a wide pill (icon + label), the others are bare
 * icons, so every tab sits somewhere different for each possible active tab.
 * All of those arrangements are computed once up front; the animation then
 * only ever moves between two of them with transforms.
 */

export const BAR_PAD = 8;
export const PILL_H = 42;
export const ICON = 17;
const PILL_PAD = 18;
const ICON_GAP = 8;
const IDLE_W = 44;

export interface BarLayout {
  /** Left and right edges of the pill. */
  pillL: number;
  pillR: number;
  /** Left edge of every icon. */
  iconX: number[];
  /** Left edge of the active tab's label. */
  labelX: number;
  /** Touch area of every tab: its slot plus half the gap on each side. */
  hit: { x: number; w: number }[];
}

export function layoutFor(active: number, barW: number, labelW: readonly number[], rtl: boolean): BarLayout {
  const n = labelW.length;
  const inner = barW - BAR_PAD * 2;
  const widths = labelW.map((lw, i) => (i === active ? PILL_PAD * 2 + ICON + ICON_GAP + lw : IDLE_W));
  const gap = Math.max(0, (inner - widths.reduce((a, b) => a + b, 0)) / n);

  // Walk in reading order, then mirror: under RTL the first tab is the rightmost.
  const xs: number[] = [];
  let s = gap / 2;
  for (let i = 0; i < n; i++) {
    xs.push(rtl ? BAR_PAD + inner - s - widths[i] : BAR_PAD + s);
    s += widths[i] + gap;
  }

  const ax = xs[active];
  const aw = widths[active];
  const iconX = xs.map((x, i) => {
    if (i !== active) return x + (widths[i] - ICON) / 2;
    return rtl ? x + aw - PILL_PAD - ICON : x + PILL_PAD;
  });
  return {
    pillL: ax,
    pillR: ax + aw,
    iconX,
    labelX: rtl ? ax + PILL_PAD : ax + PILL_PAD + ICON + ICON_GAP,
    hit: xs.map((x, i) => ({ x: x - gap / 2, w: widths[i] + gap })),
  };
}
