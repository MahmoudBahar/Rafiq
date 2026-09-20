import { useSegments } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import {
  I18nManager,
  StyleSheet,
  useWindowDimensions,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useMotion } from '@/shared/lib/motion';
import { tabTravelMs } from './tabMotion';

interface TabSceneProps {
  /** The tab's route name inside the `(tabs)` group. */
  name: 'index' | 'azkar';
  /** Which end of the bar this tab sits toward: its page lives on that side. */
  side: 'start' | 'end';
  /** The tab the app opens on: it is simply there at launch. */
  launch?: boolean;
  style?: StyleProp<ViewStyle>;
  onLayout?: ViewProps['onLayout'];
  children: ReactNode;
}

/**
 * A tab's page. Pages sit side by side in the order of the bar, and choosing a
 * tab slides the pair across: the page being left goes out on its side while
 * the chosen one comes in from its own, on the same clock and curve as the
 * bar's pill. Only a transform moves, so nothing is blended (a fade here let
 * the azkar sky's stacked gradients show through one another on Android).
 *
 * "Chosen" is read from the route segments rather than from focus: a page
 * pushed over the tabs (a prayer, the azkar reader) takes the focus away, but
 * the tab beneath must stay exactly as it was, since those pages are
 * transparent and land back on it.
 */
export function TabScene({ name, side, launch = false, style, onLayout, children }: TabSceneProps) {
  const segments = useSegments() as string[];
  const { width } = useWindowDimensions();
  const { reduced } = useMotion();
  const current = segments[0] === '(tabs)' ? (segments[1] ?? 'index') : null;
  const [active, setActive] = useState(current === name);
  // Derived during render; a pushed page (current === null) leaves the last answer standing.
  if (current !== null && (current === name) !== active) setActive(current === name);

  // 0 = in place, 1 = a full page away on this tab's own side (physical right for the start side under RTL).
  const away = useSharedValue(launch ? 0 : 1);
  const direction = (side === 'start' ? 1 : -1) * (I18nManager.isRTL ? 1 : -1);

  useEffect(() => {
    const target = active ? 0 : 1;
    away.set(
      reduced ? target : withTiming(target, { duration: tabTravelMs(1), easing: Easing.inOut(Easing.cubic) }),
    );
  }, [active, reduced, away]);

  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: away.get() * direction * width }] }));
  return (
    <Animated.View onLayout={onLayout} style={[styles.fill, style, slide]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
