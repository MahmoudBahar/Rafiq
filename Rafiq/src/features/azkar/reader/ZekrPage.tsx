import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { LinearTransition, type SharedValue } from 'react-native-reanimated';
import { toArabicIndic } from '@/shared/lib/arabic';
import { useMotion } from '@/shared/lib/motion';
import { radius } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { Display, Text } from '@/shared/ui/Text';
import type { Zekr } from '../data';
import { stageAt, stagesOf, type StagePos } from '../engine/stages';
import { BeadStrand, roundAt, roundsOf } from './BeadStrand';
import { QuranText, READER_LINE_HEIGHT, READER_TEXT_SIZE } from './QuranText';

interface ZekrPageProps {
  zekr: Zekr;
  /** This page's index, and the page the live count belongs to. */
  page: number;
  owner: SharedValue<number>;
  count: SharedValue<number>;
  /** Start of the stage the strand is threaded for, on the page in view. */
  offset: SharedValue<number>;
  glow: SharedValue<number>;
  /** Repetitions saved for this zekr, over all its stages. */
  said: number;
  /** The stage the page in view is on; other pages derive theirs from `said`. */
  stage: StagePos | null;
  /** Width available to the strand. */
  width: number;
  showVirtue: boolean;
}

/**
 * One zekr: its text, and beneath it its own tasbih strand and counter, so the
 * whole page turns as one. The text is set at the one reader size and is never
 * truncated or shrunk: it is centred when it fits and scrolls when it does not
 * (the longest passage, آل عمران ١٩٠–٢٠٠, runs past eighteen hundred characters).
 *
 * A compound entry (سبحان الله ×33، والحمد لله ×33، والله أكبر ×34) is one
 * page too: its phrases are set as runs, the one being counted in the accent,
 * and the strand is threaded for that phrase's count alone.
 */
export function ZekrPage({ zekr, page, owner, count, offset, glow, said, stage: liveStage, width, showVirtue }: ZekrPageProps) {
  const { c } = useTheme();
  const m = useMotion();
  const stages = stagesOf(zekr);
  const stage = liveStage ?? stageAt(zekr, said);
  const staged = stages.length > 1;
  const total = stage.size;
  // The count within the stage follows the live count; the stage itself holds still until it re-threads.
  const saidInStage = Math.max(0, Math.min(total, said - stage.start));
  const rounds = roundsOf(total);
  const glide = m.reduced ? undefined : LinearTransition.duration(240);
  const stageTone = (i: number) => (i < stage.index ? c.tm : i === stage.index ? c.accent : c.ts);
  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* The page is centred, so the virtue box opening or closing moves the text: let it glide. Keyed by
            the zekr: the pager re-slots a column with the next zekr, and the glide must not carry the old
            text's place over to the new one. */}
        <Animated.View key={zekr.id} layout={glide} style={styles.text}>
          {staged ? (
            <Display size={READER_TEXT_SIZE} lineHeight={READER_LINE_HEIGHT} align="center" style={styles.wide}>
              {stages.map((s, i) => (
                <Display key={i} size={READER_TEXT_SIZE} lineHeight={READER_LINE_HEIGHT} color={stageTone(i)}>
                  {i > 0 ? '، ' : ''}
                  {s.text}
                </Display>
              ))}
            </Display>
          ) : zekr.kind === 'quran' ? (
            <QuranText text={zekr.text} />
          ) : (
            <Display size={READER_TEXT_SIZE} lineHeight={READER_LINE_HEIGHT} align="center" style={styles.wide}>
              {zekr.text}
            </Display>
          )}
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
        {/* Keyed by the zekr: a re-slotted column must not inherit another zekr's bead positions. */}
        <BeadStrand key={zekr.id} width={width} total={total} page={page} owner={owner} count={count} offset={offset} said={saidInStage} glow={glow} />
        <Text size={17} weight="bold" align="center" style={styles.count}>
          {`${toArabicIndic(saidInStage)} من ${toArabicIndic(total)}`}
          {staged ? (
            <Text size={11.5} weight="medium" color={c.tm}>
              {`  ·  المرحلة ${toArabicIndic(stage.index + 1)} من ${toArabicIndic(stages.length)}`}
            </Text>
          ) : null}
        </Text>
        <Text size={11.5} color={c.tm} align="center" style={styles.count}>
          {rounds > 1
            ? `الجولة ${toArabicIndic(roundAt(saidInStage, total))} من ${toArabicIndic(rounds)} · اضغط في أي مكان للعدّ`
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
