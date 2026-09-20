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
import { AZKAR_SETS, isAzkarSetId, type AzkarSetId } from '@/features/azkar/data';
import { flushAzkarProgress, useAzkarProgress } from '@/features/azkar/progress';
import { SetComplete } from '@/features/azkar/reader/SetComplete';
import { StoryProgress } from '@/features/azkar/reader/StoryProgress';
import { ZekrPage } from '@/features/azkar/reader/ZekrPage';
import { useAzkarClock } from '@/features/azkar/time';
import { DayCarousel } from '@/features/prayer/DayCarousel';
import { COL_PAD, useDayCarousel } from '@/features/prayer/useDayCarousel';
import { toArabicIndic } from '@/shared/lib/arabic';
import { bead, success } from '@/shared/lib/haptics';
import { useMotion } from '@/shared/lib/motion';
import { usePreventBack } from '@/shared/lib/usePreventBack';
import { dialSky, radius } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { GradientBackground } from '@/shared/ui/GradientBackground';
import { ChevronBackIcon } from '@/shared/ui/Icons';
import { Display, Text } from '@/shared/ui/Text';

const BAND_H = 104;
const EXIT_MS = 300;
const RISE = { damping: 18, stiffness: 170, mass: 0.9 };
/** Sheet offset when the page was not opened from the dial (a deep link). */
const FALLBACK_RISE = 40;
const ADVANCE_MS = 650;
const ADVANCE_REDUCED_MS = 250;

/**
 * The azkar reader. It opens over the dial as a transparent page whose sky is
 * the dial's own, and whose sheet starts exactly on the dial's ground and
 * rises: the ground comes up to become the page. Leaving plays it backwards.
 *
 * One zekr per page. A tap anywhere on the sheet counts a repetition (the
 * count lives on the UI thread, so the bead moves with the finger and React
 * hears about it afterwards); a vertical drag scrolls a long text; a
 * horizontal one turns the page.
 */
