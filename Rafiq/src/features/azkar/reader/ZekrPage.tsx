import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { LinearTransition, type SharedValue } from 'react-native-reanimated';
import { toArabicIndic } from '@/shared/lib/arabic';
import { useMotion } from '@/shared/lib/motion';
import { radius } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { Display, Text } from '@/shared/ui/Text';
import type { Zekr } from '../data';
import { BeadStrand, roundAt, roundsOf } from './BeadStrand';

/** Short azkar are set large; a long passage steps down so less of it needs scrolling. */
const sizeFor = (length: number) => (length <= 120 ? 30 : length <= 300 ? 26 : 23);

interface ZekrPageProps {
  zekr: Zekr;
  /** This page's index, and the page the live count belongs to. */
  page: number;
  owner: SharedValue<number>;
  count: SharedValue<number>;
  glow: SharedValue<number>;
  /** Repetitions saved for this zekr. */
  said: number;
  /** Width available to the strand. */
  width: number;
  showVirtue: boolean;
}

/**
 * One zekr: its text, and beneath it its own tasbih strand and counter, so the
 * whole page turns as one. The text is never truncated: it is centred when it
 * fits and scrolls when it does not (the longest passage runs to seven hundred
 * characters).
 */
export function ZekrPage({ zekr, page, owner, count, glow, said, width, showVirtue }: ZekrPageProps) {
  const { c } = useTheme();
  const m = useMotion();
  const size = sizeFor(zekr.text.length);
  const total = zekr.count;
  const rounds = roundsOf(total);
  const glide = m.reduced ? undefined : LinearTransition.duration(240);
  return (
    <View style={styles.page}>
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
      <View style={styles.counter}>
        <BeadStrand width={width} total={total} page={page} owner={owner} count={count} said={said} glow={glow} />
        <Text size={17} weight="bold" align="center" style={styles.count}>
          {`${toArabicIndic(said)} من ${toArabicIndic(total)}`}
        </Text>
        <Text size={11.5} color={c.tm} align="center" style={styles.count}>
          {rounds > 1
            ? `الجولة ${toArabicIndic(roundAt(said, total))} من ${toArabicIndic(rounds)} · اضغط في أي مكان للعدّ`
            : 'اضغط في أي مكان للعدّ'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  counter: { gap: 2 },
  count: { alignSelf: 'stretch', fontVariant: ['tabular-nums'] },
  content: { flexGrow: 1, justifyContent: 'center', gap: 14, paddingTop: 8 },
  text: { alignSelf: 'stretch', gap: 14 },
  wide: { alignSelf: 'stretch' },
  virtue: { alignSelf: 'stretch', gap: 4, borderWidth: 1, borderRadius: radius.lg, paddingVertical: 12, paddingHorizontal: 16 },
  foot: { height: 8 },
});
