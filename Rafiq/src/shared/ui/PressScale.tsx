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
 * Clicks fire on release, never on touch-down: a scroll or pan that starts on
 * a control cancels its press, so a finger resting on a row before scrolling
 * stays silent. Only a completed press clicks.
 */
export function useClick(onPress?: PressableProps['onPress'], enabled = true) {
  const handlePress = useCallback(
    (e: GestureResponderEvent) => {
      if (enabled) click();
      onPress?.(e);
    },
    [enabled, onPress],
  );
  return { onPress: handlePress } as const;
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
  onPress,
  onPressIn,
  onPressOut,
  ...rest
}: PressScaleProps) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const press = useClick(onPress, clicks);
  return (
    <AnimatedPressable
      {...rest}
      {...press}
      onPressIn={(e) => {
        scale.set(withTiming(pressedScale, { duration: 120 }));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(withTiming(1, { duration: 160 }));
        onPressOut?.(e);
      }}
      style={[style, animated]}
    />
  );
}
