import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { AZKAR_SETS, isAzkarSetId, itemsForPrayer, type AzkarSetId, type Zekr } from '@/features/azkar/data';
import { stageAt, stageEnds, type StagePos } from '@/features/azkar/engine/stages';
import { prayerSessionKey } from '@/features/azkar/engine/window';
import { countsOf, firstIncompleteOf, flushAzkarProgress, useAzkarProgress } from '@/features/azkar/progress';
import { PrayerChips } from '@/features/azkar/reader/PrayerChips';
import { SetComplete } from '@/features/azkar/reader/SetComplete';
import { StoryProgress } from '@/features/azkar/reader/StoryProgress';
import { SurahPage } from '@/features/azkar/reader/SurahPage';
import { ZekrPage } from '@/features/azkar/reader/ZekrPage';
import { useAzkarClock, type AzkarClock } from '@/features/azkar/time';
import { DayCarousel } from '@/features/prayer/DayCarousel';
import { FARD_PRAYERS } from '@/features/prayer/engine';
import { COL_PAD, useDayCarousel } from '@/features/prayer/useDayCarousel';
import { isFardKey, type FardKey } from '@/shared/lib/adjustments';
import { toArabicIndic } from '@/shared/lib/arabic';
import { bead, detent, success } from '@/shared/lib/haptics';
import { useMotion } from '@/shared/lib/motion';
import { usePreventBack } from '@/shared/lib/usePreventBack';
import { dialSky, radius, readerSky, type Sky } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { GradientBackground } from '@/shared/ui/GradientBackground';
import { ChevronBackIcon } from '@/shared/ui/Icons';
import { Display, Text } from '@/shared/ui/Text';

const BAND_H = 104;
/** The prayer chips add a row to the band. */
const CHIPS_H = 44;
const EXIT_MS = 300;
const RISE = { damping: 18, stiffness: 170, mass: 0.9 };
/** Sheet offset when the page was not opened from the dial (a deep link). */
const FALLBACK_RISE = 40;
const ADVANCE_MS = 650;
const ADVANCE_REDUCED_MS = 250;
/** A stage of a compound entry done: the strand rests before it re-threads for the next phrase. */
const RETHREAD_MS = 520;
const RETHREAD_REDUCED_MS = 120;

interface Page {
  zekr: Zekr;
  /** The entry's position in its set: what the saved counts are keyed by. */
  index: number;
}

const skyOf = (set: AzkarSetId, prayer: FardKey): Sky => (set === 'prayer' ? readerSky.prayer[prayer] : readerSky[set]);

/** The session a reader is filed under: the azkar day, the calendar day for waking, or one prayer of the day. */
function sessionKeyOf(set: AzkarSetId, prayer: FardKey, clock: AzkarClock): string {
  if (set === 'prayer') return prayerSessionKey(clock.dayKey, prayer);
  if (set === 'waking') return clock.wakingKey;
  return clock.dayKey;
}

function pagesOf(set: AzkarSetId, prayer: FardKey): Page[] {
  if (set === 'prayer') return itemsForPrayer(prayer).map((p) => ({ zekr: p.zekr, index: p.index }));
  return AZKAR_SETS[set].items.map((zekr, index) => ({ zekr, index }));
}

/**
 * The azkar reader. It opens over the dial as a transparent page whose sky is
 * the hour's own, and whose sheet starts exactly on the dial's ground and
 * rises: the ground comes up to become the page. Leaving plays it backwards.
 *
 * One zekr per page. A tap anywhere on the sheet counts a repetition (the
 * count lives on the UI thread, so the bead moves with the finger and React
 * hears about it afterwards); a vertical drag scrolls a long text; a
 * horizontal one turns the page. The after-prayer set is read for one prayer
 * at a time, chosen in the band; a compound entry counts stage by stage on one
 * page; a surah entry is read and marked done by its button.
 */
