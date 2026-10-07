import { useEffect, useState } from 'react';
import { I18nManager, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { skyAlpha, type Sky } from '@/shared/theme/tokens';
import type { Zekr } from '../data';
import { useInk, type SkyMix } from './ink';

const GAP = 2;

interface StoryProgressProps {
  /** The pages, in reading order. */
  items: readonly Zekr[];
  /** Saved count per page, aligned with `items`. */
  counts: readonly number[];
  index: number;
  /** Repetitions said of the current zekr. */
  said: number;
  /** The band's ink: done segments in the sky's line, the rest in its text at low opacity. */
  ink: SkyMix;
}

const lineOf = (s: Sky) => s.line ?? s.text;
const trackOf = (s: Sky) => skyAlpha(s.text, 0.25);

/**
 * One segment per zekr, in reading order. Finished segments are static; only
 * the current one moves, its fill sliding in from the reading-start side under
 * a clip, so a tap costs one transform. The fill follows React's count, not the
 * reader's UI-thread one: that one still holds the previous page's count for a
 * frame after a page turn, which showed the new segment as full.
 */
export function StoryProgress({ items, counts, index, said, ink }: StoryProgressProps) {
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
          <Segment key={z.id} complete={complete} ink={ink}>
            {i === index && !complete ? <Fill key={z.id} target={target} width={segW} ink={ink} /> : null}
          </Segment>
        );
      })}
    </View>
  );
}

function Segment({ complete, ink, children }: { complete: boolean; ink: SkyMix; children: React.ReactNode }) {
  const color = useInk(ink, complete ? lineOf : trackOf, 'backgroundColor');
  return <Animated.View style={[styles.segment, color]}>{children}</Animated.View>;
}

/** Keyed by zekr, so each page's fill is born at its own value and only ever eases within that page. */
function Fill({ target, width, ink }: { target: number; width: number; ink: SkyMix }) {
  const from = I18nManager.isRTL ? 1 : -1;
  const frac = useSharedValue(target);
  useEffect(() => {
    frac.set(withTiming(target, { duration: 140 }));
  }, [frac, target]);
  const color = useInk(ink, lineOf, 'backgroundColor');
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: from * width * (1 - frac.get()) }] }));
  return <Animated.View style={[styles.fill, color, style]} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: GAP, alignSelf: 'stretch' },
  segment: { flex: 1, height: 3, borderRadius: 2, overflow: 'hidden' },
  fill: { ...StyleSheet.absoluteFill },
});
