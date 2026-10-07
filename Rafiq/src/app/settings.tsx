import { BlurTargetView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrayerAzkarTune } from '@/features/azkar/PrayerAzkarTune';
import { CITIES, DEFAULT_CITY, METHODS, METHOD_BY_ID, nearestCity, timeFor } from '@/features/prayer/engine';
import { FineTune } from '@/features/prayer/FineTune';
import { IqamaTune } from '@/features/prayer/IqamaTune';
import { useLocate } from '@/features/prayer/useLocate';
import { usePrayerConfig } from '@/features/prayer/usePrayerConfig';
import { formatTime12, toArabicIndic } from '@/shared/lib/arabic';
import { usePreventBack } from '@/shared/lib/usePreventBack';
import { useSettings, type Madhab, type Method, type MotionMode, type ThemeMode } from '@/shared/storage/settings';
import { radius } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { ChevronBackIcon, ChevronForwardIcon, MonitorIcon, MoonIcon, SunIcon, SunriseIcon } from '@/shared/ui/Icons';
import { Mark } from '@/shared/ui/Mark';
import { PressScale } from '@/shared/ui/PressScale';
import { RadioCard } from '@/shared/ui/RadioCard';
import { SectionLabel } from '@/shared/ui/SectionLabel';
import { Segmented } from '@/shared/ui/Segmented';
import { Display, Text } from '@/shared/ui/Text';
import { DrumPicker, type DrumItem } from '@/shared/ui/DrumPicker';

