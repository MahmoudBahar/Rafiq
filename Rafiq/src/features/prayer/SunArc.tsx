import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  interpolate,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, G, Path, Rect } from 'react-native-svg';
import { formatTimeShort } from '@/shared/lib/arabic';
import { useTheme } from '@/shared/theme/useTheme';
import { Text } from '@/shared/ui/Text';
import type { DayTimes } from './engine';
import { ARC_HEIGHT, ARC_WIDTH, FULL_ARC_D, HORIZON_Y, sunArc } from './sunArc';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const STARS: [number, number, number][] = [
  [48, 18, 1.3],
  [92, 42, 1],
  [150, 8, 1.2],
  [216, 30, 1],
  [268, 14, 1.4],
  [300, 50, 1],
  [196, 58, 0.9],
];

const MOON_D = 'M2.4 -6.2a7 7 0 1 0 4.4 11.4 5.6 5.6 0 0 1 -4.4 -11.4z';

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
    nextFajr: day.nextFajr,
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

  return (
    <View style={styles.wrap}>
      <Svg width="100%" height={ARC_HEIGHT} viewBox={`0 0 ${ARC_WIDTH} ${ARC_HEIGHT}`} preserveAspectRatio="none">
        <Defs>
          {/* Everything below the horizon line is hidden: the dawn sun rises into view. */}
          <ClipPath id="horizon">
            <Rect x={0} y={0} width={ARC_WIDTH} height={HORIZON_Y} />
          </ClipPath>
        </Defs>
        <G opacity={c.starop}>
          {STARS.map(([cx, cy, r]) => (
            <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="#e8dcc3" />
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
        {pos.phase === 'night' ? (
          <G transform={`translate(${pos.x} ${pos.y})`}>
            <Circle cx={0} cy={0} r={14} fill={c.moon} opacity={0.12} />
            <Path d={MOON_D} fill={c.moon} />
            <AnimatedCircle cx={0} cy={0} fill="none" stroke={c.moon} strokeWidth={1.2} animatedProps={moonHalo} />
          </G>
        ) : pos.phase === 'dawn' ? (
          <G clipPath="url(#horizon)">
            <Circle cx={pos.x} cy={pos.y} r={22} fill={c.accent} opacity={0.08 + 0.14 * pos.dawn} />
            <Circle cx={pos.x} cy={pos.y} r={7} fill={c.accent} />
            <AnimatedCircle
              cx={pos.x}
              cy={pos.y}
              fill="none"
              stroke={c.accent}
              strokeWidth={1.5}
              animatedProps={sunHalo}
            />
          </G>
        ) : (
          <>
            <Path d={pos.pathD} stroke={c.accent} strokeWidth={2.5} strokeLinecap="round" fill="none" />
            <Circle cx={pos.x} cy={pos.y} r={7} fill={c.accent} />
            <AnimatedCircle
              cx={pos.x}
              cy={pos.y}
              fill="none"
              stroke={c.accent}
              strokeWidth={1.5}
              animatedProps={sunHalo}
            />
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
