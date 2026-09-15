import { useCallback } from 'react';
import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { click } from '@/shared/lib/haptics';

/**
 * Press-in is deferred by this much. A scroll or pan that starts on the
 * control steals the responder within the window, which cancels the pending
 * press-in, so only a real press clicks (or scales). A tap released sooner
 * still gets press-in immediately before press-out (RN Pressability).
 */
export const PRESS_DELAY = 80;

/** Props for a `Pressable` that clicks like a physical key on a real press. */
export function useClick(onPressIn?: PressableProps['onPressIn'], enabled = true) {
  const handlePressIn = useCallback(
    (e: GestureResponderEvent) => {
      if (enabled) click();
      onPressIn?.(e);
    },
    [enabled, onPressIn],
  );
  return { onPressIn: handlePressIn, unstable_pressDelay: PRESS_DELAY } as const;
}

export interface PressScaleProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** Scale while pressed (design uses .97). */
  pressedScale?: number;
  /** Haptic click on press; off for controls that answer with their own haptic. */
  click?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Pressable with the design's subtle press-scale feedback and a haptic click. */
export function PressScale({
  style,
  pressedScale = 0.97,
  click: clicks = true,
  onPressIn,
  onPressOut,
  ...rest
}: PressScaleProps) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const pressIn = useCallback(
    (e: GestureResponderEvent) => {
      scale.set(withTiming(pressedScale, { duration: 120 }));
      onPressIn?.(e);
    },
    [onPressIn, pressedScale, scale],
  );
  const press = useClick(pressIn, clicks);
  return (
    <AnimatedPressable
      {...rest}
      {...press}
      onPressOut={(e) => {
        scale.set(withTiming(1, { duration: 160 }));
        onPressOut?.(e);
      }}
      style={[style, animated]}
    />
  );
}
