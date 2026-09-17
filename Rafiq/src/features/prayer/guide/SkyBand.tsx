import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { GradientBackground } from '@/shared/ui/GradientBackground';
import { SkyArc } from '../SkyArc';
import { StarField } from '../StarField';
import type { FrozenSky } from './frozenSky';

interface SkyBandProps {
  frozen: FrozenSky;
  height: number;
  /** Top of the arc block inside the band, in dp. */
  arcTop: number;
  /** Page morph progress; the arc fades in with it. */
  progress: SharedValue<number>;
  children?: React.ReactNode;
}

/**
 * Header band of a prayer page: the home gradient and stars, plus the home
 * sky arc frozen at that prayer's moment, drawn with the same margins so its
 * proportions match the home screen exactly.
 */
export function SkyBand({ frozen, height, arcTop, progress, children }: SkyBandProps) {
  const fade = useAnimatedStyle(() => ({ opacity: progress.get() }));
  return (
    <View style={[styles.band, { height }]}>
      <GradientBackground />
      <StarField visibility={frozen.sky.stars} />
      <Animated.View pointerEvents="none" style={[styles.arc, { top: arcTop }, fade]}>
        <SkyArc sky={frozen.sky} day={frozen.day} footer={false} />
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
  // Same horizontal inset as the home header, so the arc is the home arc.
  arc: { position: 'absolute', start: 0, end: 0, paddingHorizontal: 24 },
});
