/**
 * SVG path of the Moon's lit region for a lunar phase, drawn the way the Moon
 * looks in the observer's sky rather than relative to the arc's Sun.
 *
 * `phase` runs 0 → 1 over a lunation: 0 new, 0.25 first quarter, 0.5 full,
 * 0.75 last quarter. Coordinates are centred on the disc (y down). North of
 * the equator a waxing moon is lit on its right (+x) limb and a waning one on
 * its left; `southern` mirrors that.
 */
export function moonPath(phase: number, r: number, southern = false): string {
  const p = ((phase % 1) + 1) % 1;
  const rx = round(r * Math.abs(Math.cos(2 * Math.PI * p)));
  const waxing = p < 0.5;
  const litRight = waxing !== southern;
  // Outer limb: half disc on the lit side (clockwise via +x, counter-clockwise via −x).
  const limb = litRight ? `M0,${-r} A${r},${r} 0 0,1 0,${r}` : `M0,${-r} A${r},${r} 0 0,0 0,${r}`;
  // Terminator: bulges toward the lit side for a crescent, away from it for a gibbous moon.
  const crescent = p < 0.25 || p > 0.75;
  const sweep = litRight === crescent ? 0 : 1;
  return `${limb} A${rx},${r} 0 0,${sweep} 0,${-r} Z`;
}

const round = (n: number) => Math.round(n * 100) / 100;
