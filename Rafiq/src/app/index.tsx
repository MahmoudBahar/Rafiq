import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COUNTRY, DEFAULT_CITY } from '@/features/prayer/cities';
import { PrayerList } from '@/features/prayer/PrayerList';
import { SunArc } from '@/features/prayer/SunArc';
import { useCountdown } from '@/features/prayer/useCountdown';
import { formatCountdown, formatTime12 } from '@/shared/lib/arabic';
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

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const { settings } = useSettings();
  const { now, next, h, m, s } = useCountdown(settings.madhab);

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

  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <GradientBackground />
        <View style={styles.topRow}>
          <View style={styles.cityWrap}>
            <PinIcon size={13} color={c.tm} />
            <Text size={13.5} weight="semi">
              {city}، {COUNTRY}
            </Text>
          </View>
          <View style={styles.topEnd}>
            <Text size={12} weight="medium" color={c.tm}>
              {hijriString(now)}
            </Text>
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
            الصلاة القادمة · {next.name}
          </Text>
          <Text size={56} weight="bold" lineHeight={68} style={styles.countdown}>
            {formatCountdown(h, m, s)}
          </Text>
          <Text size={12.5} weight="medium" color={c.ts}>
            الأذان الساعة {formatTime12(next.at.getHours(), next.at.getMinutes())}
          </Text>
        </View>
        <SunArc now={now} madhab={settings.madhab} />
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={[styles.listContent, { paddingBottom: tabBottom + TAB_BAR_HEIGHT + 16 }]}
        showsVerticalScrollIndicator={false}
      >
        <PrayerList now={now} madhab={settings.madhab} nextKey={next.key} />
      </ScrollView>

      <TabBar bottom={tabBottom} onComingSoon={showToast} />
      <Toast message="قريباً في الإصدار القادم إن شاء الله" visible={toast} bottom={tabBottom + TAB_BAR_HEIGHT + 14} />
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
  gear: { width: 36, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  countdownBlock: { alignItems: 'center', paddingTop: 16 },
  countdown: { fontVariant: ['tabular-nums'] },
  headerSpacer: { height: 26 },
  list: { flex: 1 },
  listContent: { paddingTop: 20, paddingHorizontal: 20 },
});
