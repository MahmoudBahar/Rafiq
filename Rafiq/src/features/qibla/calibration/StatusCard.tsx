import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useMotion } from '@/shared/lib/motion';
import { radius } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { Button } from '@/shared/ui/Button';
import { Text } from '@/shared/ui/Text';
import type { Confidence } from '../engine';

interface StatusCardProps {
  confidence: Confidence;
  locating: boolean;
  onLocate: () => void;
  onChooseCity: () => void;
}

/** The card on the ground band for a state that needs the user's hand; null when the compass is fine. */
export function StatusCard({ confidence, locating, onLocate, onChooseCity }: StatusCardProps) {
  const { c } = useTheme();
  const body = (() => {
    switch (confidence) {
      case 'calibrate':
        return { title: 'تحتاج البوصلة إلى معايرة', text: 'حرّك الهاتف على شكل ٨ في الهواء عدة مرات', figure: true };
      case 'interference':
        return { title: 'هناك ما يشوّش على البوصلة', text: 'ابتعد عن المعادن أو المغناطيس، كالغطاء المغناطيسي أو السماعات' };
      case 'no-location':
        return { title: 'حدّد موقعك لمعرفة اتجاه القبلة', text: null, actions: true };
      case 'unavailable':
        return { title: 'لا يملك هذا الجهاز بوصلة', text: 'الاتجاه بالدرجات من الشمال معروض تحت السجادة' };
      default:
        return null;
    }
  })();
  if (!body) return null;
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Text size={13.5} weight="semi" align="center" style={styles.wide}>
        {body.title}
      </Text>
      {body.text ? (
        <Text size={12.5} color={c.ts} align="center" style={styles.wide}>
          {body.text}
        </Text>
      ) : null}
      {body.figure ? <FigureEight /> : null}
      {body.actions ? (
        <View style={styles.actions}>
          <Button label={locating ? 'جارٍ التحديد…' : 'تحديد موقعي'} onPress={onLocate} disabled={locating} style={styles.action} />
          <Button label="اختيار المدينة" variant="secondary" onPress={onChooseCity} style={styles.action} />
        </View>
      ) : null}
    </View>
  );
}

const EIGHT_W = 96;
const EIGHT_H = 44;
const LOOP_MS = 2400;

/** A dot running a figure of eight: the calibration gesture, shown rather than described. */
function FigureEight() {
  const { c } = useTheme();
  const { reduced } = useMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    t.set(withRepeat(withTiming(1, { duration: LOOP_MS, easing: Easing.linear }), -1));
    return () => t.set(0);
  }, [t, reduced]);
  const dot = useAnimatedStyle(() => {
    // Lemniscate of Bernoulli, scaled into the box.
    const u = t.get() * 2 * Math.PI;
    const den = 1 + Math.sin(u) ** 2;
    const x = (EIGHT_W / 2 - 6) * (Math.cos(u) / den);
    const y = (EIGHT_H / 2 - 6) * ((Math.sin(u) * Math.cos(u)) / den) * 2;
    return { transform: [{ translateX: x }, { translateY: y }] };
  });
  return (
    <View style={styles.eight}>
      <Svg width={EIGHT_W} height={EIGHT_H} viewBox={`0 0 ${EIGHT_W} ${EIGHT_H}`}>
        <Path
          d={`M${EIGHT_W / 2} ${EIGHT_H / 2} C ${EIGHT_W * 0.36} 0, 4 0, 4 ${EIGHT_H / 2} S ${EIGHT_W * 0.36} ${EIGHT_H}, ${EIGHT_W / 2} ${EIGHT_H / 2} S ${EIGHT_W - 4} 0, ${EIGHT_W - 4} ${EIGHT_H / 2} S ${EIGHT_W * 0.64} ${EIGHT_H}, ${EIGHT_W / 2} ${EIGHT_H / 2}`}
          fill="none"
          stroke={c.selbr}
          strokeWidth="2"
        />
      </Svg>
      <Animated.View style={[styles.dot, { backgroundColor: c.accent }, dot]} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.lg, paddingVertical: 12, paddingHorizontal: 14, gap: 4 },
  wide: { alignSelf: 'stretch' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  action: { flex: 1, paddingVertical: 11 },
  eight: { alignSelf: 'center', width: EIGHT_W, height: EIGHT_H, marginTop: 4, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', width: 10, height: 10, borderRadius: 5 },
});
