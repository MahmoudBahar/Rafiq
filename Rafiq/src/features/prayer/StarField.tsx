import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { physicalLeft } from '@/shared/lib/rtl';
import { useOscillator } from '@/shared/lib/useOscillator';
import { useTheme } from '@/shared/theme/useTheme';

type Tier = 'faint' | 'mid' | 'bright';

interface Star {
  /** Normalised position across the header (0..1). */
  x: number;
  y: number;
  tier: Tier;
  tint?: number;
}

const TINTS = ['#f3ead6', '#e8dcc3', '#d9e3ea'];
const FAINT_R = 0.65;
const MID_R = 0.9;
const SPARKLE = 5;
/** Four-point sparkle centred on the origin. */
const SPARKLE_D = `M0,${-SPARKLE} L1.1,-1.1 L${SPARKLE},0 L1.1,1.1 L0,${SPARKLE} L-1.1,1.1 L${-SPARKLE},0 L-1.1,-1.1 Z`;
/** Breathing half-periods for the four bright stars, in order. */
const BREATH_MS = [3200, 4100, 5000, 3700];

/**
 * Hand-placed field. The countdown block (x 0.22–0.78, y 0.24–0.56) and the
 * band under the arc (y > 0.72) stay empty. Three loose clusters plus a few
 * lone stars; the four bright ones are spread across the header.
 */
const STARS: Star[] = [
  // Cluster: top, start side (right in RTL)
  { x: 0.66, y: 0.06, tier: 'faint' },
  { x: 0.7, y: 0.12, tier: 'faint', tint: 2 },
  { x: 0.74, y: 0.05, tier: 'mid' },
  { x: 0.78, y: 0.17, tier: 'faint' },
  { x: 0.82, y: 0.09, tier: 'bright' },
  { x: 0.86, y: 0.2, tier: 'faint', tint: 1 },
  { x: 0.9, y: 0.06, tier: 'faint' },
  { x: 0.93, y: 0.14, tier: 'mid', tint: 2 },
  { x: 0.95, y: 0.25, tier: 'faint' },
  { x: 0.64, y: 0.2, tier: 'faint', tint: 1 },
  // Cluster: top, end side (left in RTL)
  { x: 0.05, y: 0.08, tier: 'faint' },
  { x: 0.09, y: 0.16, tier: 'mid' },
  { x: 0.12, y: 0.06, tier: 'faint', tint: 2 },
  { x: 0.16, y: 0.22, tier: 'bright' },
  { x: 0.2, y: 0.1, tier: 'faint' },
  { x: 0.24, y: 0.18, tier: 'faint', tint: 1 },
  { x: 0.28, y: 0.07, tier: 'mid' },
  { x: 0.31, y: 0.27, tier: 'faint' },
  { x: 0.07, y: 0.29, tier: 'faint', tint: 2 },
  // Cluster: low, end side, above the arc
  { x: 0.06, y: 0.54, tier: 'faint' },
  { x: 0.1, y: 0.62, tier: 'mid', tint: 1 },
  { x: 0.14, y: 0.56, tier: 'faint' },
  { x: 0.18, y: 0.66, tier: 'faint', tint: 2 },
  { x: 0.22, y: 0.59, tier: 'bright' },
  { x: 0.09, y: 0.69, tier: 'faint' },
  // Lone stars
  { x: 0.4, y: 0.05, tier: 'faint' },
  { x: 0.47, y: 0.12, tier: 'mid', tint: 2 },
  { x: 0.55, y: 0.07, tier: 'faint' },
  { x: 0.35, y: 0.16, tier: 'faint', tint: 1 },
  { x: 0.6, y: 0.19, tier: 'faint' },
  { x: 0.84, y: 0.36, tier: 'faint' },
  { x: 0.9, y: 0.48, tier: 'mid' },
  { x: 0.95, y: 0.6, tier: 'faint', tint: 1 },
  { x: 0.86, y: 0.64, tier: 'bright' },
  { x: 0.8, y: 0.55, tier: 'faint', tint: 2 },
  { x: 0.03, y: 0.42, tier: 'faint' },
  { x: 0.12, y: 0.4, tier: 'faint', tint: 1 },
  { x: 0.5, y: 0.63, tier: 'faint' },
];

interface StarFieldProps {
  /** 0..1 from the sky phase (night 1, day faint). */
  visibility: number;
}

/**
 * Full-header star layer behind the content. Invisible in the light theme
 * (`starop` is 0 there). Only the four bright stars move: a slow breath, out
 * of phase with each other.
 */
export function StarField({ visibility }: StarFieldProps) {
  const { c } = useTheme();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
  };
  const b0 = useOscillator(BREATH_MS[0]);
  const b1 = useOscillator(BREATH_MS[1]);
  const b2 = useOscillator(BREATH_MS[2]);
  const b3 = useOscillator(BREATH_MS[3]);
  const breaths = [b0, b1, b2, b3];

  const dots = STARS.filter((s) => s.tier !== 'bright');
  const sparkles = STARS.filter((s) => s.tier === 'bright');
  const groupOpacity = c.starop * visibility;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
      {size.w > 0 ? (
        <>
          <Svg width={size.w} height={size.h}>
            <G opacity={groupOpacity}>
              {dots.map((s, i) => (
                <Circle
                  key={i}
                  cx={s.x * size.w}
                  cy={s.y * size.h}
                  r={s.tier === 'mid' ? MID_R : FAINT_R}
                  fill={TINTS[s.tint ?? 0]}
                  opacity={s.tier === 'mid' ? 0.85 : 0.5}
                />
              ))}
            </G>
          </Svg>
          {sparkles.map((s, i) => (
            <Sparkle
              key={i}
              x={s.x * size.w}
              y={s.y * size.h}
              color={TINTS[s.tint ?? 0]}
              osc={breaths[i % breaths.length]}
              base={groupOpacity}
            />
          ))}
        </>
      ) : null}
    </View>
  );
}

interface SparkleProps {
  x: number;
  y: number;
  color: string;
  osc: SharedValue<number>;
  /** Star-group opacity (theme × sky phase). */
  base: number;
}

const SPARKLE_BOX = SPARKLE * 2 + 2;

/**
 * A breathing four-point star. Its SVG is static; the breath animates the
 * wrapping view's opacity, which never re-rasterises the SVG.
 */
function Sparkle({ x, y, color, osc, base }: SparkleProps) {
  const style = useAnimatedStyle(() => ({ opacity: base * interpolate(osc.get(), [0, 1], [0.5, 1]) }));
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          ...physicalLeft(x - SPARKLE_BOX / 2),
          top: y - SPARKLE_BOX / 2,
          width: SPARKLE_BOX,
          height: SPARKLE_BOX,
        },
        style,
      ]}
    >
      <Svg
        width={SPARKLE_BOX}
        height={SPARKLE_BOX}
        viewBox={`${-SPARKLE_BOX / 2} ${-SPARKLE_BOX / 2} ${SPARKLE_BOX} ${SPARKLE_BOX}`}
      >
        <Path d={SPARKLE_D} fill={color} opacity={0.85} />
        <Circle cx={0} cy={0} r={1} fill={color} />
      </Svg>
    </Animated.View>
  );
}
