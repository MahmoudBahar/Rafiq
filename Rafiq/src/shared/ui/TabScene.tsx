import { useSegments } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import {
  I18nManager,
  PixelRatio,
  StyleSheet,
  useWindowDimensions,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import Animated, { Easing, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useMotion } from '@/shared/lib/motion';
import { tabTravelMs } from './tabMotion';
import { tabPosition, tabSlot } from './tabPosition';

const PX = PixelRatio.get();

interface TabSceneProps {
  /** The tab's route name inside the `(tabs)` group. */
  name: 'index' | 'azkar' | 'qibla';
  /** The page's place on the strip, in the order of the bar's live tabs: 0 is the first. */
  index: number;
  /** The tab's slot on the bar, which may skip tabs that have no page yet. */
  slot: number;
  /** The tab the app opens on. (The strip starts on the first tab, so nothing needs doing for it.) */
  launch?: boolean;
  style?: StyleProp<ViewStyle>;
  onLayout?: ViewProps['onLayout'];
  children: ReactNode;
}

/**
 * A tab's page. Pages sit side by side in the order of the bar, as one strip,
 * and choosing a tab slides the strip across on the same clock and curve as
 * the bar's pill. Every page is placed from the one shared `tabPosition`, so
 * they cannot drift apart. Only a transform moves, so nothing is blended (a
 * fade here let the azkar sky's stacked gradients show through one another on
 * Android).
 *
 * "Chosen" is read from the route segments rather than from focus: a page
 * pushed over the tabs (a prayer, the azkar reader) takes the focus away, but
 * the tab beneath must stay exactly as it was, since those pages are
 * transparent and land back on it.
 */
export function TabScene({ name, index, slot, style, onLayout, children }: TabSceneProps) {
  const segments = useSegments() as string[];
  const { width } = useWindowDimensions();
  const { reduced } = useMotion();
  const current = segments[0] === '(tabs)' ? (segments[1] ?? 'index') : null;
  const [active, setActive] = useState(current === name);
  // Derived during render; a pushed page (current === null) leaves the last answer standing.
  if (current !== null && (current === name) !== active) setActive(current === name);

  // Under RTL the strip runs leftward: the next tab sits to the left.
  const direction = I18nManager.isRTL ? -1 : 1;

  // The page that has just been chosen moves the strip to itself, over the time the
  // pill takes to cross the bar to its slot; the others only follow.
  useEffect(() => {
    if (!active) return;
    const from = tabSlot.get();
    tabSlot.set(slot);
    const duration = tabTravelMs(Math.abs(slot - from));
    tabPosition.set(reduced ? index : withTiming(index, { duration, easing: Easing.inOut(Easing.cubic) }));
  }, [active, reduced, index, slot]);

  // Snapped to whole physical pixels. The pages are a whole number of pixels apart, so they
  // round the same way and their edges always meet.
  const slide = useAnimatedStyle(() => ({
    transform: [{ translateX: Math.round((index - tabPosition.get()) * width * direction * PX) / PX }],
  }));
  return (
    <Animated.View onLayout={onLayout} style={[styles.fill, style, slide]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
