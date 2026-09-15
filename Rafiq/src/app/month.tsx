import uq from '@umalqura/core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PRAYERS, computeRange } from '@/features/prayer/engine';
import { usePrayerConfig } from '@/features/prayer/usePrayerConfig';
import { formatTimeShort, toArabicIndic } from '@/shared/lib/arabic';
import { WEEKDAYS_AR, dayMonthString, gregorianRange, isSameDay, monthName } from '@/shared/lib/gregorian';
import { hijriMonthName, hijriMonthRange } from '@/shared/lib/hijri';
import { useMotion } from '@/shared/lib/motion';
import { radius } from '@/shared/theme/tokens';
import { useTheme, type Scheme } from '@/shared/theme/useTheme';
import { ChevronBackIcon, ChevronForwardIcon } from '@/shared/ui/Icons';
import { PressScale } from '@/shared/ui/PressScale';
import { Segmented } from '@/shared/ui/Segmented';
import { Display, Text } from '@/shared/ui/Text';

type Mode = 'gregorian' | 'hijri';

const ROW_H = 46;
const FRIDAY = 5;
// @umalqura/core covers 1356–1500 AH (1937–2077 CE).
const HIJRI_MIN = 1356;
const HIJRI_MAX = 1500;
const GREG_MIN = 1938;
const GREG_MAX = 2076;

const pad2 = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const localMidnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

interface RowVM {
  key: string;
  date: Date;
  num: string;
  sub: string;
  friday: boolean;
  isToday: boolean;
  times: string[];
}

export default function MonthScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { c, scheme } = useTheme();
  const m = useMotion();
  const cfg = usePrayerConfig();
  const params = useLocalSearchParams<{ y?: string; m?: string }>();

  const today = new Date();
  const ty = today.getFullYear();
  const tm = today.getMonth();
  const td = today.getDate();

  const [mode, setMode] = useState<Mode>('gregorian');
  const [ym, setYm] = useState(() => {
    const y = Number(params.y);
    const m0 = Number(params.m);
    return params.y && params.m && Number.isFinite(y) && Number.isFinite(m0) ? { y, m0 } : { y: ty, m0: tm };
  });
  const [hym, setHym] = useState(() => {
    const u = uq(today);
    return { hy: u.hy, hm: u.hm };
  });

  const { first, last, title, sub } = useMemo(() => {
    if (mode === 'hijri') {
      const u = uq(hym.hy, hym.hm, 1);
      const f = localMidnight(u.date);
      const l = localMidnight(u.endOf('month').date);
      return {
        first: f,
        last: l,
        title: `${hijriMonthName(hym.hm)} ${toArabicIndic(hym.hy)}`,
        sub: gregorianRange(f, l),
      };
    }
    const f = new Date(ym.y, ym.m0, 1);
    const l = new Date(ym.y, ym.m0 + 1, 0);
    return { first: f, last: l, title: `${monthName(ym.m0)} ${toArabicIndic(ym.y)}`, sub: hijriMonthRange(f, l) };
  }, [mode, ym, hym]);

  // Strings only, so rows render without any per-row date work.
  const rows = useMemo<RowVM[]>(() => {
    const todayDate = new Date(ty, tm, td);
    return computeRange(cfg, first, last).map((r, i) => ({
      key: iso(r.date),
      date: r.date,
      num: toArabicIndic(mode === 'hijri' ? i + 1 : r.day),
      sub: mode === 'hijri' ? dayMonthString(r.date) : WEEKDAYS_AR[r.weekday],
      friday: r.weekday === FRIDAY,
      isToday: isSameDay(r.date, todayDate),
      times: PRAYERS.map((p) => formatTimeShort(r.byKey[p.key])),
    }));
  }, [cfg, first, last, mode, ty, tm, td]);

  const todayIndex = rows.findIndex((r) => r.isToday);
  const listKey = mode === 'hijri' ? `h-${hym.hy}-${hym.hm}` : `g-${ym.y}-${ym.m0}`;

  const onMode = (next: Mode) => {
    if (next === mode) return;
    const anchor = todayIndex >= 0 ? today : first;
    if (next === 'hijri') {
      const u = uq(anchor);
      setHym({ hy: u.hy, hm: u.hm });
    } else {
      setYm({ y: anchor.getFullYear(), m0: anchor.getMonth() });
    }
    setMode(next);
  };

  const step = (delta: 1 | -1) => {
    if (mode === 'hijri') {
      setHym(({ hy, hm }) => {
        let nm = hm + delta;
        let ny = hy;
        if (nm < 1) {
          nm = 12;
          ny -= 1;
        } else if (nm > 12) {
          nm = 1;
          ny += 1;
        }
        return { hy: clamp(ny, HIJRI_MIN, HIJRI_MAX), hm: nm };
      });
    } else {
      setYm(({ y, m0 }) => {
        let nm = m0 + delta;
        let ny = y;
        if (nm < 0) {
          nm = 11;
          ny -= 1;
        } else if (nm > 11) {
          nm = 0;
          ny += 1;
        }
        return { y: clamp(ny, GREG_MIN, GREG_MAX), m0: nm };
      });
    }
  };

  const openDay = useCallback(
    (date: Date) => router.navigate({ pathname: '/', params: { day: iso(date) } }),
    [router],
  );

  const listRef = useRef<ScrollView>(null);
  const scrollToToday = () => {
    if (todayIndex > 2) listRef.current?.scrollTo({ y: ROW_H * (todayIndex - 2), animated: false });
  };

  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="رجوع"
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.back,
            { backgroundColor: c.surface, borderColor: c.border },
            pressed && { transform: [{ scale: 1.06 }] },
          ]}
        >
          <ChevronBackIcon size={16} color={c.tp} />
        </Pressable>
        <Display size={28} numberOfLines={1} style={styles.headerTitle}>
          جدول الشهر
        </Display>
      </View>

      <View style={styles.modeRow}>
        <View style={styles.modeWrap}>
          <Segmented<Mode>
            value={mode}
            onChange={onMode}
            options={[
              { key: 'gregorian', label: 'ميلادي' },
              { key: 'hijri', label: 'هجري' },
            ]}
          />
        </View>
      </View>

      <View style={styles.monthNav}>
        <PressScale
          accessibilityRole="button"
          accessibilityLabel="الشهر السابق"
          onPress={() => step(-1)}
          pressedScale={0.92}
          style={[styles.navBtn, { backgroundColor: c.surface, borderColor: c.border }]}
        >
          <ChevronBackIcon size={15} color={c.tp} />
        </PressScale>
        <Animated.View key={listKey} entering={m.fadeIn(0, 200)} style={styles.monthTitle}>
          <Text size={16} weight="bold">
            {title}
          </Text>
          <Text size={11.5} color={c.tm}>
            {sub}
          </Text>
        </Animated.View>
        <PressScale
          accessibilityRole="button"
          accessibilityLabel="الشهر التالي"
          onPress={() => step(1)}
          pressedScale={0.92}
          style={[styles.navBtn, { backgroundColor: c.surface, borderColor: c.border }]}
        >
          <ChevronForwardIcon size={15} color={c.tp} />
        </PressScale>
      </View>

      <View style={[styles.columns, { borderBottomColor: c.border }]}>
        <Text size={11} weight="semi" color={c.tm} style={styles.dayCol}>
          اليوم
        </Text>
        {PRAYERS.map((p) => (
          <Text key={p.key} size={11} weight="semi" color={c.tm} align="center" style={styles.timeCol}>
            {p.name}
          </Text>
        ))}
      </View>

      <ScrollView
        key={listKey}
        ref={listRef}
        onContentSizeChange={scrollToToday}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
      >
        {rows.map((vm) => (
          <MonthRow key={vm.key} vm={vm} scheme={scheme} onPress={openDay} />
        ))}
      </ScrollView>
    </View>
  );
}

