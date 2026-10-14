import { ScrollView, StyleSheet, View } from 'react-native';
import { radius } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { PressScale } from '@/shared/ui/PressScale';
import { Display, Text } from '@/shared/ui/Text';
import type { Zekr } from '../data';
import { QuranText, READER_TEXT_SIZE } from './QuranText';

interface SurahPageProps {
  zekr: Zekr;
  done: boolean;
  onDone: () => void;
}

/**
 * An entry that is a reading rather than a repetition (سورة السجدة and سورة
 * الملك before sleep): the surahs in full, and a button at the end in place of
 * the strand. A tap on the page does not count here.
 */
export function SurahPage({ zekr, done, onDone }: SurahPageProps) {
  const { c } = useTheme();
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {(zekr.surahs ?? []).map((s) => (
        <View key={s.name} style={styles.surah}>
          <Display size={READER_TEXT_SIZE} color={c.tm} align="center" style={styles.wide}>
            {s.name}
          </Display>
          <QuranText text={s.text} />
        </View>
      ))}
      <View style={styles.actions}>
        <PressScale
          accessibilityRole="button"
          accessibilityState={{ disabled: done }}
          disabled={done}
          pressedScale={0.96}
          onPress={onDone}
          style={[styles.button, done ? { borderWidth: 1, borderColor: c.selbr } : { backgroundColor: c.accent }]}
        >
          <Text size={14.5} weight="bold" color={done ? c.tm : '#ffffff'} align="center">
            {done ? 'تمّت القراءة' : 'أتممتُ القراءة'}
          </Text>
        </PressScale>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 18, paddingTop: 8, paddingBottom: 72 },
  wide: { alignSelf: 'stretch' },
  surah: { gap: 10 },
  actions: { alignItems: 'center', paddingTop: 6 },
  button: { minWidth: 200, paddingVertical: 13, paddingHorizontal: 32, borderRadius: radius.pill },
});
