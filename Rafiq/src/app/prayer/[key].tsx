import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedRef,
  useAnimatedStyle,
  useScrollViewOffset,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { measureOpenRow, setOpenRow } from '@/features/prayer/openRow';
import { PRAYERS, getTimes, type PrayerKey } from '@/features/prayer/engine';
import { DUHA_AFTER_SUNRISE_MIN, frozenSky } from '@/features/prayer/guide/frozenSky';
import { HERO_H, PrayerHero, type HeroFoot, type HeroOrigin, type HeroTime } from '@/features/prayer/guide/PrayerHero';
import { RawatibStrip } from '@/features/prayer/guide/RawatibStrip';
import { SkyBand } from '@/features/prayer/guide/SkyBand';
import { PATH_START_MS, SunnahPath } from '@/features/prayer/guide/SunnahPath';
import { guideFor, stationsOf } from '@/features/prayer/sunnah';
import { useCountdown } from '@/features/prayer/useCountdown';
import { usePrayerConfig } from '@/features/prayer/usePrayerConfig';
import { formatTime12, toArabicIndic } from '@/shared/lib/arabic';
import { dayMonthString, isSameDay, parseIsoDate, weekdayName } from '@/shared/lib/gregorian';
import { useMotion } from '@/shared/lib/motion';
import { usePreventBack } from '@/shared/lib/usePreventBack';
import { ARC_HEIGHT } from '@/features/prayer/sky';
import { useSettings } from '@/shared/storage/settings';
import { useTheme } from '@/shared/theme/useTheme';
import { ChevronBackIcon } from '@/shared/ui/Icons';

const MIN_MS = 60_000;
/** Duha window closes this long before Dhuhr (it opens `DUHA_AFTER_SUNRISE_MIN` after sunrise). */
const DUHA_BEFORE_DHUHR_MIN = 10;
/**
 * Mirror of the entrance: the card travels back over about the same time the
 * spring took, fast at first and settling on the row, and the screen pops
 * only once it has landed. (A short ease-in read as a cut: almost all of the
 * travel happened in its last few frames.)
 */
const EXIT_MS = 300;
/** After the stack's 180 ms fade-in has covered the home, its row can go without being seen to. */
const ROW_HIDE_MS = 260;
/** Space between the card's bottom and the band's rounded edge. */
const BAND_MARGIN = 22;

const isPrayerKey = (k: string | undefined): k is PrayerKey => PRAYERS.some((p) => p.key === k);