interface MonthRowProps {
  vm: RowVM;
  /** Included so memoized rows re-render on theme change. */
  scheme: Scheme;
  onPress: (date: Date) => void;
}

const MonthRow = memo(function MonthRow({ vm, onPress }: MonthRowProps) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${vm.sub} ${vm.num}`}
      onPress={() => onPress(vm.date)}
      style={({ pressed }) => [
        styles.row,
        vm.isToday
          ? { backgroundColor: c.selbg, borderColor: c.accent }
          : { backgroundColor: 'transparent', borderColor: 'transparent' },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={styles.dayCol}>
        <View style={styles.dayInner}>
          <View style={[styles.dot, { backgroundColor: c.accent, opacity: vm.isToday ? 1 : 0 }]} />
          <Text size={13} weight={vm.isToday ? 'bold' : 'semi'} color={c.tp}>
            {vm.num}
          </Text>
        </View>
        <Text size={10} color={vm.friday ? c.ts : c.tm} weight={vm.friday ? 'semi' : 'regular'} numberOfLines={1}>
          {vm.sub}
        </Text>
      </View>
      {vm.times.map((t, i) => (
        <Text
          key={PRAYERS[i].key}
          size={12.5}
          weight={vm.isToday ? 'bold' : 'medium'}
          color={PRAYERS[i].isPrayer ? c.tp : c.tm}
          align="center"
          style={[styles.timeCol, styles.tabular]}
        >
          {t}
        </Text>
      ))}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingBottom: 10,
  },
  headerTitle: { flex: 1 },
  modeRow: { paddingHorizontal: 20, paddingBottom: 12, alignItems: 'flex-start' },
  modeWrap: { width: 200 },
  back: {
    width: 40,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 10,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitle: { flex: 1, alignItems: 'center' },
  columns: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    paddingHorizontal: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
  },
  listContent: { paddingTop: 6, paddingHorizontal: 16 },
  row: {
    height: ROW_H,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  dayCol: { flex: 1.25, justifyContent: 'center' },
  dayInner: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 5, height: 5, borderRadius: 999 },
  timeCol: { flex: 1 },
  tabular: { fontVariant: ['tabular-nums'] },
});
