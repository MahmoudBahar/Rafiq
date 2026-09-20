import { useSegments } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { I18nManager, StyleSheet, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useMotion } from '@/shared/lib/motion';

export const TAB_ENTER_MS = 200;
const SHIFT = 24;

interface TabSceneProps {
  /** The tab's route name inside the `(tabs)` group. */
  name: 'index' | 'azkar';
  /** Which end of the bar this tab sits toward: the screen slides in from that side. */
  side: 'start' | 'end';
  /** The tab the app opens on: it is simply there at launch, with no entrance. */
  launch?: boolean;
  style?: StyleProp<ViewStyle>;
  onLayout?: ViewProps['onLayout'];
  children: ReactNode;
}

/**
 * A tab's screen, fading and sliding in each time its tab is chosen. The alpha
 * lives on this one view with off-screen compositing, so the screen fades as a
 * finished picture however many opaque layers it stacks.
 *
 * "Chosen" is read from the route segments rather than from focus: a page
 * pushed over the tabs (a prayer, the azkar reader) takes the focus away, but
 * the tab beneath must stay exactly as it was, since those pages are
 * transparent and land back on it.
 */
export function TabScene({ name, side, launch = false, style, onLayout, children }: TabSceneProps) {
  const segments = useSegments() as string[];
  const { reduced } = useMotion();
  const current = segments[0] === '(tabs)' ? (segments[1] ?? 'index') : null;
  const [active, setActive] = useState(current === name);
  // Derived during render; a pushed page (current === null) leaves the last answer standing.
  if (current !== null && (current === name) !== active) setActive(current === name);

  const enter = useSharedValue(launch ? 1 : 0);
  const from = (side === 'start' ? 1 : -1) * (I18nManager.isRTL ? 1 : -1) * SHIFT;

  useEffect(() => {
    if (!active) {
      // It stays put beneath the tab fading in over it, and is parked invisible
      // only afterwards, so its own next entrance starts from nothing.
      enter.set(reduced ? 1 : withDelay(TAB_ENTER_MS + 120, withTiming(0, { duration: 0 })));
      return;
    }
    enter.set(reduced ? 1 : withTiming(1, { duration: TAB_ENTER_MS, easing: Easing.out(Easing.cubic) }));
  }, [active, reduced, enter]);

  const entrance = useAnimatedStyle(() => {
    const e = enter.get();
    return { opacity: e, transform: [{ translateX: (1 - e) * from }] };
  });
  return (
    <Animated.View needsOffscreenAlphaCompositing onLayout={onLayout} style={[styles.fill, style, entrance]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
