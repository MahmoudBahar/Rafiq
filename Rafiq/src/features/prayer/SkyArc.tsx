import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  interpolate,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Path, RadialGradient, Stop } from 'react-native-svg';
import { formatTimeShort } from '@/shared/lib/arabic';
import { useTheme } from '@/shared/theme/useTheme';
import { Text } from '@/shared/ui/Text';
import type { Coords, DayTimes } from './engine';
import { moonState } from './engine/moon';
import { moonPath } from './moonPath';
import { ARC_HEIGHT, ARC_WIDTH, FULL_ARC_D, P_START, skyState } from './sky';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedG = Animated.createAnimatedComponent(G);

const SUN_R = 7;
const MOON_R = 7;

// Star field: [x, y, r, tint, twinkle group (0 = steady), glow]. Kept above the
// arc's lower band so nothing sits on the corners.
type Star = [number, number, number, number, number, boolean];
const TINTS = ['#f3ead6', '#e8dcc3', '#d9e3ea'];
const STARS: Star[] = [
  [22, 14, 1.1, 0, 1, true],
  [41, 38, 0.6, 2, 0, false],
  [58, 8, 1.5, 0, 0, true],
  [76, 26, 0.7, 1, 2, false],
  [95, 46, 0.9, 2, 0, false],
  [104, 12, 1.2, 1, 3, true],
  [126, 30, 0.5, 0, 0, false],
  [138, 4, 0.8, 2, 1, false],
  [151, 20, 1.4, 0, 0, true],
  [172, 40, 0.6, 1, 2, false],
  [184, 9, 1, 2, 0, false],
  [199, 28, 0.7, 0, 3, false],
  [214, 50, 0.9, 1, 0, false],
  [226, 6, 1.3, 0, 1, true],
  [244, 22, 0.6, 2, 0, false],
  [258, 44, 0.8, 1, 2, false],
  [271, 12, 1.5, 0, 0, true],
  [286, 32, 0.6, 2, 3, false],
  [298, 52, 0.9, 0, 0, false],
  [308, 18, 0.7, 1, 1, false],
  [165, 58, 0.5, 2, 0, false],
  [118, 56, 0.6, 1, 0, false],
];
// Per twinkle group: [low, high] opacity swing.
const TWINKLE: [number, number][] = [
  [1, 1],
  [1, 0.35],
  [0.4, 1],
  [0.7, 0.2],
];
const TWINKLE_MS = [0, 1700, 2600, 3400];

interface SkyArcProps {
  now: Date;
  day: DayTimes;
  coords: Coords;
}

