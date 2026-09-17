import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { formatTime12 } from '@/shared/lib/arabic';
import { radius } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { PressScale } from '@/shared/ui/PressScale';
import { Text } from '@/shared/ui/Text';
import type { PrayerKey, PrayerTime } from './engine';

/** Window-relative rectangle of a pressed row, in dp, for the page morph. */
export interface RowRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PrayerListProps {
  times: readonly PrayerTime[];
  /** Highlighted row; null when no row on this day is "next" (other days, or after Isha). */
  nextKey: PrayerKey | null;
  onPressPrayer?: (key: PrayerKey, rect: RowRect) => void;
}

export function PrayerList({ times, nextKey, onPressPrayer }: PrayerListProps) {
  return (
    <View style={styles.list}>
      {times.map((p) => (
        <Row key={p.key} time={p} isNext={p.key === nextKey} onPress={onPressPrayer} />
      ))}
    </View>
  );
}

interface RowProps {
  time: PrayerTime;
  isNext: boolean;
  onPress?: (key: PrayerKey, rect: RowRect) => void;
}

function Row({ time: p, isNext, onPress }: RowProps) {
  const { c } = useTheme();
  const box = useRef<View>(null);
  const nameColor = isNext ? c.herotext : p.isPrayer ? c.tp : c.tm;
  const timeColor = isNext ? c.herotext : p.isPrayer ? c.ts : c.tm;
  const weight = isNext ? 'bold' : p.isPrayer ? 'semi' : 'medium';
  const adhan = formatTime12(p.at);

  const press = () => {
    if (!onPress) return;
    const node = box.current;
    if (!node) {
      onPress(p.key, { x: 0, y: -1, w: 0, h: 0 });
      return;
    }
    node.measureInWindow((x, y, w, h) => onPress(p.key, { x, y, w, h }));
  };

  return (
    // The measured wrapper: `collapsable={false}` keeps it a real native view on Android.
    <View ref={box} collapsable={false}>
      <PressScale
        accessibilityRole="button"
        accessibilityLabel={`${p.name} ${adhan}`}
        accessibilityHint="يفتح صفحة السنن"
        onPress={press}
        pressedScale={0.98}
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
          !p.isPrayer && !isNext && { opacity: 0.65 },
        ]}
      >
        <View style={styles.nameWrap}>
          <View style={[styles.dot, { backgroundColor: c.accent, opacity: isNext ? 1 : 0 }]} />
          <Text size={16} weight={weight} color={nameColor}>
            {p.name}
          </Text>
        </View>
        <Text size={14.5} weight={weight} color={timeColor} style={styles.time}>
          {adhan}
        </Text>
      </PressScale>
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
