import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  ReduceMotion,
  interpolate,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, G, Line, Path } from 'react-native-svg';
import { toArabicIndic } from '@/shared/lib/arabic';
import { useOscillator } from '@/shared/lib/useOscillator';
import { useTheme } from '@/shared/theme/useTheme';
import { Text } from '@/shared/ui/Text';
import type { DayTimes } from './engine';
import { moonPath } from './moonPath';
import { ARC_HEIGHT, ARC_WIDTH, FULL_ARC_D, HORIZON_Y, P_END, P_START, type SkyState } from './sky';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedG = Animated.createAnimatedComponent(G);

const SUN_R = 7;
const MOON_R = 7;

interface SkyArcProps {
  sky: SkyState;
  day: DayTimes;
}

export function SkyArc({ sky, day }: SkyArcProps) {
  const { c } = useTheme();
  const pulse = useOscillator(1500);

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
  const dayMinutes = Math.round((day.sunset.getTime() - day.byKey.sunrise.getTime()) / 60_000);
  const dayLength = toArabicIndic(`${Math.floor(dayMinutes / 60)}:${String(dayMinutes % 60).padStart(2, '0')}`);

  return (
    <View style={styles.wrap}>
      <Svg width="100%" height={ARC_HEIGHT} viewBox={`0 0 ${ARC_WIDTH} ${ARC_HEIGHT}`} preserveAspectRatio="none">
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

        {/* Horizon: drawn last so a twilight sun sits behind it. */}
        <Line
          x1={P_END.x - 10}
          y1={HORIZON_Y}
          x2={P_START.x + 10}
          y2={HORIZON_Y}
          stroke={c.arcdim}
          strokeWidth={1}
          opacity={0.55}
        />
        <Line
          x1={P_END.x}
          y1={HORIZON_Y - 3}
          x2={P_END.x}
          y2={HORIZON_Y + 3}
          stroke={c.arcdim}
          strokeWidth={1}
          opacity={0.8}
        />
        <Line
          x1={P_START.x}
          y1={HORIZON_Y - 3}
          x2={P_START.x}
          y2={HORIZON_Y + 3}
          stroke={c.arcdim}
          strokeWidth={1}
          opacity={0.8}
        />
      </Svg>

      <Text size={10} weight="semi" color={c.tm} align="center" style={styles.dayLength}>
        طول النهار {dayLength}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 6, marginTop: 6 },
  dayLength: { marginTop: 2, opacity: 0.9 },
});
