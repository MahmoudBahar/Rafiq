import { StyleSheet, View } from 'react-native';
import { formatCountdown } from '@/shared/lib/arabic';
import { useWallClock } from '@/shared/lib/useWallClock';
import { Text } from '@/shared/ui/Text';

interface CountdownDigitsProps {
  /** Moment counted down to. */
  at: Date;
}

const SIZE = 56;
const LINE = 68;
/** Fixed cell widths so the line never shifts as digits change (the font's digits are proportional). */
const DIGIT_W = SIZE * 0.62;
const COLON_W = SIZE * 0.3;

/**
 * The big h:mm:ss. Owns its own one-second clock so only this text re-renders
 * each second, and lays every glyph in a fixed-width cell so the block stays
 * perfectly still while the digits change.
 */
export function CountdownDigits({ at }: CountdownDigitsProps) {
  const now = useWallClock(1000);
  const diff = Math.max(0, Math.floor((at.getTime() - now.getTime()) / 1000));
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  const text = formatCountdown(h, m, s);

  return (
    <View style={styles.row} accessibilityRole="text" accessibilityLabel={text}>
      {Array.from(text).map((ch, i) => (
        <View key={i} style={[styles.cell, { width: ch === ':' ? COLON_W : DIGIT_W }]}>
          <Text size={SIZE} weight="bold" lineHeight={LINE} align="center">
            {ch}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // Digits read left-to-right even in the RTL app, like the rest of the clock strings.
  row: { flexDirection: 'row', direction: 'ltr', justifyContent: 'center' },
  cell: { alignItems: 'center' },
});
