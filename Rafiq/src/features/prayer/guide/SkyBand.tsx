import { StyleSheet, View } from 'react-native';
import { GradientBackground } from '@/shared/ui/GradientBackground';
import { SkyArc } from '../SkyArc';
import { StarField } from '../StarField';
import type { FrozenSky } from './frozenSky';

interface SkyBandProps {
  frozen: FrozenSky;
  height: number;
  /** Top of the arc block inside the band, in dp. */
  arcTop: number;
  children?: React.ReactNode;
}

/**
 * Header band of a prayer page: the home gradient and stars, plus the home
 * sky arc frozen at that prayer's moment, drawn with the same margins so its
 * proportions match the home screen exactly. Nothing here animates per frame
 * beyond the arc's own halos.
 */
export function SkyBand({ frozen, height, arcTop, children }: SkyBandProps) {
  return (
    <View style={[styles.band, { height }]}>
      <GradientBackground />
      <StarField visibility={frozen.sky.stars} />
      {/* Static: fading a parent of an SVG re-composites the SVG every frame. */}
      <View pointerEvents="none" style={[styles.arc, { top: arcTop }]}>
        <SkyArc sky={frozen.sky} day={frozen.day} footer={false} />
      </View>
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
