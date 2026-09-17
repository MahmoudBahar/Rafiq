import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useMotion } from '@/shared/lib/motion';
import { radius } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { Text } from '@/shared/ui/Text';
import { RAWATIB_GROUPS, RAWATIB_TOTAL } from '../sunnah';
import { Beads, type BeadLook } from './Beads';

interface RawatibStripProps {
  /** Indices (0–11) lit for this prayer. */
  lit: number[];
  delay: number;
}

/** The twelve daily rawatib as one strip, with this prayer's share lit. */
export function RawatibStrip({ lit, delay }: RawatibStripProps) {
  const { c } = useTheme();
  const m = useMotion();
  const set = new Set(lit);
  const looks: BeadLook[] = Array.from({ length: RAWATIB_TOTAL }, (_, i) => (set.has(i) ? 'solid' : 'faint'));
  // Groups of uneven size: lay them out by hand from the group sizes.
  const groups: BeadLook[][] = [];
  let at = 0;
  for (const n of RAWATIB_GROUPS) {
    groups.push(looks.slice(at, at + n));
    at += n;
  }
  let index = 0;
  return (
    <Animated.View entering={m.fadeInUp(delay, 420)} style={[styles.strip, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Text size={11.5} weight="semi" color={c.tm}>
        الرواتب · ثنتا عشرة ركعة في اليوم والليلة
      </Text>
      <View style={styles.groups}>
        {groups.map((g, gi) => {
          const d = delay + 200 + index * 40;
          index += g.length;
          return <Beads key={gi} looks={g} perGroup={0} color={c.accent} faintColor={c.border} delay={d} size={9} />;
        })}
      </View>
      <Text size={11} color={c.tm}>
        {lit.length === 0 ? 'لا راتبة لهذه الصلاة' : `نصيب هذه الصلاة ${lit.length === 2 ? 'ركعتان' : 'ست ركعات'}`}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  strip: { borderWidth: 1, borderRadius: radius.lg, paddingVertical: 13, paddingHorizontal: 16, gap: 8 },
  groups: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
});
