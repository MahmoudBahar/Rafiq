import { StyleSheet, View } from 'react-native';
import { toArabicIndic } from '@/shared/lib/arabic';
import { useTheme } from '@/shared/theme/useTheme';
import { Text } from '@/shared/ui/Text';
import type { Qibla } from '../useQibla';

interface TurnHintProps {
  qibla: Qibla;
}

/** What to do next, in one line, and the bearing under it. */
export function TurnHint({ qibla }: TurnHintProps) {
  const { c } = useTheme();
  const { band, turnDeg, turnRight, confidence, raised, bearing } = qibla;
  const locked = band === 'locked' && confidence === 'good';
  const line = (() => {
    if (confidence === 'no-location') return 'حدّد موقعك أولًا';
    if (confidence === 'unavailable') return 'لا توجد بوصلة في هذا الجهاز';
    if (raised) return 'ضع الهاتف مستويًا';
    if (confidence === 'calibrate') return 'المعايرة مطلوبة أولًا';
    if (confidence === 'interference') return 'الاتجاه غير موثوق الآن';
    if (band === 'locked') return 'أنت في اتجاه القبلة';
    return `أدر ${turnRight ? 'يمينًا' : 'يسارًا'} ${toArabicIndic(turnDeg)}°`;
  })();
  const sub = bearing === null ? null : `${toArabicIndic(Math.round(bearing))}° من الشمال`;
  return (
    <View style={styles.wrap}>
      <Text size={16} weight="semi" color={locked ? c.accent : c.tp} align="center" numberOfLines={1} style={styles.wide}>
        {line}
      </Text>
      {sub ? (
        <Text size={11.5} color={c.tm} align="center" numberOfLines={1} style={styles.wide}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 2, paddingHorizontal: 24 },
  wide: { alignSelf: 'stretch' },
});
