import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  interpolate,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { formatTimeShort } from '@/shared/lib/arabic';
import { useTheme } from '@/shared/theme/useTheme';
import { Text } from '@/shared/ui/Text';
import type { DayTimes } from './engine';
import { ARC_HEIGHT, ARC_START, ARC_WIDTH, FULL_ARC_D, sunArc } from './sunArc';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// [cx, cy, r, twinkle phase]. Phase 0 = steady, otherwise the star breathes
// against the shared pulse (three of them, offset so they never blink together).
const STARS: [number, number, number, number][] = [
  [48, 18, 1.3, 1],
  [92, 42, 1, 0],
  [150, 8, 1.2, 0],
  [216, 30, 1, 2],
  [268, 14, 1.4, 0],
  [300, 50, 1, 3],
  [196, 58, 0.9, 0],
  [124, 22, 0.7, 0],
  [240, 48, 0.7, 0],
];
const TWINKLE: Record<number, [number, number]> = { 1: [1, 0.35], 2: [0.4, 1], 3: [0.7, 0.25] };

const MOON_D = 'M2.4 -6.2a7 7 0 1 0 4.4 11.4 5.6 5.6 0 0 1 -4.4 -11.4z';
const SUN_R = 7;

interface SunArcProps {
  now: Date;
  day: DayTimes;
}

export function SunArc({ now, day }: SunArcProps) {
  const { c } = useTheme();
  const pos = sunArc({
    now,
    fajr: day.byKey.fajr,
    sunrise: day.byKey.sunrise,
    maghrib: day.byKey.maghrib,
    prevMaghrib: day.prevMaghrib,
    nextSunrise: day.nextSunrise,
  });

  // Pulsing halo: 0 → 1 → 0, drives radius and opacity. Reanimated honours
  // the OS reduce-motion setting through ReduceMotion.System.
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.set(
      withRepeat(
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease), reduceMotion: ReduceMotion.System }),
        -1,
        true,
      ),
    );
  }, [pulse]);
  const sunHalo = useAnimatedProps(() => ({
    r: interpolate(pulse.get(), [0, 1], [12, 16.2]),
    opacity: interpolate(pulse.get(), [0, 1], [0.35, 0.12]),
  }));
  const moonHalo = useAnimatedProps(() => ({
    r: interpolate(pulse.get(), [0, 1], [11, 14.8]),
    opacity: interpolate(pulse.get(), [0, 1], [0.4, 0.15]),
  }));
  const twinkle1 = useAnimatedProps(() => ({ opacity: interpolate(pulse.get(), [0, 1], TWINKLE[1]) }));
  const twinkle2 = useAnimatedProps(() => ({ opacity: interpolate(pulse.get(), [0, 1], TWINKLE[2]) }));
  const twinkle3 = useAnimatedProps(() => ({ opacity: interpolate(pulse.get(), [0, 1], TWINKLE[3]) }));
  const twinkles = [twinkle1, twinkle2, twinkle3];

  // The sun pops in at sunrise instead of appearing at full size.
  const sunR = useSharedValue(pos.phase === 'day' ? SUN_R : 0);
  useEffect(() => {
    sunR.set(
      pos.phase === 'day' ? withSpring(SUN_R, { damping: 12, stiffness: 160, reduceMotion: ReduceMotion.System }) : 0,
    );
  }, [pos.phase, sunR]);
  const sunDisc = useAnimatedProps(() => ({ r: sunR.get() }));

  // Stars belong to the night: full after Maghrib, fading through dawn, faint by day.
  const starVis = pos.phase === 'night' ? 1 : pos.phase === 'dawn' ? 1 - 0.7 * pos.dawn : 0.3;
  const glow = pos.dawn;

  return (
    <View style={styles.wrap}>
      <Svg width="100%" height={ARC_HEIGHT} viewBox={`0 0 ${ARC_WIDTH} ${ARC_HEIGHT}`} preserveAspectRatio="none">
        <G opacity={c.starop * starVis}>
          {STARS.map(([cx, cy, r, tw]) =>
            tw ? (
              <AnimatedCircle
                key={`${cx}-${cy}`}
                cx={cx}
                cy={cy}
                r={r}
                fill="#e8dcc3"
                animatedProps={twinkles[tw - 1]}
              />
            ) : (
              <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="#e8dcc3" />
            ),
          )}
        </G>
        <Path
          d={FULL_ARC_D}
          stroke={c.arcdim}
          strokeWidth={2}
          strokeDasharray="1 6"
          strokeLinecap="round"
          fill="none"
        />

        {pos.phase === 'day' ? (
          <>
            <Path d={pos.pathD} stroke={c.accent} strokeWidth={2.5} strokeLinecap="round" fill="none" />
            <AnimatedCircle cx={pos.x} cy={pos.y} fill={c.accent} animatedProps={sunDisc} />
            <AnimatedCircle
              cx={pos.x}
              cy={pos.y}
              fill="none"
              stroke={c.accent}
              strokeWidth={1.5}
              animatedProps={sunHalo}
            />
          </>
        ) : (
          <>
            {/* Dawn: the sky warms at the sunrise point while the moon fades out. */}
            {pos.phase === 'dawn' ? (
              <>
                <Circle
                  cx={ARC_START.x}
                  cy={ARC_START.y}
                  r={14 + 18 * glow}
                  fill={c.accent}
                  opacity={0.05 + 0.2 * glow}
                />
                <Circle
                  cx={ARC_START.x}
                  cy={ARC_START.y}
                  r={5 + 6 * glow}
                  fill={c.accent}
                  opacity={0.12 + 0.4 * glow}
                />
                <Path
                  d={pos.pathD}
                  stroke={c.accent}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  fill="none"
                  opacity={0.25 + 0.75 * glow}
                />
              </>
            ) : null}
            <G transform={`translate(${pos.x} ${pos.y})`} opacity={1 - glow}>
              <Circle cx={0} cy={0} r={14} fill={c.moon} opacity={0.12} />
              <Path d={MOON_D} fill={c.moon} />
              <AnimatedCircle cx={0} cy={0} fill="none" stroke={c.moon} strokeWidth={1.2} animatedProps={moonHalo} />
            </G>
          </>
        )}
      </Svg>
      <View style={styles.labels}>
        <Text size={10} weight="semi" color={c.tm}>
          الشروق {formatTimeShort(day.byKey.sunrise)}
        </Text>
        <Text size={10} weight="semi" color={c.tm}>
          المغرب {formatTimeShort(day.byKey.maghrib)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 6, marginTop: 6 },
  labels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
});
