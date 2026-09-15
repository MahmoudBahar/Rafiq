import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PRAYERS, computeMonth, type DayRow } from '@/features/prayer/engine';
import { usePrayerConfig } from '@/features/prayer/usePrayerConfig';
import { formatTimeShort, toArabicIndic } from '@/shared/lib/arabic';
import { WEEKDAYS_AR, monthName } from '@/shared/lib/gregorian';
import { hijriMonthRange } from '@/shared/lib/hijri';
import { useMotion } from '@/shared/lib/motion';
import { radius } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { ChevronBackIcon, ChevronForwardIcon } from '@/shared/ui/Icons';
import { PressScale } from '@/shared/ui/PressScale';
import { Display, Text } from '@/shared/ui/Text';

const ROW_H = 46;
const FRIDAY = 5;

const pad2 = (n: number) => String(n).padStart(2, '0');

export default function MonthScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const m = useMotion();
  const cfg = usePrayerConfig();
  const params = useLocalSearchParams<{ y?: string; m?: string }>();

  const today = new Date();
  const [ym, setYm] = useState(() => {
    const y = Number(params.y);
    const m0 = Number(params.m);
    return Number.isFinite(y) && Number.isFinite(m0) && params.y && params.m
      ? { y, m0 }
      : { y: today.getFullYear(), m0: today.getMonth() };
  });

  const rows = useMemo(() => computeMonth(cfg, ym.y, ym.m0), [cfg, ym.y, ym.m0]);
  const isCurrentMonth = ym.y === today.getFullYear() && ym.m0 === today.getMonth();
  const todayIndex = isCurrentMonth ? today.getDate() - 1 : -1;
  const first = rows[0]?.date ?? today;
  const last = rows[rows.length - 1]?.date ?? today;

  const prevMonth = () => setYm(({ y, m0 }) => (m0 === 0 ? { y: y - 1, m0: 11 } : { y, m0: m0 - 1 }));
  const nextMonth = () => setYm(({ y, m0 }) => (m0 === 11 ? { y: y + 1, m0: 0 } : { y, m0: m0 + 1 }));

  const openDay = (row: DayRow) => {
    const day = `${row.date.getFullYear()}-${pad2(row.date.getMonth() + 1)}-${pad2(row.date.getDate())}`;
    router.navigate({ pathname: '/', params: { day } });
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
        <Display size={28}>جدول الشهر</Display>
      </View>

      <View style={styles.monthNav}>
        <PressScale
          accessibilityRole="button"
          accessibilityLabel="الشهر السابق"
          onPress={prevMonth}
          pressedScale={0.92}
          style={[styles.navBtn, { backgroundColor: c.surface, borderColor: c.border }]}
        >
          <ChevronBackIcon size={15} color={c.tp} />
        </PressScale>
        <Animated.View key={`${ym.y}-${ym.m0}`} entering={m.fadeInDown(0, 260)} style={styles.monthTitle}>
          <Text size={16} weight="bold">
            {monthName(ym.m0)} {toArabicIndic(ym.y)}
          </Text>
          <Text size={11.5} color={c.tm}>
            {hijriMonthRange(first, last)}
          </Text>
        </Animated.View>
        <PressScale
          accessibilityRole="button"
          accessibilityLabel="الشهر التالي"
          onPress={nextMonth}
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

      <FlatList
        key={`${ym.y}-${ym.m0}`}
        data={rows}
        keyExtractor={(r) => String(r.day)}
        getItemLayout={(_, i) => ({ length: ROW_H, offset: ROW_H * i, index: i })}
        initialScrollIndex={todayIndex > 2 ? todayIndex - 2 : 0}
        initialNumToRender={31}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
        renderItem={({ item, index }) => {
          const isToday = index === todayIndex;
          const friday = item.weekday === FRIDAY;
          return (
            <PressScale
              accessibilityRole="button"
              accessibilityLabel={`${WEEKDAYS_AR[item.weekday]} ${toArabicIndic(item.day)}`}
              onPress={() => openDay(item)}
              pressedScale={0.985}
              style={[
                styles.row,
                isToday
                  ? { backgroundColor: c.selbg, borderColor: c.accent }
                  : { backgroundColor: 'transparent', borderColor: 'transparent' },
              ]}
            >
              <View style={styles.dayCol}>
                <View style={styles.dayInner}>
                  <View style={[styles.dot, { backgroundColor: c.accent, opacity: isToday ? 1 : 0 }]} />
                  <Text size={13} weight={isToday ? 'bold' : 'semi'} color={c.tp}>
                    {toArabicIndic(item.day)}
                  </Text>
                </View>
                <Text size={10} color={friday ? c.ts : c.tm} weight={friday ? 'semi' : 'regular'}>
                  {WEEKDAYS_AR[item.weekday]}
                </Text>
              </View>
              {PRAYERS.map((p) => (
                <Text
                  key={p.key}
                  size={12.5}
                  weight={isToday ? 'bold' : 'medium'}
                  color={p.isPrayer ? c.tp : c.tm}
                  align="center"
                  style={[styles.timeCol, styles.tabular]}
                >
                  {formatTimeShort(item.byKey[p.key])}
                </Text>
              ))}
            </PressScale>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingBottom: 10,
  },
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
