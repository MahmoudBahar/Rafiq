import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { interpolate, useAnimatedProps, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, RadialGradient, Stop } from 'react-native-svg';
import { useOscillator } from '@/shared/lib/useOscillator';
import { useTheme } from '@/shared/theme/useTheme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Star {
  /** Normalised position 0..1 across the header. */
  x: number;
  y: number;
  /** Radius in dp. */
  r: number;
  tint: string;
  /** 0 = steady, 1..3 = twinkle rhythm. */
  group: number;
  glow: boolean;
}

const TINTS = ['#f3ead6', '#e8dcc3', '#d9e3ea'];
// Per twinkle group: [low, high] opacity swing and half-period.
const TWINKLE: [number, number][] = [
  [1, 1],
  [1, 0.35],
  [0.4, 1],
  [0.7, 0.2],
];
const TWINKLE_MS = [0, 1700, 2600, 3400];
const COUNT = 46;

/** Deterministic field: denser toward the top of the header, a few bright glowing ones. */
const STARS: Star[] = (() => {
  let seed = 0x2f6e2b1;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const stars: Star[] = [];
  for (let i = 0; i < COUNT; i++) {
    const r = 0.5 + rand() * 1.2;
    const bright = r > 1.35;
    stars.push({
      x: rand(),
      y: Math.pow(rand(), 1.4) * 0.9,
      r,
      tint: TINTS[Math.floor(rand() * TINTS.length)],
      group: rand() < 0.55 ? 0 : 1 + Math.floor(rand() * 3),
      glow: bright,
    });
  }
  return stars;
})();

interface StarFieldProps {
  /** 0..1 from the sky phase (night 1, day faint). */
  visibility: number;
}

/**
 * Full-header star layer. Sits behind the header content; invisible in the
 * light theme (`starop` is 0 there).
 */
export function StarField({ visibility }: StarFieldProps) {
  const { c } = useTheme();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
  };
  const steady = useOscillator(0);
  const tw1 = useOscillator(TWINKLE_MS[1]);
  const tw2 = useOscillator(TWINKLE_MS[2]);
  const tw3 = useOscillator(TWINKLE_MS[3]);
  const oscillators = [steady, tw1, tw2, tw3];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
      {size.w > 0 ? (
        <Svg width={size.w} height={size.h}>
          <Defs>
            <RadialGradient id="starGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#f3ead6" stopOpacity={0.5} />
              <Stop offset="1" stopColor="#f3ead6" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <G opacity={c.starop * visibility}>
            {STARS.map((s, i) => (
              <StarDot
                key={i}
                x={s.x * size.w}
                y={s.y * size.h}
                r={s.r}
                color={s.tint}
                glow={s.glow}
                osc={oscillators[s.group]}
                range={TWINKLE[s.group]}
              />
            ))}
          </G>
        </Svg>
      ) : null}
    </View>
  );
}

interface StarDotProps {
  x: number;
  y: number;
  r: number;
  color: string;
  glow: boolean;
  osc: SharedValue<number>;
  range: [number, number];
}

function StarDot({ x, y, r, color, glow, osc, range }: StarDotProps) {
  const twinkle = useAnimatedProps(() => ({ opacity: interpolate(osc.get(), [0, 1], range) }));
  return (
    <>
      {glow ? <Circle cx={x} cy={y} r={r * 3.4} fill="url(#starGlow)" /> : null}
      {range[0] === range[1] ? (
        <Circle cx={x} cy={y} r={r} fill={color} />
      ) : (
        <AnimatedCircle cx={x} cy={y} r={r} fill={color} animatedProps={twinkle} />
      )}
    </>
  );
}
