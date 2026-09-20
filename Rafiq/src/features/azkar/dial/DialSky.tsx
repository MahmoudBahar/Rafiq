import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle } from 'react-native-reanimated';
import { dialSky } from '@/shared/theme/tokens';
import { GradientBackground } from '@/shared/ui/GradientBackground';
import type { DialValues } from './useDial';

const STAR_COUNT = 30;

/** Fixed, evenly scattered stars: a small LCG so the sky is the same every launch. */
const STARS = (() => {
  let seed = 20260920;
  const next = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  return Array.from({ length: STAR_COUNT }, () => ({
    x: 4 + next() * 92,
    y: 3 + next() * 58,
    size: next() > 0.72 ? 2.5 : 1.5,
    opacity: 0.45 + next() * 0.55,
  }));
})();

/**
 * The dial's sky: the morning gradient with the night gradient fading in over
 * it, a dusk glow that peaks half-way round, and stars for the night half.
 * Every moving layer is plain views under one fading wrapper; fading a parent
 * of an SVG re-composites the SVG each frame (see prayer/guide/SkyBand).
 */
export function DialSky({ values, horizon }: { values: DialValues; horizon: number }) {
  const { t } = values;
  const night = useAnimatedStyle(() => {
    const v = t.get();
    return { opacity: v * v * (3 - 2 * v) };
  });
  const dusk = useAnimatedStyle(() => ({ opacity: (1 - Math.abs(2 * t.get() - 1)) * 0.5 }));
  const stars = useAnimatedStyle(() => ({ opacity: interpolate(t.get(), [0.45, 1], [0, 1], 'clamp') }));

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <GradientBackground colors={[dialSky.morning.top, dialSky.morning.bot]} />
      <Animated.View style={[StyleSheet.absoluteFill, night]}>
        <GradientBackground colors={[dialSky.evening.top, dialSky.evening.bot]} />
      </Animated.View>
      <Animated.View style={[styles.dusk, { top: horizon * 0.45, height: horizon * 0.55 }, dusk]}>
        <LinearGradient
          colors={['rgba(201,123,90,0)', dialSky.dusk]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          dither
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View renderToHardwareTextureAndroid style={[StyleSheet.absoluteFill, stars]}>
        {STARS.map((s, i) => (
          <View
            key={i}
            style={[
              styles.star,
              { left: `${s.x}%`, top: (horizon * s.y) / 100, width: s.size, height: s.size, opacity: s.opacity },
            ]}
          />
        ))}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  dusk: { position: 'absolute', left: 0, right: 0 },
  star: { position: 'absolute', borderRadius: 2, backgroundColor: dialSky.evening.text },
});
