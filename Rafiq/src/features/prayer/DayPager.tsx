import type { ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { GestureDetector, type PanGesture } from 'react-native-gesture-handler';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';

interface DayPagerProps {
  gesture: PanGesture;
  animatedStyle: AnimatedStyle<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

/** Gesture surface + animated container driven by `useDayPager`. */
export function DayPager({ gesture, animatedStyle, style, children }: DayPagerProps) {
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.fill, style, animatedStyle]}>{children}</Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
