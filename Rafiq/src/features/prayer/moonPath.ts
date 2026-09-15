/**
 * SVG path of the Moon's lit region for a lunar phase.
 *
 * `phase` runs 0 → 1 over a lunation: 0 new, 0.25 first quarter, 0.5 full,
 * 0.75 last quarter. Coordinates are centred on the disc (y down); the lit
 * limb faces +x while waxing and −x while waning, as seen from the northern
 * hemisphere.
 */
export function moonPath(phase: number, r: number): string {
  const p = ((phase % 1) + 1) % 1;
  const rx = round(r * Math.abs(Math.cos(2 * Math.PI * p)));
  const waxing = p < 0.5;
  // Outer limb: half disc on the lit side (clockwise via +x, counter-clockwise via −x).
  const limb = waxing ? `M0,${-r} A${r},${r} 0 0,1 0,${r}` : `M0,${-r} A${r},${r} 0 0,0 0,${r}`;
  // Terminator: bulges toward the lit side for a crescent, away from it for a gibbous moon.
  const crescent = p < 0.25 || p > 0.75;
  const sweep = waxing === crescent ? 0 : 1;
  return `${limb} A${rx},${r} 0 0,${sweep} 0,${-r} Z`;
}

const round = (n: number) => Math.round(n * 100) / 100;
