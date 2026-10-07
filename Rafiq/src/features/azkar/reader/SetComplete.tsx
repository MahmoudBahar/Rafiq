import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { toArabicIndic } from '@/shared/lib/arabic';
import { useMotion } from '@/shared/lib/motion';
import { radius } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { PressScale } from '@/shared/ui/PressScale';
import { Display, Text } from '@/shared/ui/Text';

interface SetCompleteProps {
  /** What was completed, as it reads after «أتممت». */
  title: string;
  done: number;
  total: number;
  onBack: () => void;
  /** Jump to the first zekr that was skipped. */
  onResume: () => void;
}

/** The page after the last zekr: a closing line, and a way back to anything skipped. */
export function SetComplete({ title, done, total, onBack, onResume }: SetCompleteProps) {
  const { c } = useTheme();
  const m = useMotion();
  const complete = done >= total;
  return (
    <View style={styles.page}>
      <Animated.View entering={m.fadeInUp(80)} style={styles.block}>
        <Display size={34} align="center" style={styles.wide}>
          {complete ? 'تقبّل اللّٰه منك' : 'بلغت آخر الأذكار'}
        </Display>
        <Text size={14} color={c.ts} align="center" style={styles.wide}>
          {complete
            ? `أتممت ${title}`
            : `أتممت ${toArabicIndic(done)} من ${toArabicIndic(total)}، وبقي ما تخطّيته`}
        </Text>
      </Animated.View>
      <Animated.View entering={m.fadeInUp(200)} style={styles.actions}>
        {complete ? null : (
          <PressScale
            accessibilityRole="button"
            pressedScale={0.96}
            onPress={onResume}
            style={[styles.button, { backgroundColor: c.accent }]}
          >
            <Text size={14.5} weight="bold" color="#ffffff" align="center">
              أكمل ما فاتك
            </Text>
          </PressScale>
        )}
        <PressScale
          accessibilityRole="button"
          pressedScale={0.96}
          onPress={onBack}
          style={[styles.button, complete ? { backgroundColor: c.accent } : { borderWidth: 1, borderColor: c.selbr }]}
        >
          <Text size={14.5} weight="bold" color={complete ? '#ffffff' : c.tp} align="center">
            العودة
          </Text>
        </PressScale>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'center', gap: 28 },
  block: { gap: 8 },
  wide: { alignSelf: 'stretch' },
  actions: { alignItems: 'center', gap: 10 },
  button: { minWidth: 200, paddingVertical: 13, paddingHorizontal: 32, borderRadius: radius.pill },
});
