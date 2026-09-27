import { StyleSheet, View } from 'react-native';
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
  calibrate: { text: 'يحتاج معايرة', tone: 'warn' },
  interference: { text: 'المجال المغناطيسي مضطرب', tone: 'bad' },
  unavailable: { text: 'بلا بوصلة', tone: 'bad' },
  'no-location': { text: 'بلا موقع', tone: 'bad' },
};

export function ConfidencePill({ confidence }: { confidence: Confidence }) {
  const { c } = useTheme();
  const { text, tone } = LABEL[confidence];
  return (
    <View style={[styles.pill, { backgroundColor: c.selbg, borderColor: c.selbr }]} accessibilityRole="text">
      <View style={[styles.dot, { backgroundColor: TRUST[tone] }]} />
      <Text size={11.5} weight="medium" color={c.ts}>
        {text}
      </Text>
    </View>
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
