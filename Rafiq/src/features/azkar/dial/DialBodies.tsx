import { StyleSheet, View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle } from 'react-native-reanimated';
import { physicalLeft } from '@/shared/lib/rtl';
import { useOscillator } from '@/shared/lib/useOscillator';
import { dialSky } from '@/shared/theme/tokens';
import { SKY_DIR, type DialValues } from './useDial';

const SUN = 44;
const MOON = 40;
const HALO = 104;
const RING_COLOR = 'rgba(166,138,91,0.55)';
/** Roughly the night sky at the height the moon rides, for the crescent's dark side. */
const NIGHT_MID = '#0a2f29';

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
 * counter-rotation on each. Plain views only: nothing here is an SVG, so
 * nothing re-rasterises while it moves.
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
  const moonHalo = useAnimatedStyle(() => ({
    opacity: interpolate(t.get(), [0.5, 1], [0, 1], 'clamp'),
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
        <Animated.View style={[styles.halo, { backgroundColor: 'rgba(232,220,195,0.10)' }, moonHalo]} />
        <View style={[styles.moon, { backgroundColor: dialSky.moon }]}>
          <View style={[styles.moonShade, { backgroundColor: NIGHT_MID }]} />
        </View>
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
  moon: { width: MOON, height: MOON, borderRadius: MOON / 2, overflow: 'hidden' },
  // The sun went down on the left, so the lit limb faces left: the shade sits to the physical right.
  moonShade: { position: 'absolute', top: -5, ...physicalLeft(11), width: MOON, height: MOON, borderRadius: MOON / 2 },
});
