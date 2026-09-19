import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CountdownDigits } from '@/features/prayer/CountdownDigits';
import { DayCarousel, DaySwipeSurface } from '@/features/prayer/DayCarousel';
import { DayPill, PILL_SLOT } from '@/features/prayer/DayPill';
import { COUNTRY, DEFAULT_CITY, getTimes, type NextEvent, type PrayerKey, type PrayerTime } from '@/features/prayer/engine';
import { PrayerList, type RowRect } from '@/features/prayer/PrayerList';
import { SkyArc } from '@/features/prayer/SkyArc';
import { StarField } from '@/features/prayer/StarField';
import { useCountdown } from '@/features/prayer/useCountdown';
import { useDayCarousel } from '@/features/prayer/useDayCarousel';
import { useSky } from '@/features/prayer/useSky';
import { usePrayerConfig } from '@/features/prayer/usePrayerConfig';
import { formatTime12 } from '@/shared/lib/arabic';
import { gregorianString, isoDate, parseIsoDate } from '@/shared/lib/gregorian';
import { hijriString } from '@/shared/lib/hijri';
import { useMotion } from '@/shared/lib/motion';
import { useSettings } from '@/shared/storage/settings';
import { radius } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { GradientBackground } from '@/shared/ui/GradientBackground';
import { ChevronDownIcon, GearIcon, PinIcon } from '@/shared/ui/Icons';
import { PressScale } from '@/shared/ui/PressScale';
import { TabBar } from '@/shared/ui/TabBar';
import { Text } from '@/shared/ui/Text';
import { TipBubble } from '@/shared/ui/TipBubble';
import { Toast } from '@/shared/ui/Toast';

const TOAST_MS = 1800;
const TAB_BAR_HEIGHT = 58;
const DAY_MS = 86_400_000;
// First-launch tutorial: a swipe hint, then a "tap the date" tip. Each step
// shows on at most HINT_MAX launches and stops for good once used.
const HINT_MAX = 3;
const HINT_DELAY_MS = 900;
const SWIPE_NUDGE_MS = [300, 2400];
const SWIPE_SHOW_MS = 4500;
const STEP_GAP_MS = 600;
const DATE_PULSE_MS = [100, 1700];
const DATE_SHOW_MS = 4000;