export default function AzkarReaderScreen() {
  const params = useLocalSearchParams<{ set?: string; ground?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { c } = useTheme();
  const { reduced } = useMotion();

  const valid = isAzkarSetId(params.set);
  const setId: AzkarSetId = isAzkarSetId(params.set) ? params.set : 'morning';
  const { items, title } = AZKAR_SETS[setId];
  const sky = dialSky[setId];
  const n = items.length;
  const { dayKey } = useAzkarClock();
  const progress = useAzkarProgress(setId, dayKey);
  const { counts, setCount } = progress;

  // Page `n` is the closing page. The reader opens on the first zekr still owed.
  const [index, setIndex] = useState(() => Math.min(progress.firstIncomplete, n));
  const [showVirtue, setShowVirtue] = useState(false);
  const zekr = index < n ? items[index] : null;
  const total = zekr?.count ?? 0;
  const said = index < n ? Math.min(counts[index] ?? 0, total) : 0;

  const onCommit = useCallback((delta: number) => {
    setIndex((i) => i + delta);
    setShowVirtue(false);
  }, []);
  const bounds = useMemo(() => ({ min: 0, max: n }), [n]);
  const pager = useDayCarousel(index, onCommit, bounds);

  // Counting state for the page in view, on the UI thread.
  const count = useSharedValue(said);
  // The page `count` speaks for. Each page's strand follows `count` only while it is that page.
  const owner = useSharedValue(index);
  const target = useSharedValue(total);
  const locked = useSharedValue(false);
  const glow = useSharedValue(0);
  useEffect(() => {
    count.set(said);
    owner.set(index);
    target.set(total);
    locked.set(false);
    // Seeded when the page changes only: between taps the UI thread is ahead of React.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  useEffect(() => flushAzkarProgress, []);

  // A zekr just completed on this page: hold for the glow, then turn the page.
  const { go } = pager;
  const [justDone, setJustDone] = useState<number | null>(null);
  useEffect(() => {
    if (justDone === null || justDone !== index) return;
    const timer = setTimeout(() => go(1), reduced ? ADVANCE_REDUCED_MS : ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [justDone, index, go, reduced]);

  const onCount = useCallback(
    (i: number, next: number, done: boolean) => {
      setCount(i, next);
      if (!done) {
        bead();
        return;
      }
      success();
      flushAzkarProgress();
      if (!reduced) glow.set(withSequence(withTiming(1, { duration: 180 }), withTiming(0, { duration: 340 })));
      setJustDone(i);
    },
    [glow, reduced, setCount],
  );

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
          if (done) locked.set(true);
          scheduleOnRN(onCount, index, next, done);
        }),
    [count, index, locked, onCount, target],
  );
  // TalkBack and VoiceOver activate through this instead of the gesture.
  const countFromA11y = () => {
    if (!zekr || said >= total) return;
    count.set(said + 1);
    onCount(index, said + 1, said + 1 === total);
  };

  // Enter: the sheet starts on the dial's ground and rises. Exit reverses it, then pops.
  const ground = Number(params.ground);
  const bandH = insets.top + BAND_H;
  const rise = Number.isFinite(ground) && ground > bandH ? ground - bandH : FALLBACK_RISE;
  const sheetY = useSharedValue(reduced ? 0 : rise);
  const bodyOp = useSharedValue(reduced ? 1 : 0);
  const pageOp = useSharedValue(1);
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
    pageOp.set(withDelay(EXIT_MS * 0.5, withTiming(0, { duration: EXIT_MS * 0.5 })));
    sheetY.set(
      withTiming(rise, { duration: EXIT_MS, easing: Easing.out(Easing.cubic) }, (finished) => {
        'worklet';
        if (finished) scheduleOnRN(back);
      }),
    );
  }, [back, bodyOp, pageOp, reduced, rise, sheetY]);
  usePreventBack(!returning, exit);

  useEffect(() => {
    if (!valid) router.back();
  }, [valid, router]);

  const pageStyle = useAnimatedStyle(() => ({ opacity: pageOp.get() }));
  const bodyStyle = useAnimatedStyle(() => ({ opacity: bodyOp.get() }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: sheetY.get() }] }));

  if (!valid) return null;

  const position = index < n ? `${toArabicIndic(index + 1)} من ${toArabicIndic(n)}` : 'تمّت';

  return (
    <Animated.View style={[styles.screen, pageStyle]}>
      <StatusBar style={setId === 'morning' ? 'dark' : 'light'} />
      <GradientBackground colors={[sky.top, sky.bot]} />

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
        <StoryProgress items={items} counts={counts} index={index} said={said} done={dialSky.dusk} track="rgba(128,128,128,0.32)" />
      </Animated.View>

      <Animated.View style={[styles.sheet, { top: bandH, backgroundColor: c.bg }, sheetStyle]}>
        <Animated.View style={[styles.fill, bodyStyle]}>
          <GestureDetector gesture={pager.gesture}>
            <View style={styles.fill}>
              <GestureDetector gesture={tap}>
                <View
                  style={[styles.fill, { paddingBottom: insets.bottom + 10 }]}
                  accessible={zekr !== null}
                  accessibilityRole="button"
                  accessibilityLabel={
                    zekr ? `${zekr.text}. ${toArabicIndic(said)} من ${toArabicIndic(total)}. اضغط للعدّ` : undefined
                  }
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
                            title={title}
                            done={progress.done}
                            total={n}
                            onBack={exit}
                            onResume={() => go(progress.firstIncomplete - n)}
                          />
                        ) : (
                          <ZekrPage
                            zekr={items[i]}
                            page={i}
                            owner={owner}
                            count={count}
                            glow={glow}
                            said={Math.min(counts[i] ?? 0, items[i].count)}
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
                      { borderColor: c.selbr },
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
                    style={({ pressed }) => [styles.chip, { borderColor: c.selbr }, pressed && styles.pressed]}
                  >
                    <Text size={12} weight="medium" color={c.ts}>
                      {said >= total ? 'التالي' : 'تخطَّ'}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
              {zekr?.virtue ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showVirtue }}
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
  virtue: {
    position: 'absolute',
    top: 14,
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 18,
  },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.6 },
});