const APP_VERSION = '1.0';

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const { settings, update } = useSettings();
  const cfg = usePrayerConfig();
  const { locating, error, locate } = useLocate();

  const [sheet, setSheet] = useState<'method' | 'city' | null>(null);
  const blurTarget = useRef<View | null>(null);
  const closeSheet = useCallback(() => setSheet(null), []);
  // Hardware / system back closes the picker instead of popping the screen.
  usePreventBack(sheet !== null, closeSheet);

  const manual = settings.locationMode === 'manual';
  const city = settings.city ?? DEFAULT_CITY;
  const asr = timeFor('asr', cfg, new Date());
  const near = !manual && settings.coords ? nearestCity(settings.coords) : null;
  const autoSub = locating
    ? 'جارٍ تحديد موقعك…'
    : !manual && settings.coords
      ? near
        ? `${near.city.name} · على بعد ${toArabicIndic(Math.round(near.km))} كم`
        : `${city} · مفعّل`
      : 'استخدام GPS';
  const method = METHOD_BY_ID[settings.method] ?? METHOD_BY_ID.egypt;
  const methodItems = useMemo<DrumItem[]>(() => METHODS.map((m) => ({ key: m.id, title: m.name, sub: m.sub })), []);
  const cityItems = useMemo<DrumItem[]>(
    () => CITIES.map((c) => ({ key: c.name, title: c.name, sub: `محافظة ${c.gov}` })),
    [],
  );

  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <BlurTargetView ref={blurTarget} style={styles.screen}>
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
          <Display size={28}>الإعدادات</Display>
        </View>

        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.section}>
            <SectionLabel>الموقع</SectionLabel>
            <RadioCard title="تحديد الموقع تلقائياً" sub={autoSub} selected={!manual} onPress={() => locate()} />
            <RadioCard
              title="اختيار المدينة يدوياً"
              sub={manual ? city : 'اختر مدينتك من القائمة'}
              selected={manual}
              onPress={() =>
                update({
                  locationMode: 'manual',
                  city: manual ? city : DEFAULT_CITY,
                })
              }
            />
            {error ? (
              <Text size={12} color={c.tm} style={styles.caption}>
                {error}
              </Text>
            ) : null}
            {manual ? (
              <PressScale
                accessibilityRole="button"
                accessibilityLabel={`المدينة: ${city}`}
                onPress={() => setSheet('city')}
                pressedScale={0.985}
                style={[styles.methodRow, { backgroundColor: c.surface, borderColor: c.border }]}
              >
                <View style={styles.methodTexts}>
                  <Text size={14.5} weight="semi" numberOfLines={1}>
                    {city}
                  </Text>
                </View>
                <ChevronForwardIcon size={16} color={c.tm} />
              </PressScale>
            ) : null}
          </View>

          <View style={styles.section}>
            <SectionLabel>طريقة الحساب</SectionLabel>
            <PressScale
              accessibilityRole="button"
              accessibilityLabel={`طريقة الحساب: ${method.name}`}
              onPress={() => setSheet('method')}
              pressedScale={0.985}
              style={[styles.methodRow, { backgroundColor: c.surface, borderColor: c.border }]}
            >
              <View style={styles.methodTexts}>
                <Text size={14.5} weight="semi" numberOfLines={1}>
                  {method.name}
                </Text>
                <Text size={12} color={c.tm} numberOfLines={1}>
                  {method.sub}
                </Text>
              </View>
              <ChevronForwardIcon size={16} color={c.tm} />
            </PressScale>
          </View>

          <View style={styles.section}>
            <SectionLabel>مذهب صلاة العصر</SectionLabel>
            <Segmented<Madhab>
              value={settings.madhab}
              onChange={(madhab) => update({ madhab })}
              options={[
                { key: 'shafii', label: 'الجمهور' },
                { key: 'hanafi', label: 'الحنفي' },
              ]}
            />
            <Text size={12} color={c.tm} style={styles.caption}>
              وقت العصر اليوم: {formatTime12(asr)}
            </Text>
          </View>

          <FineTune />

          <IqamaTune />

          <PrayerAzkarTune />

          <View style={styles.section}>
            <SectionLabel>المظهر</SectionLabel>
            <Segmented<ThemeMode>
              value={settings.theme}
              onChange={(theme) => update({ theme })}
              options={[
                {
                  key: 'light',
                  label: 'فاتح',
                  icon: (color) => <SunIcon size={14} color={color} />,
                },
                {
                  key: 'dark',
                  label: 'داكن',
                  icon: (color) => <MoonIcon size={14} color={color} strokeWidth={2} />,
                },
                {
                  key: 'system',
                  label: 'تلقائي',
                  icon: (color) => <MonitorIcon size={14} color={color} />,
                },
                {
                  key: 'daylight',
                  label: 'نهاري',
                  icon: (color) => <SunriseIcon size={14} color={color} />,
                },
              ]}
            />
            <Text size={12} color={c.tm} style={styles.caption}>
              {settings.theme === 'daylight'
                ? 'نهاري: فاتح من الشروق إلى المغرب، وداكن ليلاً'
                : 'تلقائي: يتبع مظهر نظام الجهاز'}
            </Text>
          </View>

          <View style={styles.section}>
            <SectionLabel>الحركة</SectionLabel>
            <Segmented<MotionMode>
              value={settings.motion}
              onChange={(motion) => update({ motion })}
              options={[
                { key: 'system', label: 'تلقائي' },
                { key: 'full', label: 'كاملة' },
                { key: 'reduced', label: 'مخفّضة' },
              ]}
            />
            <Text size={12} color={c.tm} style={styles.caption}>
              {settings.motion === 'reduced'
                ? 'مخفّضة: تظهر العناصر في مكانها مباشرة بلا انتقالات'
                : settings.motion === 'full'
                  ? 'كاملة: الحركة والانتقالات مفعّلة دائماً'
                  : 'تلقائي: يتبع إعداد تقليل الحركة في الجهاز'}
            </Text>
          </View>

          <View style={styles.footer}>
            <Mark size={20} color={c.tp} knockout={c.bg} accent={c.accent} />
            <Text size={11.5} color={c.tm}>
              رفيق · الإصدار {toArabicIndic(APP_VERSION).replace('.', '٫')}
            </Text>
          </View>
        </ScrollView>
      </BlurTargetView>

      <DrumPicker
        visible={sheet === 'method'}
        title="طريقة الحساب"
        items={methodItems}
        selectedKey={settings.method}
        onSelect={(id) => update({ method: id as Method })}
        onClose={closeSheet}
        blurTarget={blurTarget}
      />
      <DrumPicker
        visible={sheet === 'city'}
        title="المدينة"
        items={cityItems}
        selectedKey={city}
        onSelect={(name) => update({ city: name, locationMode: 'manual' })}
        onClose={closeSheet}
        blurTarget={blurTarget}
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
    paddingBottom: 14,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { paddingTop: 6, paddingHorizontal: 20, gap: 22 },
  section: { gap: 9 },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
  methodTexts: { flex: 1, gap: 1 },
  caption: { paddingHorizontal: 4 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingTop: 10,
    opacity: 0.7,
  },
});
