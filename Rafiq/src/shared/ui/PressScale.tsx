import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { fire, type HapticKind } from '@/shared/lib/haptics';

export interface PressScaleProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** Scale while pressed (design uses .97). */
  pressedScale?: number;
  /** Haptic fired on press-in (instant, like a physical key). */
  haptic?: HapticKind;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Pressable with the design's subtle press-scale feedback. */
export function PressScale({ style, pressedScale = 0.97, haptic = 'none', onPressIn, onPressOut, ...rest }: PressScaleProps) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => {
        fire(haptic);
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
