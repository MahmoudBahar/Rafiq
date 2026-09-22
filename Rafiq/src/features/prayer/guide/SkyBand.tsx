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
  /**
   * Cut the arc, the stars and the children at once. The return fades the page over
   * the live home, whose own arc sits lower in the same band: two arcs, one a ghost.
   * The band's gradient is the home's, so it alone fades without being seen to.
   */
  skyHidden?: boolean;
  children?: React.ReactNode;
}

/**
 * Header band of a prayer page: the home gradient and stars, plus the home
 * sky arc frozen at that prayer's moment, drawn with the same margins so its
 * proportions match the home screen exactly. Nothing here animates per frame
 * beyond the arc's own halos.
 */
export function SkyBand({ frozen, height, arcTop, skyHidden = false, children }: SkyBandProps) {
  return (
    <View style={[styles.band, { height }]}>
      <GradientBackground />
      {/* Static: fading a parent of an SVG re-composites the SVG every frame. */}
      <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, skyHidden && styles.gone]}>
        <StarField visibility={frozen.sky.stars} />
        <View pointerEvents="none" style={[styles.arc, { top: arcTop }]}>
          <SkyArc sky={frozen.sky} day={frozen.day} footer={false} />
        </View>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    borderBottomStartRadius: 32,
    borderBottomEndRadius: 32,
    overflow: 'hidden',
  },
  gone: { opacity: 0 },
  // Same horizontal inset as the home header, so the arc is the home arc.
  arc: { position: 'absolute', start: 0, end: 0, paddingHorizontal: 24 },
});
