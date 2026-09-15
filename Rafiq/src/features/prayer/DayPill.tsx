import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOutUp, LinearTransition } from 'react-native-reanimated';
import { dayMonthString, weekdayName } from '@/shared/lib/gregorian';
import { useMotion } from '@/shared/lib/motion';
import { radius } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { PressScale } from '@/shared/ui/PressScale';
import { Text } from '@/shared/ui/Text';

/** Vertical room the list gives the pill while one is showing. */
export const PILL_SLOT = 44;

interface DayPillProps {
  /** Day being browsed; null when the list shows today. */
  date: Date | null;
  /** Show the one-time "swipe to browse" hint instead (ignored while `date` is set). */
  hint: boolean;
  onToday: () => void;
}

/**
 * Transient pill floating over the top of the prayer list. Nothing on today;
 * after a swipe it names the browsed day and offers the way back.
 */
export function DayPill({ date, hint, onToday }: DayPillProps) {
  const { c } = useTheme();
  const { reduced } = useMotion();
  const entering = reduced ? undefined : FadeInDown.duration(220);
  const exiting = reduced ? undefined : FadeOutUp.duration(160);
  const layout = reduced ? undefined : LinearTransition.duration(200);
  const pill = [
    styles.pill,
    { backgroundColor: c.surface, borderColor: c.border, boxShadow: `0 6px 18px ${c.shadow}` },
  ];

  return (
    <View pointerEvents="box-none" style={styles.slot}>
      {date ? (
        <Animated.View key="day" entering={entering} exiting={exiting} layout={layout}>
          <PressScale
            accessibilityRole="button"
            accessibilityLabel="العودة إلى اليوم"
            onPress={onToday}
            pressedScale={0.95}
            haptic="tap"
            style={pill}
          >
            <Animated.View
              key={date.toDateString()}
              entering={reduced ? undefined : FadeIn.duration(160)}
              style={styles.row}
            >
              <Text size={12.5} weight="semi">
                {weekdayName(date)} {dayMonthString(date)}
              </Text>
              <Text size={12.5} color={c.tm}>
                {' · '}
              </Text>
              <Text size={12.5} weight="bold" color={c.accent}>
                اليوم
              </Text>
            </Animated.View>
          </PressScale>
        </Animated.View>
      ) : hint ? (
        <Animated.View key="hint" entering={entering} exiting={exiting} style={pill}>
          <Text size={12.5} weight="medium" color={c.tm}>
            اسحب لتصفّح الأيام
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { position: 'absolute', top: 10, start: 0, end: 0, alignItems: 'center', zIndex: 2 },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
});
