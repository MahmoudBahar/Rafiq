import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Line, Rect } from 'react-native-svg';
import { useTheme } from '@/shared/theme/useTheme';
import { Text } from '@/shared/ui/Text';
import type { QiblaValues } from '../useQibla';
import { PrayerMat } from './PrayerMat';

interface CompassDialProps {
  values: QiblaValues;
  /** True bearing to the Kaaba; null draws the mat straight up, unlit. */
  bearing: number | null;
  size: number;
  /** Dims the whole dial while it cannot be trusted. */
  dimmed: boolean;
}

/** Compass points, clockwise from the top. Real-world directions: never mirrored under RTL. */
const POINTS = ['ش', 'ق', 'ج', 'غ'] as const;
const TICKS = 72;
const KAABA = 18;

/**
 * The compass hero. The world (compass points and ticks) turns against the
 * heading so north stays north; the mat turns to the bearing, so it lies
 * straight on the screen exactly when the phone faces the Qibla. Both are
 * view transforms over static drawings.
 */
export function CompassDial({ values, bearing, size, dimmed }: CompassDialProps) {
  const { c } = useTheme();
  const { heading, lockT } = values;
  const r = size / 2;
  const matW = size * 0.4;
  const b = bearing ?? 0;

  const world = useAnimatedStyle(() => ({ transform: [{ rotate: `${-heading.get()}deg` }] }));
  const mat = useAnimatedStyle(() => ({
    transform: [{ rotate: `${bearing === null ? 0 : b - heading.get()}deg` }, { scale: 1 + 0.04 * lockT.get() }],
  }));
  const halo = useAnimatedStyle(() => ({ opacity: lockT.get() }));

  return (
    <View style={[{ width: size, height: size, opacity: dimmed ? 0.45 : 1 }, styles.center]}>
      {/* The lock's halo around the whole dial. */}
      <Animated.View
        pointerEvents="none"
        style={[styles.halo, halo, { width: size, height: size, borderRadius: r, boxShadow: `0 0 ${size * 0.12}px ${size * 0.02}px ${c.accent}55` }]}
      />
      <Animated.View style={[StyleSheet.absoluteFill, world]}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {Array.from({ length: TICKS }, (_, i) => {
            const a = (i * 2 * Math.PI) / TICKS;
            const major = i % (TICKS / 4) === 0;
            const mid = i % (TICKS / 12) === 0;
            const len = major ? 12 : mid ? 8 : 5;
            return (
              <Line
                key={i}
                x1={r + (r - 2) * Math.sin(a)}
                y1={r - (r - 2) * Math.cos(a)}
                x2={r + (r - 2 - len) * Math.sin(a)}
                y2={r - (r - 2 - len) * Math.cos(a)}
                stroke={c.tm}
                strokeWidth={major ? 2 : 1}
                opacity={major ? 1 : mid ? 0.7 : 0.35}
              />
            );
          })}
        </Svg>
        {POINTS.map((p, i) => {
          const a = (i * Math.PI) / 2;
          const d = r - 26;
          // Physical positions: `left` here must not flip under RTL.
          return (
            <View
              key={p}
              style={[styles.point, { left: r + d * Math.sin(a) - 12, top: r - d * Math.cos(a) - 12 }]}
              pointerEvents="none"
            >
              <Text size={13} weight="semi" color={i === 0 ? c.accent : c.ts} align="center" style={styles.pointText}>
                {p}
              </Text>
            </View>
          );
        })}
      </Animated.View>

      <Animated.View style={[styles.center, mat]}>
        <View style={{ height: KAABA + 8 }}>
          <Svg width={KAABA} height={KAABA} viewBox="0 0 18 18">
            <Rect x="1" y="1" width="16" height="16" fill="#1b1b1b" />
            <Rect x="1" y="6" width="16" height="4" fill="#d9b25c" />
          </Svg>
        </View>
        <PrayerMat width={matW} lockT={lockT} />
        <View style={{ height: KAABA + 8 }} />
      </Animated.View>

      {/* The phone's own direction: a fixed mark at the top. */}
      <View pointerEvents="none" style={[styles.index, { top: 0, left: r - 7, borderTopColor: c.accent }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute' },
  point: { position: 'absolute', width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  pointText: { alignSelf: 'stretch' },
  index: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
});
