import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { useOscillator } from '@/shared/lib/useOscillator';
import { useTheme } from '@/shared/theme/useTheme';
import { GradientBackground } from '@/shared/ui/GradientBackground';
import { ARC_HEIGHT, ARC_WIDTH, P_END, P_START, arcPath, arcPoint } from '../sky';
import { Halo } from '../SkyArc';
import { StarField } from '../StarField';
import type { Mood } from '../sunnah';

/** Star visibility and the Sun's place on the arc, per mood. */
const MOODS: Record<Mood, { stars: number; sunT: number | null; ember: 'rise' | 'set' | null }> = {
  dawn: { stars: 0.55, sunT: null, ember: 'rise' },
  morning: { stars: 0, sunT: 0.12, ember: null },
  day: { stars: 0, sunT: 0.5, ember: null },
  afternoon: { stars: 0, sunT: 0.75, ember: null },
  dusk: { stars: 0.35, sunT: null, ember: 'set' },
  night: { stars: 1, sunT: null, ember: null },
};

const SUN_R = 7;

interface SkyBandProps {
  mood: Mood;
  height: number;
  /** Top of the arc box inside the band, in dp. */
  arcTop: number;
  /** Page morph progress; the arc fades in with it. */
  progress: SharedValue<number>;
  children?: React.ReactNode;
}

/**
 * Header band of a prayer page: the home gradient and stars, plus a frozen
 * copy of the sky arc with the Sun where it stands at that prayer. Pulses are
 * plain views over a static SVG, as on the home screen.
 */
export function SkyBand({ mood, height, arcTop, progress, children }: SkyBandProps) {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const pulse = useOscillator(1500);
  const m = MOODS[mood];
  const sx = width / ARC_WIDTH;
  const fade = useAnimatedStyle(() => ({ opacity: progress.get() }));

  const sun = m.sunT !== null ? arcPoint(m.sunT) : null;
  const ember = m.ember === 'rise' ? P_START : m.ember === 'set' ? P_END : null;

  return (
    <View style={[styles.band, { height }]}>
      <GradientBackground />
      <StarField visibility={m.stars} />
      <Animated.View pointerEvents="none" style={[styles.arc, { top: arcTop, width }, fade]}>
        {/* Explicit pixel width: percentage-sized SVG roots shift under forced RTL on Android. */}
        <Svg width={width} height={ARC_HEIGHT} viewBox={`0 0 ${ARC_WIDTH} ${ARC_HEIGHT}`} preserveAspectRatio="none">
          <Path d={arcPath(0, 1)} stroke={c.arcdim} strokeWidth={2} strokeDasharray="1 6" strokeLinecap="round" fill="none" />
          {sun && m.sunT !== null ? (
            <>
              <Path d={arcPath(0, m.sunT)} stroke={c.accent} strokeWidth={2.5} strokeLinecap="round" fill="none" />
              <Circle cx={sun.x} cy={sun.y} r={SUN_R} fill={c.accent} />
            </>
          ) : null}
          {ember ? <Circle cx={ember.x} cy={ember.y} r={18} fill={c.accent} opacity={0.12} /> : null}
        </Svg>
        {sun ? (
          <Halo x={sun.x * sx} y={sun.y} radius={12 * sx} grow={1.35} color={c.accent} width={1.5} opacity={[0.35, 0.12]} pulse={pulse} />
        ) : null}
        {ember ? (
          <Halo x={ember.x * sx} y={ember.y} radius={7 * sx} grow={1.5} color={c.accent} width={1.2} opacity={[0.35, 0.1]} pulse={pulse} />
        ) : null}
      </Animated.View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    borderBottomStartRadius: 32,
    borderBottomEndRadius: 32,
    overflow: 'hidden',
  },
  arc: { position: 'absolute', start: 0, height: ARC_HEIGHT },
});
