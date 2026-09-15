import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { useMotion } from '@/shared/lib/motion';
import { radius } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { Text } from './Text';

interface TipBubbleProps {
  visible: boolean;
  text: string;
}

/**
 * One-time coach-mark bubble hanging under its parent (which must be
 * `position: 'relative'`). Purely decorative: it never takes touches.
 */
export function TipBubble({ visible, text }: TipBubbleProps) {
  const { c } = useTheme();
  const { reduced } = useMotion();
  if (!visible) return null;
  return (
    <Animated.View
      pointerEvents="none"
      entering={reduced ? undefined : FadeInDown.duration(220)}
      exiting={reduced ? undefined : FadeOut.duration(160)}
      style={styles.wrap}
    >
      <View style={[styles.caret, { backgroundColor: c.surface, borderColor: c.border }]} />
      <View
        style={[
          styles.bubble,
          { backgroundColor: c.surface, borderColor: c.border, boxShadow: `0 6px 18px ${c.shadow}` },
        ]}
      >
        <Text size={11.5} weight="medium" color={c.tm}>
          {text}
        </Text>
      </View>
    </Animated.View>
  );
}

const CARET = 9;

const styles = StyleSheet.create({
  // Anchored to the parent's end edge so the bubble grows toward the screen centre.
  wrap: { position: 'absolute', top: '100%', end: 0, marginTop: 4, zIndex: 5, alignItems: 'flex-end' },
  caret: {
    width: CARET,
    height: CARET,
    marginEnd: 40,
    marginBottom: -CARET / 2 - 1,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderEndWidth: 0,
    transform: [{ rotate: '45deg' }],
    zIndex: 1,
  },
  bubble: {
    width: 102,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
  },
});
