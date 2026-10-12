import { useEffect, useState } from 'react';
import { I18nManager, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { Zekr } from '../data';

const GAP = 2;

interface StoryProgressProps {
  /** The pages, in reading order. */
  items: readonly Zekr[];
  /** Saved count per page, aligned with `items`. */
  counts: readonly number[];
  index: number;
  /** Repetitions said of the current zekr. */
  said: number;
  done: string;
  track: string;
}

/**
 * One segment per zekr, in reading order. Finished segments are static; only
 * the current one moves, its fill sliding in from the reading-start side under
 * a clip, so a tap costs one transform. The fill follows React's count, not the
 * reader's UI-thread one: that one still holds the previous page's count for a
 * frame after a page turn, which showed the new segment as full.
 */
export function StoryProgress({ items, counts, index, said, done, track }: StoryProgressProps) {
  const [width, setWidth] = useState(0);
  const n = items.length;
  const segW = n > 0 ? Math.max(0, (width - GAP * (n - 1)) / n) : 0;
  const total = items[index]?.count ?? 1;
  const target = Math.min(1, said / total);
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
            {i === index && !complete ? <Fill key={z.id} target={target} width={segW} color={done} /> : null}
          </View>
        );
      })}
    </View>
  );
}

/** Keyed by zekr, so each page's fill is born at its own value and only ever eases within that page. */
function Fill({ target, width, color }: { target: number; width: number; color: string }) {
  const from = I18nManager.isRTL ? 1 : -1;
  const frac = useSharedValue(target);
  useEffect(() => {
    frac.set(withTiming(target, { duration: 140 }));
  }, [frac, target]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: from * width * (1 - frac.get()) }] }));
  return <Animated.View style={[styles.fill, { backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: GAP, alignSelf: 'stretch' },
  segment: { flex: 1, height: 3, borderRadius: 2, overflow: 'hidden' },
  fill: { ...StyleSheet.absoluteFill },
});
