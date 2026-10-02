import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeIn, LinearTransition, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useMotion } from '@/shared/lib/motion';
import { useTheme } from '@/shared/theme/useTheme';
import { Text } from '@/shared/ui/Text';
import type { Confidence } from '../engine';

/** Semantic colours for the compass's trust, apart from the palette's accent. */
export const TRUST = { good: '#5a9c7a', warn: '#c9a24a', bad: '#c0563f' } as const;

// "Steady", not "accurate": the phone's own accuracy flag stayed at its
// highest while its compass sat 40° off in a steel-framed room.
const LABEL: Record<Confidence, { text: string; tone: keyof typeof TRUST }> = {
  good: { text: 'البوصلة مستقرة', tone: 'good' },
  settling: { text: 'جارٍ الضبط', tone: 'warn' },
  calibrate: { text: 'تحتاج معايرة', tone: 'warn' },
  interference: { text: 'المجال المغناطيسي مضطرب', tone: 'bad' },
  unavailable: { text: 'بلا بوصلة', tone: 'bad' },
  'no-location': { text: 'بلا موقع', tone: 'bad' },
};

/** How long a change of state takes: the dot blends, the new words fade in, the pill eases to its new width. */
const CHANGE_MS = 220;

export function ConfidencePill({ confidence }: { confidence: Confidence }) {
  const { c } = useTheme();
  const { reduced } = useMotion();
  const { text, tone } = LABEL[confidence];
  const color = useSharedValue<string>(TRUST[tone]);
  useEffect(() => {
    color.set(reduced ? TRUST[tone] : withTiming(TRUST[tone], { duration: CHANGE_MS }));
  }, [tone, reduced, color]);
  const dot = useAnimatedStyle(() => ({ backgroundColor: color.get() }));
  return (
    <Animated.View
      layout={reduced ? undefined : LinearTransition.duration(CHANGE_MS)}
      style={[styles.pill, { backgroundColor: c.selbg, borderColor: c.selbr }]}
      accessibilityRole="text"
    >
      <Animated.View style={[styles.dot, dot]} />
      <Animated.View key={confidence} entering={reduced ? undefined : FadeIn.duration(CHANGE_MS)}>
        <Text size={11.5} weight="medium" color={c.ts}>
          {text}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