/** Countdown caption and the line under the digits, by what is being counted to. */
function eventLabels(next: NextEvent): { title: string; sub: string } {
  const at = formatTime12(next.at);
  switch (next.kind) {
    case 'iqama':
      return { title: `إقامة · ${next.name}`, sub: `تقام الصلاة الساعة ${at}` };
    case 'sunrise':
      return { title: 'الشروق · نهاية وقت الفجر', sub: `الشروق الساعة ${at}` };
    default:
      return { title: `الصلاة القادمة · ${next.isTomorrow ? 'الفجر غداً' : next.name}`, sub: `الأذان الساعة ${at}` };
  }
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const m = useMotion();
  const { settings, update } = useSettings();
  const cfg = usePrayerConfig();
  const { now, day, next } = useCountdown(cfg);
  const params = useLocalSearchParams<{ day?: string }>();
  const sky = useSky(now, day, cfg.coords);

  // Day browsing: 0 = today. The countdown and sun arc always describe "now".
  const [dayOffset, setDayOffset] = useState(0);
  const [hint, setHint] = useState(false);
  const hintDone = settings.swipeHintShown >= HINT_MAX;
  const commit = useCallback(
    (delta: number) => {
      setDayOffset((o) => o + delta);
      setHint(false);
      if (!hintDone) update({ swipeHintShown: HINT_MAX });
    },
    [hintDone, update],
  );
  const carousel = useDayCarousel(dayOffset, commit);

  // Date tip: the header date block pulses under a small bubble.
  const [dateHint, setDateHint] = useState(false);
  const dateTipCancelled = useRef(false);
  const dateScale = useSharedValue(1);
  const dateStyle = useAnimatedStyle(() => ({ transform: [{ scale: dateScale.get() }] }));
  const pulseDate = useCallback(() => {
    if (m.reduced) return;
    dateScale.set(withRepeat(withSequence(withTiming(1.06, { duration: 350 }), withTiming(1, { duration: 350 })), 2));
  }, [dateScale, m.reduced]);

  // Tutorial sequencing. The initial counters are captured at mount so the
  // effect runs exactly once per launch; state changes only happen in timers.
  const [initialSwipe] = useState(settings.swipeHintShown);
  const [initialDate] = useState(settings.dateHintShown);
  const { nudge } = carousel;
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    let t = HINT_DELAY_MS;
    if (initialSwipe < HINT_MAX) {
      at(t, () => {
        setHint(true);
        update({ swipeHintShown: initialSwipe + 1 });
      });
      for (const ms of SWIPE_NUDGE_MS) at(t + ms, nudge);
      at(t + SWIPE_SHOW_MS, () => setHint(false));
      t += SWIPE_SHOW_MS + STEP_GAP_MS;
    }
    if (initialDate < HINT_MAX) {
      at(t, () => {
        if (dateTipCancelled.current) return;
        setDateHint(true);
        update({ dateHintShown: initialDate + 1 });
      });
      for (const ms of DATE_PULSE_MS) at(t + ms, () => !dateTipCancelled.current && pulseDate());
      at(t + DATE_SHOW_MS, () => setDateHint(false));
    }
    return () => timers.forEach(clearTimeout);
  }, [initialSwipe, initialDate, nudge, pulseDate, update]);

  const y = now.getFullYear();
  const mo = now.getMonth();
  const d = now.getDate();
  const viewDate = useMemo(() => new Date(y, mo, d + dayOffset), [y, mo, d, dayOffset]);
  // After Isha the next prayer is tomorrow's Fajr: highlight it on tomorrow's column, not today's.
  const highlightFor = (off: number): PrayerKey | null => {
    if (next.isTomorrow) return off === 1 ? 'fajr' : null;
    return off === 0 ? next.key : null;
  };

  // Times for the visible column and its two neighbours.
  const timesByOffset = useMemo(() => {
    const map = new Map<number, readonly PrayerTime[]>();
    for (const off of [dayOffset - 1, dayOffset, dayOffset + 1]) {
      map.set(off, off === 0 ? day.times : getTimes(cfg, new Date(y, mo, d + off)));
    }
    return map;
  }, [cfg, day, dayOffset, y, mo, d]);

  // Deep link from the month table: ?day=YYYY-MM-DD → jump to that day.
  // State is adjusted during render (React's "derive from prop change" pattern);
  // the effect only clears the param so a re-open of the same day works.
  const [seenDay, setSeenDay] = useState<string | undefined>(undefined);
  if (params.day !== seenDay) {
    setSeenDay(params.day);
    const target = parseIsoDate(params.day);
    if (target) {
      setDayOffset(
        Math.round(
          (Date.UTC(target.getFullYear(), target.getMonth(), target.getDate()) - Date.UTC(y, mo, d)) / DAY_MS,
        ),
      );
    }
  }
  useEffect(() => {
    if (params.day) router.setParams({ day: undefined });
  }, [params.day, router]);

  // The list makes room under the floating pill while one is showing.
  const pillShowing = dayOffset !== 0 || hint;
  const slotH = useSharedValue(0);
  useEffect(() => {
    const target = pillShowing ? PILL_SLOT : 0;
    slotH.set(m.reduced ? target : withTiming(target, { duration: 220 }));
  }, [pillShowing, m.reduced, slotH]);
  const slotStyle = useAnimatedStyle(() => ({ height: slotH.get() }));

  const [toast, setToast] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = () => {
    setToast(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(false), TOAST_MS);
  };
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const tabBottom = insets.bottom + 14;
  const city = settings.city ?? DEFAULT_CITY;
  const country = settings.country ?? (settings.locationMode === 'manual' || !settings.coords ? COUNTRY : null);
  const place = country ? `${city}، ${country}` : city;
  const labels = eventLabels(next);
  // The prayer page draws its sky band at exactly this height, so the band's
  // rounded edge does not move between the two screens.
  const [headerH, setHeaderH] = useState(0);
  const openPrayer = (off: number, key: PrayerKey, rect: RowRect) => {
    router.push({
      pathname: '/prayer/[key]',
      params: {
        key,
        day: isoDate(new Date(y, mo, d + off)),
        y: String(rect.y),
        h: String(rect.h),
        hl: highlightFor(off) === key ? '1' : '0',
        band: String(headerH),
      },
    });
  };
  const openMonth = () => {
    if (settings.dateHintShown < HINT_MAX) update({ dateHintShown: HINT_MAX });
    dateTipCancelled.current = true;
    setDateHint(false);
    router.push({ pathname: '/month', params: { y: String(viewDate.getFullYear()), m: String(viewDate.getMonth()) } });
  };

  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <View
        style={[styles.header, { paddingTop: insets.top + 16 }]}
        onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}
      >
        <GradientBackground />
        <StarField visibility={sky.stars} />
        <View style={styles.topRow}>
          <View style={styles.cityWrap}>
            <PinIcon size={13} color={c.tm} />
            <Text size={13.5} weight="semi">
              {place}
            </Text>
          </View>
          <View style={styles.topEnd}>
            <Animated.View style={[styles.datesWrap, dateStyle]}>
              <PressScale
                accessibilityRole="button"
                accessibilityLabel="جدول الشهر"
                onPress={openMonth}
                pressedScale={0.96}
                style={styles.dates}
              >
                <Text size={12} weight="medium" color={c.tm}>
                  {hijriString(now, day.byKey.maghrib)}
                </Text>
                <View style={styles.gregorianRow}>
                  <Text size={10.5} color={c.tm} style={styles.gregorian}>
                    {gregorianString(now)}
                  </Text>
                  <ChevronDownIcon size={10} color={c.tm} />
                </View>
              </PressScale>
              <TipBubble visible={dateHint} text="اضغط على التاريخ لعرض جدول الشهر" />
            </Animated.View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="الإعدادات"
              onPress={() => router.push('/settings')}
              style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: 'rgba(0,0,0,0.06)' }]}
            >
              <GearIcon size={17} color={c.tp} />
            </Pressable>
          </View>
        </View>
        <View style={styles.countdownBlock}>
          {/* Full-width, centred by textAlign: an intrinsic-width RTL label on
              Android can measure a hair short and wrap its last word into a
              clipped second line (the "الصلاة القادمة ·" with no name bug). */}
          <Text size={12} weight="medium" color={c.tm} align="center" numberOfLines={1} style={styles.wide}>
            {labels.title}
          </Text>
          <CountdownDigits at={next.at} />
          <Text size={12.5} weight="medium" color={c.ts} align="center" numberOfLines={1} style={styles.wide}>
            {labels.sub}
          </Text>
        </View>
        <SkyArc sky={sky} day={day} />
        <View style={styles.headerSpacer} />
      </View>

      <DaySwipeSurface gesture={carousel.gesture}>
        <ScrollView
          contentContainerStyle={[styles.listContent, { paddingBottom: tabBottom + TAB_BAR_HEIGHT + 16 }]}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={slotStyle} />
          <DayCarousel
            offset={dayOffset}
            values={carousel.values}
            renderDay={(off) => (
              <PrayerList
                times={timesByOffset.get(off) ?? day.times}
                nextKey={highlightFor(off)}
                onPressPrayer={(key, rect) => openPrayer(off, key, rect)}
              />
            )}
          />
        </ScrollView>
        <DayPill date={dayOffset !== 0 ? viewDate : null} hint={hint} onToday={() => carousel.go(-dayOffset)} />
      </DaySwipeSurface>

      <TabBar bottom={tabBottom} onComingSoon={showToast} />
      <Toast
        message="قريبًا في الإصدار القادم إِنْ شَاءَ اللّٰه"
        visible={toast}
        bottom={tabBottom + TAB_BAR_HEIGHT + 14}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    paddingHorizontal: 24,
    borderBottomStartRadius: 32,
    borderBottomEndRadius: 32,
    overflow: 'hidden',
  },
  // zIndex keeps the date tip bubble above the countdown block that follows.
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 },
  cityWrap: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  topEnd: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dates: {
    alignItems: 'flex-start',
    gap: 1,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radius.md,
  },
  datesWrap: { position: 'relative' },
  gregorianRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  gregorian: { opacity: 0.85 },
  iconBtn: { width: 36, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  countdownBlock: { alignItems: 'center', paddingTop: 16 },
  wide: { alignSelf: 'stretch' },
  headerSpacer: { height: 26 },
  listContent: { paddingTop: 14 },
});