export function SkyArc({ now, day, coords }: SkyArcProps) {
  const { c } = useTheme();

  // Moon rise/set is recomputed once a minute; the arc moves well under a pixel per minute.
  const minute = Math.floor(now.getTime() / 60_000);
  const { latitude, longitude } = coords;
  const moon = useMemo(
    () => moonState({ latitude, longitude }, new Date(minute * 60_000)),
    [latitude, longitude, minute],
  );
  const sky = skyState({ now, day, moon });

  // Shared oscillators: halo pulse plus three twinkle rhythms.
  const pulse = useOscillator(1500);
  const tw1 = useOscillator(TWINKLE_MS[1]);
  const tw2 = useOscillator(TWINKLE_MS[2]);
  const tw3 = useOscillator(TWINKLE_MS[3]);
  const twinkles = [pulse, tw1, tw2, tw3];

  // Only plain numbers may be captured by worklets (`sky` holds Dates).
  const sunOpacity = sky.sun.opacity;
  const sunHalo = useAnimatedProps(() => ({
    r: interpolate(pulse.get(), [0, 1], [12, 16.2]),
    opacity: interpolate(pulse.get(), [0, 1], [0.35, 0.12]) * sunOpacity,
  }));
  const moonHalo = useAnimatedProps(() => ({
    r: interpolate(pulse.get(), [0, 1], [11, 14.8]),
    opacity: interpolate(pulse.get(), [0, 1], [0.4, 0.15]),
  }));
  const marker = useAnimatedProps(() => ({
    r: interpolate(pulse.get(), [0, 1], [2.2, 3.2]),
    opacity: interpolate(pulse.get(), [0, 1], [0.7, 0.25]),
  }));

  // Moonrise / moonset fade instead of popping. The last on-arc position is
  // kept so a fade-out finishes where the moon was.
  const moonOp = useSharedValue(sky.moon.visible ? 1 : 0);
  useEffect(() => {
    moonOp.set(withTiming(sky.moon.visible ? 1 : 0, { duration: 400, reduceMotion: ReduceMotion.System }));
  }, [sky.moon.visible, moonOp]);
  const moonStyle = useAnimatedProps(() => ({ opacity: moonOp.get() }));
  const [moonPos, setMoonPos] = useState({ x: sky.moon.x, y: sky.moon.y });
  if (sky.moon.visible && (moonPos.x !== sky.moon.x || moonPos.y !== sky.moon.y)) {
    setMoonPos({ x: sky.moon.x, y: sky.moon.y });
  }

  const litPath = sky.moon.fraction >= 0.03 ? moonPath(sky.moon.phase, MOON_R) : null;
  const nextLabel = sky.next
    ? `${sky.next.kind === 'moon' ? 'طلوع القمر' : 'الشروق'} ${formatTimeShort(sky.next.at)}`
    : null;

  return (
    <View style={styles.wrap}>
      <Svg width="100%" height={ARC_HEIGHT} viewBox={`0 0 ${ARC_WIDTH} ${ARC_HEIGHT}`} preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="starGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#f3ead6" stopOpacity={0.45} />
            <Stop offset="1" stopColor="#f3ead6" stopOpacity={0} />
          </RadialGradient>
        </Defs>

        <G opacity={c.starop * sky.stars}>
          {STARS.map(([x, y, r, tint, group, glow]) => (
            <StarDot
              key={`${x}-${y}`}
              x={x}
              y={y}
              r={r}
              color={TINTS[tint]}
              glow={glow}
              osc={twinkles[group]}
              range={TWINKLE[group]}
            />
          ))}
        </G>

        <Path
          d={FULL_ARC_D}
          stroke={c.arcdim}
          strokeWidth={2}
          strokeDasharray="1 6"
          strokeLinecap="round"
          fill="none"
        />

        {sky.empty ? <AnimatedCircle cx={P_START.x} cy={P_START.y} fill={c.accent} animatedProps={marker} /> : null}

        <AnimatedG transform={`translate(${moonPos.x} ${moonPos.y})`} animatedProps={moonStyle}>
          <Circle cx={0} cy={0} r={MOON_R + 7} fill={c.moon} opacity={0.1} />
          <Circle cx={0} cy={0} r={MOON_R} fill={c.moon} opacity={0.22} />
          {litPath ? <Path d={litPath} fill={c.moon} /> : null}
          <AnimatedCircle cx={0} cy={0} fill="none" stroke={c.moon} strokeWidth={1.2} animatedProps={moonHalo} />
        </AnimatedG>

        {sky.sun.visible ? (
          <>
            {sky.sun.pathD ? (
              <Path d={sky.sun.pathD} stroke={c.accent} strokeWidth={2.5} strokeLinecap="round" fill="none" />
            ) : null}
            {sky.sun.glow > 0 ? (
              <Circle
                cx={sky.sun.x}
                cy={sky.sun.y}
                r={8 + 12 * sky.sun.glow}
                fill={c.accent}
                opacity={0.06 + 0.2 * sky.sun.glow}
              />
            ) : null}
            <Circle cx={sky.sun.x} cy={sky.sun.y} r={SUN_R} fill={c.accent} opacity={sky.sun.opacity} />
            <AnimatedCircle
              cx={sky.sun.x}
              cy={sky.sun.y}
              fill="none"
              stroke={c.accent}
              strokeWidth={1.5}
              animatedProps={sunHalo}
            />
          </>
        ) : null}
      </Svg>

      <View style={styles.labels}>
        <Text size={10} weight="semi" color={c.tm}>
          الشروق {formatTimeShort(day.byKey.sunrise)}
        </Text>
        <Text size={10} weight="semi" color={c.tm}>
          الغروب {formatTimeShort(day.sunset)}
        </Text>
      </View>
      {nextLabel ? (
        <Text size={10} color={c.tm} align="center" style={styles.next}>
          {nextLabel}
        </Text>
      ) : null}
    </View>
  );
}

/** 0 → 1 → 0 forever with the given half-period; honours reduce-motion. */
function useOscillator(ms: number): SharedValue<number> {
  const v = useSharedValue(0);
  useEffect(() => {
    if (ms <= 0) return;
    v.set(
      withRepeat(
        withTiming(1, { duration: ms, easing: Easing.inOut(Easing.ease), reduceMotion: ReduceMotion.System }),
        -1,
        true,
      ),
    );
  }, [ms, v]);
  return v;
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
  const steady = range[0] === range[1];
  const twinkle = useAnimatedProps(() => ({ opacity: interpolate(osc.get(), [0, 1], range) }));
  return (
    <>
      {glow ? <Circle cx={x} cy={y} r={r * 3.2} fill="url(#starGlow)" /> : null}
      {steady ? (
        <Circle cx={x} cy={y} r={r} fill={color} />
      ) : (
        <AnimatedCircle cx={x} cy={y} r={r} fill={color} animatedProps={twinkle} />
      )}
    </>
  );
}

// Corners are inset 18 svg units; the label row is padded so the texts sit under them.
const styles = StyleSheet.create({
  wrap: { marginHorizontal: 6, marginTop: 6 },
  labels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2, paddingHorizontal: 8 },
  next: { marginTop: 2, opacity: 0.85 },
});
