import { useEffect, useState } from 'react';
import { I18nManager, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useMotion } from '@/shared/lib/motion';

export type BeadLook = 'solid' | 'outline' | 'faint';

export interface BeadsProps {
  /** One entry per bead, in order. */
  looks: BeadLook[];
  /** Beads per group (a taslim); 0 = one group. */
  perGroup: number;
  color: string;
  faintColor: string;
  /** The card's background: the cover that slides off the beads is painted with it. */
  bg: string;
  /** Delay before the first bead shows, ms; each following bead adds `STAGGER_MS`. */
  delay: number;
  size?: number;
}

export const STAGGER_MS = 40;
const TAIL_MS = 160;

/**
 * Rak'ah as beads, uncovered one after another. The beads are plain views; a
 * single cover in the card's colour slides off them from the reading start.
 * Every animated view costs a native prop update per frame, and a page can
 * show forty beads: animating each one (or each pair) was measured at a
 * fifth to a third of the opening's frames dropped, while one cover per row
 * costs nothing visible.
 */
export function Beads({ looks, perGroup, color, faintColor, bg, delay, size = 11 }: BeadsProps) {
  const { reduced } = useMotion();
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w !== width) setWidth(w);
  };
  const total = TAIL_MS + Math.max(0, looks.length - 1) * STAGGER_MS;
  const t = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    t.set(reduced ? 1 : withDelay(delay, withTiming(1, { duration: total, easing: Easing.linear })));
  }, [delay, reduced, t, total]);
  // Physical translation: under RTL the beads start at the right, so the cover retreats left.
  const dir = I18nManager.isRTL ? -1 : 1;
  const cover = useAnimatedStyle(() => ({ transform: [{ translateX: dir * (width + 2) * t.get() }] }));

  const groups: BeadLook[][] = [];
  if (perGroup <= 0) groups.push(looks);
  else for (let i = 0; i < looks.length; i += perGroup) groups.push(looks.slice(i, i + perGroup));

  return (
    <View style={styles.wrap} onLayout={onLayout} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.row}>
        {groups.map((g, gi) => (
          <View key={gi} style={styles.group}>
            {g.map((look, bi) => (
              <View
                key={bi}
                style={[
                  { width: size, height: size, borderRadius: size, borderWidth: 1.5 },
                  look === 'solid'
                    ? { backgroundColor: color, borderColor: color }
                    : look === 'outline'
                      ? { backgroundColor: 'transparent', borderColor: color }
                      : { backgroundColor: 'transparent', borderColor: faintColor },
                ]}
              />
            ))}
          </View>
        ))}
      </View>
      {reduced || width === 0 ? null : (
        <Animated.View pointerEvents="none" style={[styles.cover, { backgroundColor: bg }, cover]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Clips the cover so it never crosses onto the label beside the beads.
  wrap: { overflow: 'hidden', paddingVertical: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  group: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cover: { position: 'absolute', top: 0, bottom: 0, start: -1, end: -1 },
});
