import { useEffect, useState } from 'react';
import { I18nManager, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { skyAlpha, type Sky } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
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
  /** The band's ink: the track in the sky's text at low opacity. The progress is the accent, as the beads are. */
  ink: SkyMix;
}

const trackOf = (s: Sky) => skyAlpha(s.text, 0.25);
/** A hairline around every segment, so the accent still reads where a sky's horizon is the accent (Maghrib). */
const FRAME = 'rgba(0,0,0,0.28)';

/**
 * One segment per zekr, in reading order, each in a dark hairline frame that
 * keeps the accent apart from a horizon of the same colour. Finished segments
 * are static; only the current one moves, its fill sliding in from the reading-start side under
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
            {i === index && !complete ? <Fill key={z.id} target={target} width={segW - 2} /> : null}
          </Segment>
        );
      })}
    </View>
  );
}

function Segment({ complete, ink, children }: { complete: boolean; ink: SkyMix; children: React.ReactNode }) {
  const { c } = useTheme();
  const track = useInk(ink, trackOf, 'backgroundColor');
  return (
    <View style={styles.frame}>
      <Animated.View style={[styles.segment, complete ? { backgroundColor: c.accent } : track]}>{children}</Animated.View>
    </View>
  );
}

/** Keyed by zekr, so each page's fill is born at its own value and only ever eases within that page. */
function Fill({ target, width }: { target: number; width: number }) {
  const from = I18nManager.isRTL ? 1 : -1;
  const frac = useSharedValue(target);
  useEffect(() => {
    frac.set(withTiming(target, { duration: 140 }));
  }, [frac, target]);
  const { c } = useTheme();
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: from * width * (1 - frac.get()) }] }));
  return <Animated.View style={[styles.fill, { backgroundColor: c.accent }, style]} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: GAP, alignSelf: 'stretch' },
  frame: { flex: 1, padding: 1, borderRadius: 3, backgroundColor: FRAME },
  segment: { height: 3, borderRadius: 2, overflow: 'hidden' },
  fill: { ...StyleSheet.absoluteFill },
});