export default function AzkarReaderScreen() {
  const params = useLocalSearchParams<{ set?: string; ground?: string; prayer?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { c } = useTheme();
  const { reduced } = useMotion();

  const valid = isAzkarSetId(params.set);
  const setId: AzkarSetId = isAzkarSetId(params.set) ? params.set : 'morning';
  const clock = useAzkarClock();
  const [prayer, setPrayer] = useState<FardKey>(() => (isFardKey(params.prayer ?? '') ? (params.prayer as FardKey) : clock.latest.key));
  const title = AZKAR_SETS[setId].title;
  const sky = skyOf(setId, prayer);
  const pages = useMemo(() => pagesOf(setId, prayer), [setId, prayer]);
  const indices = useMemo(() => pages.map((p) => p.index), [pages]);
  const n = pages.length;
  const sessionKey = sessionKeyOf(setId, prayer, clock);
  const progress = useAzkarProgress(setId, sessionKey, indices);
  const { counts, setCount } = progress;
  const pageCounts = useMemo(() => pages.map((p) => counts[p.index] ?? 0), [pages, counts]);

  // Page `n` is the closing page. The reader opens on the first zekr still owed.
  const [index, setIndex] = useState(() => Math.min(progress.firstIncomplete, n));
  const [showVirtue, setShowVirtue] = useState(false);
  const page = index < n ? pages[index] : null;
  const zekr = page?.zekr ?? null;
  const said = page ? Math.min(counts[page.index] ?? 0, page.zekr.count) : 0;
  // A stage that has just completed is held for a pause before the next phrase is threaded: the
  // finished strand stays up, then the stage follows the count again.
  const [held, setHeld] = useState<{ page: number; stage: StagePos } | null>(null);
  const stage: StagePos | null = zekr ? (held && held.page === index ? held.stage : stageAt(zekr, said)) : null;

  // The page whose zekr has just been completed and is waiting out its glow before turning. It is
  // forgotten on every page turn: left standing, coming back to a finished zekr turned it away again.
  const [justDone, setJustDone] = useState<number | null>(null);
  const onCommit = useCallback((delta: number) => {
    setIndex((i) => i + delta);
    setShowVirtue(false);
    setJustDone(null);
    setHeld(null);
  }, []);
  const bounds = useMemo(() => ({ min: 0, max: n }), [n]);
  const pager = useDayCarousel(index, onCommit, bounds);

  // Counting state for the page in view, on the UI thread.
  const count = useSharedValue(said);
  // The page `count` speaks for. Each page's strand follows `count` only while it is that page.
  const owner = useSharedValue(index);
  const target = useSharedValue(zekr?.count ?? 0);
  // The current stage of a compound entry: where its strand starts counting, and where it ends.
  const offset = useSharedValue(0);
  const stageEnd = useSharedValue(zekr?.count ?? 0);
  const locked = useSharedValue(false);
  const glow = useSharedValue(0);
  useEffect(() => {
    const z = index < n ? pages[index].zekr : null;
    const s = z ? stageAt(z, said) : null;
    count.set(said);
    owner.set(index);
    target.set(z?.count ?? 0);
    offset.set(s?.start ?? 0);
    stageEnd.set(s ? s.start + s.size : 0);
    // A surah page is read, not tapped; its button completes it.
    locked.set(z?.kind === 'surahs');
    // Seeded when the page or the session changes only: between taps the UI thread is ahead of React.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, sessionKey]);

  useEffect(() => flushAzkarProgress, []);

  // A zekr just completed on this page: hold for the glow, then turn the page.
  const { go } = pager;
  useEffect(() => {
    if (justDone === null || justDone !== index) return;
    const timer = setTimeout(() => go(1), reduced ? ADVANCE_REDUCED_MS : ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [justDone, index, go, reduced]);

  const finish = useCallback(
    (i: number) => {
      success();
      flushAzkarProgress();
      if (!reduced) glow.set(withSequence(withTiming(1, { duration: 180 }), withTiming(0, { duration: 340 })));
      setJustDone(i);
    },
    [glow, reduced],
  );

  /** A tap landed: `next` is the entry's new cumulative count. */
  const onCount = useCallback(
    (i: number, itemIndex: number, next: number, done: boolean, stageDone: boolean) => {
      setCount(itemIndex, next);
      if (done) {
        finish(i);
        return;
      }
      if (!stageDone) {
        bead();
        return;
      }
      // A phrase of a compound entry is complete: let its full strand rest, then thread the next.
      detent();
      flushAzkarProgress();
      const z = pages[i].zekr;
      const ends = stageEnds(z);
      const s = stageAt(z, next);
      setHeld({ page: i, stage: stageAt(z, next - 1) });
      setTimeout(
        () => {
          // The page may have been turned meanwhile; its own seeding then owns these values.
          if (owner.get() !== i) return;
          offset.set(s.start);
          stageEnd.set(ends[s.index]);
          setHeld(null);
          locked.set(false);
        },
        reduced ? RETHREAD_REDUCED_MS : RETHREAD_MS,
      );
    },
    [finish, locked, offset, owner, pages, reduced, setCount, stageEnd],
  );

  const itemIndex = page?.index ?? -1;
  const tap = useMemo(
    () =>
      Gesture.Tap()
        .maxDistance(12)
        .maxDuration(280)
        .onEnd((_e, ok) => {
          if (!ok || locked.get()) return;
          const next = count.get() + 1;
          if (next > target.get()) return;
          count.set(next);
          const done = next === target.get();
          const stageDone = next === stageEnd.get();
          if (done || stageDone) locked.set(true);
          scheduleOnRN(onCount, index, itemIndex, next, done, stageDone);
        }),
    [count, index, itemIndex, locked, onCount, stageEnd, target],
  );
  // TalkBack and VoiceOver activate through this instead of the gesture.
  const countFromA11y = () => {
    if (!zekr || zekr.kind === 'surahs' || said >= zekr.count || locked.get()) return;
    const next = said + 1;
    const stageDone = next === stageEnd.get();
    if (next === zekr.count || stageDone) locked.set(true);
    count.set(next);
    onCount(index, itemIndex, next, next === zekr.count, stageDone);
  };
  const readSurah = () => {
    if (!zekr || said >= zekr.count) return;
    count.set(zekr.count);
    locked.set(true);
    onCount(index, itemIndex, zekr.count, true, false);
  };

  // Another prayer's session: its own counts, opening on its first zekr still owed.
  const choosePrayer = (k: FardKey) => {
    if (k === prayer) return;
    const key = prayerSessionKey(clock.dayKey, k);
    const next = pagesOf('prayer', k);
    const first = firstIncompleteOf('prayer', key, next.map((p) => p.index));
    // Seed the UI thread now: the new page renders before the effect runs, and its strand would
    // show the old session's count for that frame.
    const z = first < next.length ? next[first].zekr : null;
    const saidNext = z ? Math.min(countsOf('prayer', key)[next[first].index] ?? 0, z.count) : 0;
    const s = z ? stageAt(z, saidNext) : null;
    count.set(saidNext);
    owner.set(first);
    target.set(z?.count ?? 0);
    offset.set(s?.start ?? 0);
    stageEnd.set(s ? s.start + s.size : 0);
    locked.set(z?.kind === 'surahs');
    // The pager's columns are re-slotted for the new page on render, but its centre moves in its own
    // effect a frame later; until then the old centre slot would show a neighbouring page.
    pager.values.center.set(first);
    pager.values.tx.set(0);
    setPrayer(k);
    setShowVirtue(false);
    setJustDone(null);
    setHeld(null);
    setIndex(first);
  };

  // Enter: the sheet starts on the dial's ground and rises. Exit reverses it, then pops.
  const ground = Number(params.ground);
  const bandH = insets.top + BAND_H + (setId === 'prayer' ? CHIPS_H : 0);
  const rise = Number.isFinite(ground) && ground > bandH ? ground - bandH : FALLBACK_RISE;
  const sheetY = useSharedValue(reduced ? 0 : rise);
  const bodyOp = useSharedValue(reduced ? 1 : 0);
  const pageOp = useSharedValue(1);
  // The sky stays while the sheet drops into the dial, whose sky it matches. A set opened from the
  // drawer sits over the dimmed tab instead, and a light sky left standing there flashed white.
  const skyOp = useSharedValue(1);
  const overDrawer = setId !== 'morning' && setId !== 'evening';
  useEffect(() => {
    if (reduced) return;
    sheetY.set(withSpring(0, RISE));
    bodyOp.set(withDelay(140, withTiming(1, { duration: 260 })));
    // Runs once: the entrance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const leaving = useRef(false);
  const [returning, setReturning] = useState(false);
  const back = useCallback(() => router.back(), [router]);
  const exit = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    setReturning(true);
    flushAzkarProgress();
    if (reduced) {
      back();
      return;
    }
    bodyOp.set(withTiming(0, { duration: EXIT_MS * 0.6, easing: Easing.in(Easing.quad) }));
    if (overDrawer) skyOp.set(withTiming(0, { duration: EXIT_MS * 0.6, easing: Easing.in(Easing.quad) }));
    pageOp.set(withDelay(EXIT_MS * 0.5, withTiming(0, { duration: EXIT_MS * 0.5 })));
    sheetY.set(
      withTiming(rise, { duration: EXIT_MS, easing: Easing.out(Easing.cubic) }, (finished) => {
        'worklet';
        if (finished) scheduleOnRN(back);
      }),
    );
  }, [back, bodyOp, overDrawer, pageOp, reduced, rise, sheetY, skyOp]);
  usePreventBack(!returning, exit);

  useEffect(() => {
    if (!valid) router.back();
  }, [valid, router]);

  const pageStyle = useAnimatedStyle(() => ({ opacity: pageOp.get() }));
  const skyStyle = useAnimatedStyle(() => ({ opacity: skyOp.get() }));
  // The الفضل pill belongs to the page in view: as a swipe passes the middle of the slide it fades
  // towards the page coming in, which may or may not have a virtue to show.
  const virtueOn = useMemo(() => pages.map((p) => (p.zekr.virtue ? 1 : 0)), [pages]);
  const { center, tx, dir, width: pageW } = pager.values;
  const virtueStyle = useAnimatedStyle(() => {
    const at = center.get();
    const t = tx.get();
    const toward = t * dir > 0 ? 1 : -1;
    const cur = virtueOn[at] ?? 0;
    const next = virtueOn[at + toward] ?? 0;
    const slid = Math.min(1, Math.abs(t) / pageW);
    const f = Math.min(1, Math.max(0, (slid - 0.3) / 0.4));
    return { opacity: cur + (next - cur) * f };
  }, [virtueOn, center, tx, dir, pageW]);
  const bodyStyle = useAnimatedStyle(() => ({ opacity: bodyOp.get() }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: sheetY.get() }] }));

  if (!valid) return null;

  const position = index < n ? `${toArabicIndic(index + 1)} من ${toArabicIndic(n)}` : 'تمّت';
  const completedTitle =
    setId === 'prayer' ? `أذكار ما بعد ${FARD_PRAYERS.find((p) => p.key === prayer)?.name ?? ''}` : `${title} لهذا اليوم`;
  const a11yLabel = zekr ? `${zekr.text}. ${toArabicIndic(said)} من ${toArabicIndic(zekr.count)}. اضغط للعدّ` : undefined;

  return (
    <Animated.View style={[styles.screen, pageStyle]}>
      <StatusBar style={sky.dark ? 'light' : 'dark'} />
      <Animated.View style={[StyleSheet.absoluteFill, skyStyle]} pointerEvents="none">
        <GradientBackground colors={[sky.top, sky.bot]} />
      </Animated.View>

      <Animated.View style={[styles.band, { paddingTop: insets.top + 12, height: bandH }, bodyStyle]}>
        <View style={styles.bandRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="رجوع"
            onPress={exit}
            hitSlop={8}
            style={({ pressed }) => [styles.back, pressed && { transform: [{ scale: 1.06 }] }]}
          >
            <ChevronBackIcon size={16} color={sky.text} />
          </Pressable>
          <Display size={26} color={sky.text} style={styles.title}>
            {title}
          </Display>
          <Text size={12.5} weight="medium" color={sky.sub} style={styles.position}>
            {position}
          </Text>
        </View>
        {setId === 'prayer' ? <PrayerChips value={prayer} latest={clock.latest.key} sky={sky} onChange={choosePrayer} /> : null}
        <StoryProgress
          items={pages.map((p) => p.zekr)}
          counts={pageCounts}
          index={index}
          said={said}
          done={dialSky.dusk}
          track="rgba(128,128,128,0.32)"
        />
      </Animated.View>

      <Animated.View style={[styles.sheet, { top: bandH, backgroundColor: c.bg }, sheetStyle]}>
        <Animated.View style={[styles.fill, bodyStyle]}>
          <GestureDetector gesture={pager.gesture}>
            <View style={styles.fill}>
              <GestureDetector gesture={tap}>
                <View
                  style={[styles.fill, { paddingBottom: insets.bottom + 10 }]}
                  accessible={zekr !== null && zekr.kind !== 'surahs'}
                  accessibilityRole="button"
                  accessibilityLabel={a11yLabel}
                  accessibilityActions={[{ name: 'activate' }]}
                  onAccessibilityAction={countFromA11y}
                >
                  <View style={styles.pages}>
                    <DayCarousel
                      fill
                      offset={index}
                      values={pager.values}
                      renderDay={(i) =>
                        i < 0 || i > n ? null : i === n ? (
                          <SetComplete
                            title={completedTitle}
                            done={progress.done}
                            total={n}
                            onBack={exit}
                            onResume={() => go(progress.firstIncomplete - n)}
                          />
                        ) : pages[i].zekr.kind === 'surahs' ? (
                          <SurahPage zekr={pages[i].zekr} done={pageCounts[i] >= pages[i].zekr.count} onDone={readSurah} />
                        ) : (
                          <ZekrPage
                            zekr={pages[i].zekr}
                            page={i}
                            owner={owner}
                            count={count}
                            offset={offset}
                            glow={glow}
                            said={Math.min(pageCounts[i], pages[i].zekr.count)}
                            stage={i === index ? stage : null}
                            width={width - COL_PAD * 2}
                            showVirtue={showVirtue && i === index}
                          />
                        )
                      }
                    />
                  </View>
                </View>
              </GestureDetector>

              {/* Siblings of the counting surface, not children: pressing them never counts. */}
              {zekr ? (
                <View style={[styles.controls, { bottom: insets.bottom + 14 }]} pointerEvents="box-none">
                  {/* Pages advance to the left under RTL: each button sits on the side its page comes from. */}
                  <Pressable
                    accessibilityRole="button"
                    disabled={index === 0}
                    onPress={() => go(-1)}
                    hitSlop={10}
                    style={({ pressed }) => [
                      styles.chip,
                      { borderColor: c.selbr, backgroundColor: c.bg },
                      index === 0 && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text size={12} weight="medium" color={c.ts}>
                      السابق
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => go(1)}
                    hitSlop={10}
                    style={({ pressed }) => [styles.chip, { borderColor: c.selbr, backgroundColor: c.bg }, pressed && styles.pressed]}
                  >
                    <Text size={12} weight="medium" color={c.ts}>
                      {said >= zekr.count ? 'التالي' : 'تخطَّ'}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
              {virtueOn.some(Boolean) ? (
                <Animated.View style={[styles.virtueSlot, virtueStyle]} pointerEvents={zekr?.virtue ? 'box-none' : 'none'}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: showVirtue }}
                    accessibilityElementsHidden={!zekr?.virtue}
                    onPress={() => setShowVirtue((v) => !v)}
                    hitSlop={10}
                    style={({ pressed }) => [
                      styles.virtue,
                      { borderColor: c.selbr, backgroundColor: showVirtue ? c.selbg : c.bg },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text size={12} weight="medium" color={c.ts}>
                      الفضل
                    </Text>
                  </Pressable>
                </Animated.View>
              ) : null}
            </View>
          </GestureDetector>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  fill: { flex: 1 },
  band: { paddingHorizontal: 20, gap: 14 },
  bandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(128,128,128,0.16)',
  },
  title: { flex: 1 },
  position: { fontVariant: ['tabular-nums'] },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopStartRadius: 32,
    borderTopEndRadius: 32,
    overflow: 'hidden',
  },
  pages: { flex: 1, paddingTop: 52 },
  controls: {
    position: 'absolute',
    start: 20,
    end: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chip: { borderWidth: 1, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 14 },
  virtueSlot: { position: 'absolute', top: 14, left: 0, right: 0, alignItems: 'center' },
  virtue: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 18,
  },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.6 },
});
