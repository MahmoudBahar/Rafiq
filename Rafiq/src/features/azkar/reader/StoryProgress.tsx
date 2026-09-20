import { useState } from 'react';
import { I18nManager, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import type { Zekr } from '../data';

const GAP = 2;

interface StoryProgressProps {
  items: readonly Zekr[];
  counts: readonly number[];
  index: number;
  /** Repetitions of the current zekr, from the UI thread. */
  count: SharedValue<number>;
  done: string;
  track: string;
}

/**
 * One segment per zekr, in reading order. Finished segments are static; only
 * the current one moves, its fill sliding in from the reading-start side under
 * a clip, so a tap costs one transform.
 */
export function StoryProgress({ items, counts, index, count, done, track }: StoryProgressProps) {
  const [width, setWidth] = useState(0);
  const n = items.length;
  const segW = n > 0 ? Math.max(0, (width - GAP * (n - 1)) / n) : 0;
  const total = items[index]?.count ?? 1;
  const from = I18nManager.isRTL ? 1 : -1;
  const fill = useAnimatedStyle(() => ({
    transform: [{ translateX: from * segW * (1 - Math.min(1, count.get() / total)) }],
  }));
  return (
    <View
      style={styles.row}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {items.map((z, i) => {
        const complete = counts[i] >= z.count;
        return (
          <View key={z.id} style={[styles.segment, { backgroundColor: complete ? done : track }]}>
            {i === index && !complete ? <Animated.View style={[styles.fill, { backgroundColor: done }, fill]} /> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: GAP, alignSelf: 'stretch' },
  segment: { flex: 1, height: 3, borderRadius: 2, overflow: 'hidden' },
  fill: { ...StyleSheet.absoluteFill },
});
