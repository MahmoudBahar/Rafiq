import Svg, { Circle } from 'react-native-svg';

interface MarkProps {
  size: number;
  /** Crescent colour. */
  color: string;
  /** Colour of the surface behind the mark (used to cut the crescent). */
  knockout: string;
  /** Small dot colour (brand accent). */
  accent: string;
}

/**
 * The Rafiq crescent mark. The prototype used an SVG mask; here the inner
 * circle is painted in the background colour instead, which is reliable on
 * Android and visually identical on solid backgrounds.
 */
export function Mark({ size, color, knockout, accent }: MarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Circle cx="46" cy="52" r="30" fill={color} />
      <Circle cx="58" cy="44" r="26" fill={knockout} />
      <Circle cx="70" cy="30" r="6" fill={accent} />
    </Svg>
  );
}
