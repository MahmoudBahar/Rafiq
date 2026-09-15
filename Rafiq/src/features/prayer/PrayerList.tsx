import { StyleSheet, View } from 'react-native';
import { formatTime12 } from '@/shared/lib/arabic';
import { radius } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { Text } from '@/shared/ui/Text';
import type { PrayerKey, PrayerTime } from './engine';

interface PrayerListProps {
  times: readonly PrayerTime[];
  /** Highlighted row; null when no row on this day is "next" (other days, or after Isha). */
  nextKey: PrayerKey | null;
}

export function PrayerList({ times, nextKey }: PrayerListProps) {
  const { c } = useTheme();
  return (
    <View style={styles.list}>
      {times.map((p) => {
        const isNext = p.key === nextKey;
        const nameColor = isNext ? c.herotext : p.isPrayer ? c.tp : c.tm;
        const timeColor = isNext ? c.herotext : p.isPrayer ? c.ts : c.tm;
        const weight = isNext ? 'bold' : p.isPrayer ? 'semi' : 'medium';
        return (
          <View
            key={p.key}
            accessibilityLabel={`${p.name} ${formatTime12(p.at)}`}
            style={[
              styles.row,
              isNext
                ? {
                    backgroundColor: c.hero,
                    borderColor: c.hero,
                    borderRadius: radius.lg,
                    paddingVertical: 16,
                    boxShadow: `0 8px 20px ${c.shadow}`,
                  }
                : { backgroundColor: c.surface, borderColor: c.border, borderRadius: radius.md, paddingVertical: 13 },
              !p.isPrayer && { opacity: 0.65 },
            ]}
          >
            <View style={styles.nameWrap}>
              <View style={[styles.dot, { backgroundColor: c.accent, opacity: isNext ? 1 : 0 }]} />
              <Text size={16} weight={weight} color={nameColor}>
                {p.name}
              </Text>
            </View>
            <Text size={14.5} weight={weight} color={timeColor} style={styles.time}>
              {formatTime12(p.at)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 7 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 18,
  },
  nameWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 7, height: 7, borderRadius: 999 },
  time: { fontVariant: ['tabular-nums'] },
});
