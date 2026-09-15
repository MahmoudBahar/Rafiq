import { StyleSheet, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { dayMonthString, weekdayName } from '@/shared/lib/gregorian';
import { hijriString } from '@/shared/lib/hijri';
import { useMotion } from '@/shared/lib/motion';
import { radius } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { CalendarIcon, ChevronBackIcon, ChevronForwardIcon } from '@/shared/ui/Icons';
import { PressScale } from '@/shared/ui/PressScale';
import { Text } from '@/shared/ui/Text';

interface DateBarProps {
  date: Date;
  isToday: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onOpenMonth: () => void;
}

/** Day navigation above the prayer list: prev / date label / next, plus a "today" pill when browsing. */
export function DateBar({ date, isToday, onPrev, onNext, onToday, onOpenMonth }: DateBarProps) {
  const { c } = useTheme();
  const m = useMotion();
  const layout = m.reduced ? undefined : LinearTransition.duration(220);

  return (
    <Animated.View layout={layout} style={styles.wrap}>
      <View style={styles.row}>
        <PressScale
          accessibilityRole="button"
          accessibilityLabel="اليوم السابق"
          onPress={onPrev}
          pressedScale={0.92}
          style={[styles.chevron, { backgroundColor: c.surface, borderColor: c.border }]}
        >
          <ChevronBackIcon size={15} color={c.tp} />
        </PressScale>

        <PressScale
          accessibilityRole="button"
          accessibilityLabel="عرض جدول الشهر"
          onPress={onOpenMonth}
          pressedScale={0.98}
          style={styles.center}
        >
          <View style={styles.labelRow}>
            <CalendarIcon size={13} color={c.tm} />
            <Text size={13.5} weight="semi">
              {weekdayName(date)} {dayMonthString(date)}
            </Text>
          </View>
          <Text size={11} color={c.tm}>
            {hijriString(date)}
          </Text>
        </PressScale>

        <PressScale
          accessibilityRole="button"
          accessibilityLabel="اليوم التالي"
          onPress={onNext}
          pressedScale={0.92}
          style={[styles.chevron, { backgroundColor: c.surface, borderColor: c.border }]}
        >
          <ChevronForwardIcon size={15} color={c.tp} />
        </PressScale>
      </View>

      {!isToday ? (
        <Animated.View entering={m.fadeInDown(0, 200)} exiting={m.fadeOut(140)} style={styles.pillRow}>
          <PressScale
            accessibilityRole="button"
            accessibilityLabel="العودة إلى اليوم"
            onPress={onToday}
            pressedScale={0.94}
            style={[styles.pill, { backgroundColor: c.accent }]}
          >
            <Text size={12} weight="bold" color="#ffffff">
              اليوم
            </Text>
          </PressScale>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  chevron: {
    width: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { flex: 1, alignItems: 'center', gap: 1 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pillRow: { alignItems: 'center' },
  pill: { paddingVertical: 6, paddingHorizontal: 18, borderRadius: radius.pill },
});
