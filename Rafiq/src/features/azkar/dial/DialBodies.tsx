import { StyleSheet, View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Path, RadialGradient, Stop } from 'react-native-svg';
import { useOscillator } from '@/shared/lib/useOscillator';
import { dialSky } from '@/shared/theme/tokens';
import { SKY_DIR, type DialValues } from './useDial';

const SUN = 44;
const MOON = 40;
const HALO = 104;
const RING_COLOR = 'rgba(166,138,91,0.55)';
const MOON_R = MOON / 2 - 1;
/**
 * The classic crescent: a disc with a slightly smaller disc bitten out of it, so the horns wrap
 * past the half. Drawn as one path from the two arcs between the circles' crossing points; an SVG
 * mask would do the same at a higher cost. Lit on the left, the bite along +x before the tilt.
 */
const BITE_R = MOON_R * 0.842;
const BITE_OFFSET = MOON_R * 0.416;
const CROSS_X = (BITE_OFFSET ** 2 + MOON_R ** 2 - BITE_R ** 2) / (2 * BITE_OFFSET);
const CROSS_Y = Math.sqrt(MOON_R ** 2 - CROSS_X ** 2);
const CRESCENT =
  `M${CROSS_X},${-CROSS_Y} A${MOON_R},${MOON_R} 0 1,0 ${CROSS_X},${CROSS_Y} ` +
  `A${BITE_R},${BITE_R} 0 1,1 ${CROSS_X},${-CROSS_Y} Z`;
/** Leaning back, the way the crescent is usually drawn; the user picked this one from drawn candidates. */
const MOON_TILT_DEG = -48;

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
        {/* The glow is a radial fade to nothing, centred on the lit limb. A flat translucent disc
            here read as a coloured plate behind the moon rather than as light. */}
        <Svg width={HALO} height={HALO} viewBox={`${-HALO / 2} ${-HALO / 2} ${HALO} ${HALO}`}>
          <Defs>
            <RadialGradient id="moonGlow" cx={-MOON_R * 0.35} cy={0} r={HALO / 2} gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={dialSky.moon} stopOpacity={0.42} />
              <Stop offset="0.35" stopColor={dialSky.moon} stopOpacity={0.16} />
              <Stop offset="1" stopColor={dialSky.moon} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <G rotation={MOON_TILT_DEG}>
            <Circle cx={0} cy={0} r={HALO / 2} fill="url(#moonGlow)" />
            <Path d={CRESCENT} fill={dialSky.moon} />
          </G>
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
