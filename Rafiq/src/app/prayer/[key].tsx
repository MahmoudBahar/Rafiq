import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { PRAYERS, getTimes, type PrayerKey } from '@/features/prayer/engine';
import { DUHA_AFTER_SUNRISE_MIN, frozenSky } from '@/features/prayer/guide/frozenSky';
import { HERO_H, HERO_LIVE_H, PrayerHero, type HeroOrigin, type HeroTime } from '@/features/prayer/guide/PrayerHero';
import { RawatibStrip } from '@/features/prayer/guide/RawatibStrip';
import { SkyBand } from '@/features/prayer/guide/SkyBand';
import { PATH_START_MS, SunnahPath } from '@/features/prayer/guide/SunnahPath';
import { guideFor, stationsOf } from '@/features/prayer/sunnah';
import { useCountdown } from '@/features/prayer/useCountdown';
import { usePrayerConfig } from '@/features/prayer/usePrayerConfig';
import { formatTime12, toArabicIndic } from '@/shared/lib/arabic';
import { dayMonthString, isSameDay, parseIsoDate, weekdayName } from '@/shared/lib/gregorian';
import { useMotion } from '@/shared/lib/motion';
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
const EXIT_MS = 420;

const isPrayerKey = (k: string | undefined): k is PrayerKey => PRAYERS.some((p) => p.key === k);

export default function PrayerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const { reduced } = useMotion();
  const { settings } = useSettings();
  const cfg = usePrayerConfig();
  const { now, next } = useCountdown(cfg);
  const params = useLocalSearchParams<'/prayer/[key]', { day?: string; y?: string; h?: string; hl?: string }>();

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
  const live = today && next.key === key && !next.isTomorrow ? { kind: next.kind, at: next.at } : null;

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

  // Layout: back row, the frozen arc, then the card tucked just under the arc box
  // (the horizon sits 24 units above the box's bottom, so corner discs stay clear).
  const arcTop = insets.top + 48;
  const heroTop = arcTop + ARC_HEIGHT - 4;
  const heroH = live ? HERO_LIVE_H : HERO_H;
  const bandH = heroTop + heroH + 22;

  // Morph progress and the reverse on the back button. Hardware back stays
  // native so Android's predictive peek keeps working.
  const progress = useSharedValue(0);
  const bodyOp = useSharedValue(1);
  const leaving = useRef(false);
  const back = useCallback(() => router.back(), [router]);
  const exit = () => {
    if (leaving.current) return;
    leaving.current = true;
    if (reduced) {
      back();
      return;
    }
    bodyOp.set(withTiming(0, { duration: 260 }));
    progress.set(
      withTiming(0, { duration: EXIT_MS, easing: Easing.out(Easing.cubic) }, (finished) => {
        'worklet';
        if (finished) scheduleOnRN(back);
      }),
    );
  };
  const bodyStyle = useAnimatedStyle(() => ({ opacity: bodyOp.get() }));

  const stationCount = stationsOf(guide).length;
  const stripDelay = PATH_START_MS + stationCount * 90 + 200;

  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <SkyBand frozen={frozen} height={bandH} arcTop={arcTop}>
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
        {/* Sibling of the band, not a child: the band clips to its rounded bottom
            and the card begins below it, on the pressed row. */}
        <PrayerHero
          title={guide.title}
          rowName={row.name}
          rowTime={formatTime12(row.at)}
          dayLabel={dayLabel}
          times={heroTimes}
          live={live}
          origin={origin}
          progress={progress}
          top={heroTop}
        />

        <Animated.View style={[styles.body, bodyStyle]}>
          <SunnahPath guide={guide} fardNote={fardNote} />
          {guide.fardRakaat > 0 ? <RawatibStrip lit={guide.rawatib} delay={stripDelay} /> : null}
        </Animated.View>
      </ScrollView>
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
