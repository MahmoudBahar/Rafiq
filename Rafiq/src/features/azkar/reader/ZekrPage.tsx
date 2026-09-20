import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { toArabicIndic } from '@/shared/lib/arabic';
import { useMotion } from '@/shared/lib/motion';
import { radius } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { Display, Text } from '@/shared/ui/Text';
import type { Zekr } from '../data';

/** Short azkar are set large; a long passage steps down so less of it needs scrolling. */
const sizeFor = (length: number) => (length <= 120 ? 30 : length <= 300 ? 26 : 23);

interface ZekrPageProps {
  zekr: Zekr;
  showVirtue: boolean;
}

/**
 * One zekr. The text is never truncated: it is centred when it fits and
 * scrolls when it does not (the longest passage runs to seven hundred
 * characters).
 */
export function ZekrPage({ zekr, showVirtue }: ZekrPageProps) {
  const { c } = useTheme();
  const m = useMotion();
  const size = sizeFor(zekr.text.length);
  const glide = m.reduced ? undefined : LinearTransition.duration(240);
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* The page is centred, so the virtue box opening or closing moves the text: let it glide. */}
      <Animated.View layout={glide} style={styles.text}>
        <Display size={size} lineHeight={Math.round(size * 1.85)} align="center" style={styles.wide}>
          {zekr.text}
        </Display>
        {zekr.reference ? (
          <Text size={12} color={c.tm} align="center" style={styles.wide}>
            {toArabicIndic(zekr.reference)}
          </Text>
        ) : null}
      </Animated.View>
      {showVirtue && zekr.virtue ? (
        <Animated.View entering={m.fadeInDown(60, 240)} exiting={m.fadeOut(160)} layout={glide} style={[styles.virtue, { backgroundColor: c.selbg, borderColor: c.selbr }]}>
          <Text size={11.5} weight="semi" color={c.tm}>
            الفضل
          </Text>
          <Text size={13.5} color={c.ts} lineHeight={24}>
            {toArabicIndic(zekr.virtue)}
          </Text>
        </Animated.View>
      ) : null}
      <View style={styles.foot} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', gap: 14, paddingTop: 8 },
  text: { alignSelf: 'stretch', gap: 14 },
  wide: { alignSelf: 'stretch' },
  virtue: { alignSelf: 'stretch', gap: 4, borderWidth: 1, borderRadius: radius.lg, paddingVertical: 12, paddingHorizontal: 16 },
  foot: { height: 8 },
});
