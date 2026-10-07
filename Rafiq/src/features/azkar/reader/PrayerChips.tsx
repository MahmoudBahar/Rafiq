import { Pressable, StyleSheet, View } from 'react-native';
import { FARD_PRAYERS } from '@/features/prayer/engine';
import type { FardKey } from '@/shared/lib/adjustments';
import { radius, skyAlpha, type Sky } from '@/shared/theme/tokens';
import { Text } from '@/shared/ui/Text';

interface PrayerChipsProps {
  value: FardKey;
  /** The prayer whose adhan passed last: it carries a dot. */
  latest: FardKey;
  sky: Sky;
  onChange: (key: FardKey) => void;
}

/**
 * Which prayer's azkar the reader is on: five chips in the band, drawn in the
 * sky's own colours. The selected chip inverts; the latest prayer is dotted so
 * the eye lands on it after switching away.
 */
export function PrayerChips({ value, latest, sky, onChange }: PrayerChipsProps) {
  const border = skyAlpha(sky.text, 0.35);
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {FARD_PRAYERS.map((p) => {
        const selected = p.key === value;
        return (
          <Pressable
            key={p.key}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`أذكار ما بعد ${p.name}`}
            onPress={() => onChange(p.key)}
            hitSlop={6}
            style={({ pressed }) => [
              styles.chip,
              selected ? { backgroundColor: sky.text, borderColor: sky.text } : { borderColor: border },
              pressed && styles.pressed,
            ]}
          >
            <Text size={11.5} weight="semi" color={selected ? sky.top : sky.sub}>
              {p.name}
            </Text>
            {p.key === latest ? <View style={[styles.dot, { backgroundColor: selected ? sky.top : sky.sub }]} /> : null}
          </Pressable>
        );
      })}
    </View>
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
