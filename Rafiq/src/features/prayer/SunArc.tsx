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
import { ARC_HEIGHT, ARC_PAD, ARC_WIDTH, FULL_ARC_D, sunArc } from './sunArc';

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
/** Stars still faintly visible by day (dark theme only; light theme has starop 0). */
const DAY_STARS = 0.3;

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
    sunset: day.sunset,
    isha: day.byKey.isha,
    prevSunset: day.prevSunset,
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

  // The sun springs in at sunrise and collapses into the ember at sunset.
  const sunR = useSharedValue(pos.phase === 'day' ? SUN_R : 0);
  useEffect(() => {
    if (pos.phase === 'day') {
      sunR.set(withSpring(SUN_R, { damping: 12, stiffness: 160, reduceMotion: ReduceMotion.System }));
    } else if (pos.phase === 'dusk') {
      sunR.set(withTiming(0, { duration: 600, easing: Easing.in(Easing.cubic), reduceMotion: ReduceMotion.System }));
    } else {
      sunR.set(0);
    }
  }, [pos.phase, sunR]);
  const sunDisc = useAnimatedProps(() => ({ r: sunR.get() }));

  const starVis = DAY_STARS + (1 - DAY_STARS) * pos.night;
  const sunAt = pos.phase === 'day' ? pos : pos.ember;

  return (
    <View style={styles.wrap}>
      <Svg
        width="100%"
        height={ARC_HEIGHT + ARC_PAD}
        viewBox={`${-ARC_PAD} 0 ${ARC_WIDTH + 2 * ARC_PAD} ${ARC_HEIGHT + ARC_PAD}`}
        preserveAspectRatio="none"
        style={styles.canvas}
      >
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
          <Path d={pos.pathD} stroke={c.accent} strokeWidth={2.5} strokeLinecap="round" fill="none" />
        ) : null}

        {pos.ember ? (
          <>
            <Circle
              cx={pos.ember.x}
              cy={pos.ember.y}
              r={6 + 9 * pos.ember.k}
              fill={c.accent}
              opacity={0.06 + 0.18 * pos.ember.k}
            />
            <Circle
              cx={pos.ember.x}
              cy={pos.ember.y}
              r={2 + 4 * pos.ember.k}
              fill={c.accent}
              opacity={0.2 + 0.5 * pos.ember.k}
            />
          </>
        ) : null}

        {pos.moonOpacity > 0 ? (
          <G transform={`translate(${pos.x} ${pos.y})`} opacity={pos.moonOpacity}>
            <Circle cx={0} cy={0} r={14} fill={c.moon} opacity={0.12} />
            <Path d={MOON_D} fill={c.moon} />
            <AnimatedCircle cx={0} cy={0} fill="none" stroke={c.moon} strokeWidth={1.2} animatedProps={moonHalo} />
          </G>
        ) : null}

        {sunAt ? (
          <>
            <AnimatedCircle cx={sunAt.x} cy={sunAt.y} fill={c.accent} animatedProps={sunDisc} />
            {pos.phase === 'day' ? (
              <AnimatedCircle
                cx={sunAt.x}
                cy={sunAt.y}
                fill="none"
                stroke={c.accent}
                strokeWidth={1.5}
                animatedProps={sunHalo}
              />
            ) : null}
          </>
        ) : null}
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
  // The canvas bleeds past the wrapper by the padding so the arc keeps its
  // place while end-point discs have room to draw.
  canvas: { marginHorizontal: -ARC_PAD },
  labels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 - ARC_PAD },
});
