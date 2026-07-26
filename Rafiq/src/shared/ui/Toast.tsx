import { StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutDown } from 'react-native-reanimated';
import { radius } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { useMotion } from '@/shared/lib/motion';
import { Text } from './Text';

export interface ToastProps {
  message: string;
  visible: boolean;
  /** Distance from the bottom of the parent. */
  bottom: number;
}

export function Toast({ message, visible, bottom }: ToastProps) {
  const { c } = useTheme();
  const { reduced } = useMotion();
  if (!visible) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, { bottom }]}>
      <Animated.View
        entering={reduced ? undefined : FadeInUp.duration(220)}
        exiting={reduced ? undefined : FadeOutDown.duration(180)}
        style={[styles.pill, { backgroundColor: c.tp }]}
      >
        <Text size={12.5} weight="semi" color={c.bg}>
          {message}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', start: 0, end: 0, alignItems: 'center' },
  pill: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: radius.pill,
    boxShadow: '0 6px 18px rgba(0,0,0,0.2)',
  },
});
