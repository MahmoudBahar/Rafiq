import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { FARD_PRAYERS } from '@/features/prayer/engine';
import type { FardKey } from '@/shared/lib/adjustments';
import { radius, skyAlpha, type Sky } from '@/shared/theme/tokens';
import { AnimatedText } from '@/shared/ui/Text';
import { useInk, type SkyMix } from './ink';

interface PrayerChipsProps {
  value: FardKey;
  /** The prayer whose adhan passed last: it carries a dot. */
  latest: FardKey;
  ink: SkyMix;
  onChange: (key: FardKey) => void;
}

/**
 * Which prayer's azkar the reader is on: five chips in the band, drawn in the
 * sky's own colours. The selected chip inverts; the latest prayer is dotted so
 * the eye lands on it after switching away.
 */
export function PrayerChips({ value, latest, ink, onChange }: PrayerChipsProps) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {FARD_PRAYERS.map((p) => (
        <Chip key={p.key} name={p.name} selected={p.key === value} dotted={p.key === latest} ink={ink} onPress={() => onChange(p.key)} />
      ))}
    </View>
  );
}

interface ChipProps {
  name: string;
  selected: boolean;
  dotted: boolean;
  ink: SkyMix;
  onPress: () => void;
}

function Chip({ name, selected, dotted, ink, onPress }: ChipProps) {
  const fill = useInk(ink, (s: Sky) => (selected ? s.text : 'rgba(0,0,0,0)'), 'backgroundColor');
  const border = useInk(ink, (s: Sky) => (selected ? s.text : skyAlpha(s.text, 0.35)), 'borderColor');
  const text = useInk(ink, (s: Sky) => (selected ? s.top : s.sub));
  const dot = useInk(ink, (s: Sky) => (selected ? s.top : s.sub), 'backgroundColor');
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`أذكار ما بعد ${name}`}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Animated.View style={[styles.chip, fill, border]}>
        <AnimatedText size={11.5} weight="semi" style={text}>
          {name}
        </AnimatedText>
        {dotted ? <Animated.View style={[styles.dot, dot]} /> : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: 5 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  dot: { width: 5, height: 5, borderRadius: 3 },
  pressed: { opacity: 0.6 },
});