export default function PrayerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const { c } = useTheme();
  const { reduced } = useMotion();
  const { settings } = useSettings();
  const cfg = usePrayerConfig();
  const { now } = useCountdown(cfg);
  const params = useLocalSearchParams<'/prayer/[key]', { day?: string; y?: string; h?: string; hl?: string; band?: string }>();

  const key: PrayerKey = isPrayerKey(params.key) ? params.key : 'fajr';
  const date = useMemo(() => parseIsoDate(params.day) ?? new Date(), [params.day]);
  const times = useMemo(() => getTimes(cfg, date), [cfg, date]);
  const row = times.find((t) => t.key === key) ?? times[0];
  const guide = guideFor(key, date);
  // The home arc at this prayer's moment (sun, moon, star density), computed once.
  const frozen = useMemo(() => frozenSky(cfg, date, key), [cfg, date, key]);

  // Morph origin from the pressed row (window dp); absent on a cold deep link.
  const origin = useMemo<HeroOrigin | null>(() => {
    const y = Number(params.y);
    const h = Number(params.h);
    return Number.isFinite(y) && Number.isFinite(h) ? { y, h, highlighted: params.hl === '1' } : null;
  }, [params.y, params.h, params.hl]);

  const today = isSameDay(date, now);
  const tomorrow = isSameDay(date, new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const dayLabel = today ? 'اليوم' : tomorrow ? 'غداً' : `${weekdayName(date)} ${dayMonthString(date)}`;

  // Bottom row of the card, present on every page so all cards share one
  // height: a ticking countdown to whatever this prayer's window reaches
  // next, or the window's end once it has passed / on other days.
  const windowEnd = useMemo(() => {
    const at = (k: PrayerKey) => times.find((t) => t.key === k)?.at ?? row.at;
    switch (key) {
      case 'fajr':
        return at('sunrise');
      case 'sunrise':
        return new Date(at('dhuhr').getTime() - DUHA_BEFORE_DHUHR_MIN * MIN_MS);
      case 'dhuhr':
        return at('asr');
      case 'asr':
        return at('maghrib');
      case 'maghrib':
        return at('isha');
      default:
        return getTimes(cfg, new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1))[0].at;
    }
  }, [cfg, date, key, row.at, times]);
  const foot: HeroFoot = (() => {
    const isDuha = key === 'sunrise';
    const start = isDuha ? new Date(row.at.getTime() + DUHA_AFTER_SUNRISE_MIN * MIN_MS) : row.at;
    if (!today) return { label: isDuha ? 'ينتهي وقتها' : 'ينتهي الوقت', value: formatTime12(windowEnd) };
    const t = now.getTime();
    if (t < start.getTime()) return { label: isDuha ? 'تبدأ الضحى بعد' : 'يتبقى على الأذان', at: start };
    if (!isDuha && row.iqama && t < row.iqama.getTime()) return { label: 'يتبقى على الإقامة', at: row.iqama };
    if (t < windowEnd.getTime()) return { label: 'ينتهي الوقت بعد', at: windowEnd };
    return { label: isDuha ? 'انتهى وقتها' : 'انتهى الوقت', value: formatTime12(windowEnd) };
  })();

  const heroTimes: HeroTime[] =
    key === 'sunrise'
      ? [
          { label: 'من', at: new Date(row.at.getTime() + DUHA_AFTER_SUNRISE_MIN * MIN_MS) },
          { label: 'إلى', at: new Date((times.find((t) => t.key === 'dhuhr')?.at.getTime() ?? 0) - DUHA_BEFORE_DHUHR_MIN * MIN_MS) },
        ]
      : row.iqama
        ? [
            { label: 'الأذان', at: row.at },
            { label: 'الإقامة', at: row.iqama },
          ]
        : [{ label: 'الأذان', at: row.at }];

  const delay = key === 'sunrise' ? 0 : settings.iqama[key];
  const fardNote = row.iqama
    ? `الإقامة ${formatTime12(row.iqama)} · بعد الأذان بـ ${toArabicIndic(delay)} دقيقة`
    : 'بلا إقامة محددة';

  // Layout: the band is the home header's measured height so its edge stays
  // put across the transition. The card sits fully inside it, a fixed margin
  // above the edge; the arc box sits just above the card (the horizon is 24
  // units above the box's bottom, so corner discs stay clear of the card).
  const heroH = HERO_H;
  const homeBand = Number(params.band);
  const bandH = Number.isFinite(homeBand) && homeBand > 0 ? homeBand : insets.top + 48 + ARC_HEIGHT - 4 + heroH + BAND_MARGIN;
  const heroTop = bandH - BAND_MARGIN - heroH;
  const arcTop = heroTop - ARC_HEIGHT + 4;

  // Morph progress and the reverse on the back button. Hardware back stays
  // native so Android's predictive peek keeps working.
  const progress = useSharedValue(0);
  // The card is the home row, lifted off. While this page is open the home keeps
  // that row's place empty (see openRow), so the return can clear the whole page
  // early and fly the card back over the real home into its empty place. On
  // landing the real row is switched back on and the page pops: the card's last
  // frame is the row verbatim, so the swap and the stack's fade are not seen.
  // The row is only hidden once the page has faded in over it, never before:
  // an empty place showing under the incoming page would read as a blink.
  const restOp = useSharedValue(1);
  // Where the card returns to: the pressed row's rectangle, measured again as the
  // return starts, and the page's scroll offset, which has carried the card up.
  const rowY = useSharedValue(origin?.y ?? -1);
  const rowH = useSharedValue(origin?.h ?? 0);
  const scroller = useAnimatedRef<Animated.ScrollView>();
  const scrollY = useScrollViewOffset(scroller);
  const dayIso = params.day ?? null;
  useEffect(() => {
    if (!dayIso) return;
    const hide = setTimeout(() => setOpenRow({ key, day: dayIso }), ROW_HIDE_MS);
    return () => {
      clearTimeout(hide);
      setOpenRow(null);
    };
  }, [key, dayIso]);
  const leaving = useRef(false);
  // Hardware / gesture back plays the same return as the button. The guard stays
  // up for the whole return (a second press during it was popping the page
  // natively, mid-flight or before the return had drawn a frame) and lifts only
  // for the final pop, which waits one render for the lifted guard to be in place.
  const [returning, setReturning] = useState(false);
  const [popping, setPopping] = useState(false);
  const back = useCallback(() => setPopping(true), []);
  useEffect(() => {
    if (!popping) return;
    setOpenRow(null);
    router.back();
  }, [popping, router]);
  const exit = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    setReturning(true);
    if (reduced) {
      back();
      return;
    }
    measureOpenRow((place) => {
      if (place && place.h > 0 && place.y >= 0) {
        rowY.set(place.y);
        rowH.set(place.h);
      }
      restOp.set(withTiming(0, { duration: EXIT_MS * 0.3, easing: Easing.out(Easing.quad) }));
      progress.set(
        withTiming(0, { duration: EXIT_MS, easing: Easing.out(Easing.cubic) }, (finished) => {
          'worklet';
          if (finished) scheduleOnRN(back);
        }),
      );
    });
  }, [back, progress, reduced, restOp, rowH, rowY]);
  usePreventBack(!popping, exit);
  const restStyle = useAnimatedStyle(() => ({ opacity: restOp.get() }));

  const stationCount = stationsOf(guide).length;
  const stripDelay = PATH_START_MS + stationCount * 90 + 200;

  return (
    <View style={styles.screen}>
      <Animated.ScrollView ref={scroller} showsVerticalScrollIndicator={false} bounces={false} scrollEnabled={!returning}>
        {/* Everything but the card, faded as one picture (off-screen compositing): otherwise
            Android spreads the alpha over every view separately and stacked views fade at
            different rates. The card itself never fades, so its pieces never show their joints. */}
        <Animated.View
          needsOffscreenAlphaCompositing
          style={[{ minHeight: winH, paddingBottom: insets.bottom + 40, backgroundColor: c.bg }, restStyle]}
        >
          <SkyBand frozen={frozen} height={bandH} arcTop={arcTop} skyHidden={returning}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="رجوع"
              onPress={exit}
              style={({ pressed }) => [
                styles.back,
                { top: insets.top + 12, backgroundColor: c.surface, borderColor: c.border },
                pressed && { transform: [{ scale: 1.06 }] },
              ]}
            >
              <ChevronBackIcon size={16} color={c.tp} />
            </Pressable>
          </SkyBand>
          <View style={styles.body}>
            <SunnahPath guide={guide} fardNote={fardNote} />
            {guide.fardRakaat > 0 ? <RawatibStrip lit={guide.rawatib} delay={stripDelay} /> : null}
          </View>
        </Animated.View>
        {/* Outside the band: the band clips to its rounded bottom and the card begins
            below it, on the pressed row. Drawn after the rest, so it stays on top. */}
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <PrayerHero
            title={guide.title}
            rowName={row.name}
            rowTime={formatTime12(row.at)}
            dayLabel={dayLabel}
            times={heroTimes}
            foot={foot}
            origin={origin}
            progress={progress}
            rowY={rowY}
            rowH={rowH}
            scrollY={scrollY}
            top={heroTop}
            returning={returning}
          />
        </View>
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  back: {
    position: 'absolute',
    start: 24,
    width: 40,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  body: { paddingHorizontal: 20, paddingTop: 22, gap: 18 },
});
