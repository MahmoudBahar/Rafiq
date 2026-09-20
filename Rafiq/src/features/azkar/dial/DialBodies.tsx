import { StyleSheet, View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { moonPath } from '@/features/prayer/moonPath';
import { useOscillator } from '@/shared/lib/useOscillator';
import { dialSky } from '@/shared/theme/tokens';
import { SKY_DIR, type DialValues } from './useDial';

const SUN = 44;
const MOON = 40;
const HALO = 104;
const RING_COLOR = 'rgba(166,138,91,0.55)';
/** A waning crescent: lit on the left, the side the sun went down on. */
const MOON_PHASE = 0.8;
const MOON_R = MOON / 2;

interface DialBodiesProps {
  values: DialValues;
  /** Centre of the disc: the middle of the horizon. */
  cx: number;
  cy: number;
  radius: number;
}

/**
 * The turning disc: a dashed orbit, the sun on one end and the moon on the
 * other. The ring really rotates (its dashes show the turn); the two bodies
 * are placed by trigonometry instead, which keeps them upright without a
 * counter-rotation on each. The crescent is a real crescent (a static SVG
 * path in a view that only translates, so it is rasterised once): a disc with
 * a sky-coloured cover over it never matches the gradient turning behind it.
 */
export function DialBodies({ values, cx, cy, radius }: DialBodiesProps) {
  const { theta, t } = values;
  const breath = useOscillator(2600);

  const ring = useAnimatedStyle(() => ({ transform: [{ rotate: `${-theta.get() * SKY_DIR}deg` }] }));
  const sun = useAnimatedStyle(() => {
    const a = (theta.get() * Math.PI) / 180;
    return { transform: [{ translateX: -SKY_DIR * radius * Math.sin(a) }, { translateY: -radius * Math.cos(a) }] };
  });
  const moon = useAnimatedStyle(() => {
    const a = (theta.get() * Math.PI) / 180 + Math.PI;
    return { transform: [{ translateX: -SKY_DIR * radius * Math.sin(a) }, { translateY: -radius * Math.cos(a) }] };
  });
  const sunHalo = useAnimatedStyle(() => ({
    opacity: interpolate(t.get(), [0, 0.5], [1, 0.35], 'clamp'),
    transform: [{ scale: 0.92 + 0.08 * breath.get() }],
  }));

  return (
    <View pointerEvents="none" style={[styles.origin, { left: cx, top: cy }]}>
      <Animated.View
        style={[
          styles.ring,
          { width: radius * 2, height: radius * 2, borderRadius: radius, margin: -radius },
          ring,
        ]}
      />
      <Animated.View style={[styles.body, { margin: -HALO / 2 }, sun]}>
        <Animated.View style={[styles.halo, { backgroundColor: 'rgba(201,123,90,0.16)' }, sunHalo]} />
        <View style={[styles.haloInner, { backgroundColor: 'rgba(201,123,90,0.22)' }]} />
        <View style={[styles.sun, { backgroundColor: dialSky.dusk }]} />
      </Animated.View>
      <Animated.View style={[styles.body, { margin: -HALO / 2 }, moon]}>
        <Svg width={MOON} height={MOON} viewBox={`${-MOON_R} ${-MOON_R} ${MOON} ${MOON}`}>
          <Path d={moonPath(MOON_PHASE, MOON_R - 1)} fill={dialSky.moon} />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // A zero-size origin at the disc centre: children centre themselves on it with negative margins.
  origin: { position: 'absolute', width: 0, height: 0 },
  ring: { position: 'absolute', borderWidth: 1.5, borderStyle: 'dashed', borderColor: RING_COLOR },
  body: { position: 'absolute', width: HALO, height: HALO, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: HALO, height: HALO, borderRadius: HALO / 2 },
  haloInner: { position: 'absolute', width: 68, height: 68, borderRadius: 34 },
  sun: { width: SUN, height: SUN, borderRadius: SUN / 2 },
});
