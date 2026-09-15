import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DayCarousel, DaySwipeSurface } from '@/features/prayer/DayCarousel';
import { COUNTRY, DEFAULT_CITY, getTimes, type PrayerKey, type PrayerTime } from '@/features/prayer/engine';
import { PrayerList } from '@/features/prayer/PrayerList';
import { SunArc } from '@/features/prayer/SunArc';
import { useCountdown } from '@/features/prayer/useCountdown';
import { useDayCarousel } from '@/features/prayer/useDayCarousel';
import { usePrayerConfig } from '@/features/prayer/usePrayerConfig';
import { formatCountdown, formatTime12 } from '@/shared/lib/arabic';
import { dayMonthString, weekdayName } from '@/shared/lib/gregorian';
import { hijriString } from '@/shared/lib/hijri';
import { useMotion } from '@/shared/lib/motion';
import { useSettings } from '@/shared/storage/settings';
import { radius } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { GradientBackground } from '@/shared/ui/GradientBackground';
import { CalendarIcon, GearIcon, PinIcon } from '@/shared/ui/Icons';
import { PressScale } from '@/shared/ui/PressScale';
import { TabBar } from '@/shared/ui/TabBar';
import { Display, Text } from '@/shared/ui/Text';
import { Toast } from '@/shared/ui/Toast';

const TOAST_MS = 1800;
const TAB_BAR_HEIGHT = 58;
const DAY_MS = 86_400_000;

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const m = useMotion();
  const { settings } = useSettings();
  const cfg = usePrayerConfig();
  const { now, day, next, h, m: mm, s } = useCountdown(cfg);
  const params = useLocalSearchParams<{ day?: string }>();

  // Day browsing: 0 = today. The countdown and sun arc always describe "now".
  const [dayOffset, setDayOffset] = useState(0);
  const commit = useCallback((delta: number) => setDayOffset((o) => o + delta), []);
  const carousel = useDayCarousel(dayOffset, commit);

  const y = now.getFullYear();
  const mo = now.getMonth();
  const d = now.getDate();
  const viewDate = useMemo(() => new Date(y, mo, d + dayOffset), [y, mo, d, dayOffset]);
  const highlight: PrayerKey | null = dayOffset === 0 && !next.isTomorrow ? next.key : null;

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
    if (params.day) {
      const [py, pm, pd] = params.day.split('-').map(Number);
      if (Number.isFinite(py) && Number.isFinite(pm) && Number.isFinite(pd)) {
        setDayOffset(Math.round((Date.UTC(py, pm - 1, pd) - Date.UTC(y, mo, d)) / DAY_MS));
      }
    }
  }
  useEffect(() => {
    if (params.day) router.setParams({ day: undefined });
  }, [params.day, router]);

  const [toast, setToast] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = () => {
    setToast(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(false), TOAST_MS);
  };
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const tabBottom = insets.bottom + 14;
  const city = settings.city ?? DEFAULT_CITY;
  const country = settings.country ?? (settings.locationMode === 'manual' || !settings.coords ? COUNTRY : null);
  const place = country ? `${city}، ${country}` : city;
  const nextLabel = next.isTomorrow ? 'الفجر غداً' : next.name;
  const openMonth = () =>
    router.push({ pathname: '/month', params: { y: String(viewDate.getFullYear()), m: String(viewDate.getMonth()) } });

  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <GradientBackground />
        <View style={styles.topRow}>
          <View style={styles.cityWrap}>
            <PinIcon size={13} color={c.tm} />
            <Text size={13.5} weight="semi">
              {place}
            </Text>
          </View>
          <View style={styles.topEnd}>
            <Text size={12} weight="medium" color={c.tm}>
              {hijriString(now, day.byKey.maghrib)}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="جدول الشهر"
              onPress={openMonth}
              style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: 'rgba(0,0,0,0.06)' }]}
            >
              <CalendarIcon size={17} color={c.tp} />
            </Pressable>
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
          <Text size={12} weight="medium" color={c.tm}>
            الصلاة القادمة · {nextLabel}
          </Text>
          <Text size={56} weight="bold" lineHeight={68} style={styles.countdown}>
            {formatCountdown(h, mm, s)}
          </Text>
          <Text size={12.5} weight="medium" color={c.ts}>
            الأذان الساعة {formatTime12(next.at)}
          </Text>
        </View>
        <SunArc now={now} day={day} />
        <View style={styles.headerSpacer} />
      </View>

      <DaySwipeSurface gesture={carousel.gesture}>
        <ScrollView
          contentContainerStyle={[styles.listContent, { paddingBottom: tabBottom + TAB_BAR_HEIGHT + 16 }]}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View layout={m.reduced ? undefined : LinearTransition.duration(220)} style={styles.titleRow}>
            <Animated.View key={dayOffset} entering={m.fadeIn()} exiting={m.fadeOut(140)}>
              <Display size={22} lineHeight={30}>
                {weekdayName(viewDate)} {dayMonthString(viewDate)}
              </Display>
            </Animated.View>
            {dayOffset !== 0 ? (
              <Animated.View entering={m.fadeIn()} exiting={m.fadeOut(140)}>
                <PressScale
                  accessibilityRole="button"
                  accessibilityLabel="العودة إلى اليوم"
                  onPress={() => carousel.go(-dayOffset)}
                  pressedScale={0.94}
                  style={[styles.todayPill, { backgroundColor: c.accent }]}
                >
                  <Text size={11.5} weight="bold" color="#ffffff">
                    اليوم
                  </Text>
                </PressScale>
              </Animated.View>
            ) : null}
          </Animated.View>

          <DayCarousel
            offset={dayOffset}
            values={carousel.values}
            renderDay={(off) => (
              <PrayerList times={timesByOffset.get(off) ?? day.times} nextKey={off === 0 ? highlight : null} />
            )}
          />
        </ScrollView>
      </DaySwipeSurface>

      <TabBar bottom={tabBottom} onComingSoon={showToast} />
      <Toast message="قريبًا في الإصدار القادم إِنْ شَاءَ اللّٰه" visible={toast} bottom={tabBottom + TAB_BAR_HEIGHT + 14} />
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
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cityWrap: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  topEnd: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: { width: 36, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  countdownBlock: { alignItems: 'center', paddingTop: 16 },
  countdown: { fontVariant: ['tabular-nums'] },
  headerSpacer: { height: 26 },
  listContent: { paddingTop: 14 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 22,
    paddingBottom: 10,
  },
  todayPill: { paddingVertical: 4, paddingHorizontal: 14, borderRadius: radius.pill },
});
