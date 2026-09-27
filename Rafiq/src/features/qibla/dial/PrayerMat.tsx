import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useTheme } from '@/shared/theme/useTheme';

/** The mat's drawing box; everything inside is placed in these units. */
export const MAT_W = 100;
export const MAT_H = 170;
const LAMP_Y = 46;
const LIT_LAMP = '#f0c97a';

interface PrayerMatProps {
  /** Rendered width in dp; the height follows the box's ratio. */
  width: number;
  /** 0..1 lock progress: the niche warms and the lamp lights. */
  lockT: SharedValue<number>;
}

/**
 * A prayer mat seen from above, its niche at the top. Two static drawings,
 * unlit and lit, sit on top of each other and the lit one fades in with the
 * lock, so nothing inside the SVG ever animates (a per-frame SVG prop
 * re-rasterises the whole canvas on the CPU). The lamp's glow is a plain
 * view with a shadow, for the same reason.
 */
export function PrayerMat({ width, lockT }: PrayerMatProps) {
  const height = (width * MAT_H) / MAT_W;
  const lit = useAnimatedStyle(() => ({ opacity: lockT.get() }));
  const glow = useAnimatedStyle(() => ({ opacity: lockT.get() * 0.9, transform: [{ scale: 0.6 + 0.4 * lockT.get() }] }));
  const lampSize = width * 0.22;
  return (
    <View style={{ width, height }}>
      <Drawing width={width} height={height} lit={false} />
      <Animated.View style={[StyleSheet.absoluteFill, lit]}>
        <Drawing width={width} height={height} lit />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glow,
          glow,
          {
            width: lampSize,
            height: lampSize,
            borderRadius: lampSize / 2,
            top: (LAMP_Y / MAT_H) * height - lampSize / 2,
            left: width / 2 - lampSize / 2,
            boxShadow: `0 0 ${lampSize}px ${lampSize * 0.35}px rgba(240,201,122,0.55)`,
          },
        ]}
      />
    </View>
  );
}

function Drawing({ width, height, lit }: { width: number; height: number; lit: boolean }) {
  const { c } = useTheme();
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${MAT_W} ${MAT_H}`}>
      <Defs>
        <LinearGradient id="niche" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={c.accent} stopOpacity={lit ? 0.55 : 0.12} />
          <Stop offset="1" stopColor={c.accent} stopOpacity={lit ? 0.22 : 0.05} />
        </LinearGradient>
      </Defs>
      {/* The mat and its border band. */}
      <Rect x="2" y="2" width={MAT_W - 4} height={MAT_H - 4} rx="8" fill={c.surface} stroke={c.selbr} strokeWidth="1" />
      <Rect x="9" y="9" width={MAT_W - 18} height={MAT_H - 18} rx="4" fill="none" stroke={c.tm} strokeWidth="2.5" opacity="0.55" />
      {/* Tassels along the bottom edge. */}
      {Array.from({ length: 9 }, (_, i) => (
        <Path key={i} d={`M${14 + i * 9} ${MAT_H - 2} v3`} stroke={c.tm} strokeWidth="1.2" opacity="0.6" />
      ))}
      {/* The niche, pointing the way. */}
      <Path
        d="M22 142 V60 Q22 30 50 24 Q78 30 78 60 V142 Z"
        fill="url(#niche)"
        stroke={c.accent}
        strokeWidth="1.5"
        opacity={lit ? 1 : 0.55}
      />
      <Path d="M28 142 V62 Q28 38 50 33 Q72 38 72 62 V142" fill="none" stroke={c.accent} strokeWidth="0.8" opacity={lit ? 0.7 : 0.3} />
      {/* The hanging lamp. */}
      <Path d={`M50 24 V${LAMP_Y - 8}`} stroke={c.tm} strokeWidth="1" />
      <Path d={`M44 ${LAMP_Y - 8} H56 L54 ${LAMP_Y + 6} H46 Z`} fill={lit ? LIT_LAMP : c.tm} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  glow: { position: 'absolute', backgroundColor: LIT_LAMP },
});
