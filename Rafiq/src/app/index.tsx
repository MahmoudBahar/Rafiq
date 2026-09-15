import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DateBar } from '@/features/prayer/DateBar';
import { DayPager } from '@/features/prayer/DayPager';
import { COUNTRY, DEFAULT_CITY, computeDay, type PrayerKey } from '@/features/prayer/engine';
import { PrayerList } from '@/features/prayer/PrayerList';
import { SunArc } from '@/features/prayer/SunArc';
import { useCountdown } from '@/features/prayer/useCountdown';
import { useDayPager } from '@/features/prayer/useDayPager';
import { usePrayerConfig } from '@/features/prayer/usePrayerConfig';
import { formatCountdown, formatTime12 } from '@/shared/lib/arabic';
import { gregorianString } from '@/shared/lib/gregorian';
import { hijriString } from '@/shared/lib/hijri';
import { useSettings } from '@/shared/storage/settings';
import { useTheme } from '@/shared/theme/useTheme';
import { GradientBackground } from '@/shared/ui/GradientBackground';
import { GearIcon, PinIcon } from '@/shared/ui/Icons';
import { TabBar } from '@/shared/ui/TabBar';
import { Text } from '@/shared/ui/Text';
import { Toast } from '@/shared/ui/Toast';

const TOAST_MS = 1800;
const TAB_BAR_HEIGHT = 58;
const DAY_MS = 86_400_000;

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const { settings } = useSettings();
  const cfg = usePrayerConfig();
  const { now, day, next, h, m, s } = useCountdown(cfg);
  const params = useLocalSearchParams<{ day?: string }>();

  // Day browsing: 0 = today. The countdown and sun arc always describe "now".
  const [dayOffset, setDayOffset] = useState(0);
  const commit = useCallback((delta: number) => setDayOffset((o) => o + delta), []);
  const pager = useDayPager(dayOffset, commit);

  const y = now.getFullYear();
  const mo = now.getMonth();
  const d = now.getDate();
  const viewDate = useMemo(() => new Date(y, mo, d + dayOffset), [y, mo, d, dayOffset]);
  const viewDay = useMemo(
    () => (dayOffset === 0 ? day : computeDay(cfg, viewDate)),
    [cfg, day, dayOffset, viewDate],
  );
  const highlight: PrayerKey | null = dayOffset === 0 && !next.isTomorrow ? next.key : null;

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
            <View style={styles.dates}>
              <Text size={12} weight="medium" color={c.tm}>
                {hijriString(now, day.byKey.maghrib)}
              </Text>
              <Text size={10.5} color={c.tm} style={styles.gregorian}>
                {gregorianString(now)}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="الإعدادات"
              onPress={() => router.push('/settings')}
              style={({ pressed }) => [styles.gear, pressed && { backgroundColor: 'rgba(0,0,0,0.06)' }]}
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
            {formatCountdown(h, m, s)}
          </Text>
          <Text size={12.5} weight="medium" color={c.ts}>
            الأذان الساعة {formatTime12(next.at)}
          </Text>
        </View>
        <SunArc now={now} day={day} />
        <View style={styles.headerSpacer} />
      </View>

      <DayPager gesture={pager.gesture} animatedStyle={pager.animatedStyle} style={styles.list}>
        <ScrollView
          contentContainerStyle={[styles.listContent, { paddingBottom: tabBottom + TAB_BAR_HEIGHT + 16 }]}
          showsVerticalScrollIndicator={false}
        >
          <DateBar
            date={viewDate}
            isToday={dayOffset === 0}
            onPrev={() => pager.go(-1)}
            onNext={() => pager.go(1)}
            onToday={() => pager.go(-dayOffset)}
            onOpenMonth={() =>
              router.push({ pathname: '/month', params: { y: String(viewDate.getFullYear()), m: String(viewDate.getMonth()) } })
            }
          />
          <PrayerList times={viewDay.times} nextKey={highlight} />
        </ScrollView>
      </DayPager>

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
  topEnd: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dates: { alignItems: 'flex-end', gap: 0 },
  gregorian: { opacity: 0.85 },
  gear: { width: 36, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  countdownBlock: { alignItems: 'center', paddingTop: 16 },
  countdown: { fontVariant: ['tabular-nums'] },
  headerSpacer: { height: 26 },
  list: { flex: 1 },
  listContent: { paddingTop: 20, paddingHorizontal: 20 },
});
