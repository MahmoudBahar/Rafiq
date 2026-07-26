import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CITIES, DEFAULT_CITY, METHODS } from '@/features/prayer/cities';
import { timeFor } from '@/features/prayer/prayerTimes';
import { formatTime12, toArabicIndic } from '@/shared/lib/arabic';
import { useSettings, type Madhab, type ThemeMode } from '@/shared/storage/settings';
import { useTheme } from '@/shared/theme/useTheme';
import { Chip } from '@/shared/ui/Chip';
import { ChevronBackIcon, MonitorIcon, MoonIcon, SunIcon } from '@/shared/ui/Icons';
import { Mark } from '@/shared/ui/Mark';
import { RadioCard } from '@/shared/ui/RadioCard';
import { SectionLabel } from '@/shared/ui/SectionLabel';
import { Segmented } from '@/shared/ui/Segmented';
import { Display, Text } from '@/shared/ui/Text';

const APP_VERSION = '1.0';

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const { settings, update } = useSettings();

  const manual = settings.locationMode === 'manual';
  const city = settings.city ?? DEFAULT_CITY;
  const asr = timeFor('asr', settings.madhab);

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
        <Display size={28}>الإعدادات</Display>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <SectionLabel>الموقع</SectionLabel>
          <RadioCard
            title="تحديد الموقع تلقائياً"
            sub={manual ? 'استخدام GPS' : `${city} · مفعّل`}
            selected={!manual}
            onPress={() => update({ locationMode: 'auto', city: DEFAULT_CITY })}
          />
          <RadioCard
            title="اختيار المدينة يدوياً"
            sub={manual ? city : 'اختر مدينتك من القائمة'}
            selected={manual}
            onPress={() => update({ locationMode: 'manual' })}
          />
          {manual ? (
            <View style={styles.chips}>
              {CITIES.map((name) => (
                <Chip
                  key={name}
                  label={name}
                  selected={city === name}
                  onPress={() => update({ city: name, locationMode: 'manual' })}
                />
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <SectionLabel>طريقة الحساب</SectionLabel>
          {METHODS.map((m) => (
            <RadioCard
              key={m.id}
              title={m.name}
              sub={m.sub}
              selected={settings.method === m.id}
              onPress={() => update({ method: m.id })}
            />
          ))}
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
            وقت العصر اليوم: {formatTime12(asr[0], asr[1])}
          </Text>
        </View>

        <View style={styles.section}>
          <SectionLabel>المظهر</SectionLabel>
          <Segmented<ThemeMode>
            value={settings.theme}
            onChange={(theme) => update({ theme })}
            options={[
              { key: 'light', label: 'فاتح', icon: (color) => <SunIcon size={14} color={color} /> },
              { key: 'dark', label: 'داكن', icon: (color) => <MoonIcon size={14} color={color} strokeWidth={2} /> },
              { key: 'system', label: 'تلقائي', icon: (color) => <MonitorIcon size={14} color={color} /> },
            ]}
          />
          <Text size={12} color={c.tm} style={styles.caption}>
            تلقائي: يتبع مظهر نظام الجهاز
          </Text>
        </View>

        <View style={styles.footer}>
          <Mark size={20} color={c.tp} knockout={c.bg} accent={c.accent} />
          <Text size={11.5} color={c.tm}>
            رفيق · الإصدار {toArabicIndic(APP_VERSION).replace('.', '٫')}
          </Text>
        </View>
      </ScrollView>
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 4, paddingHorizontal: 2 },
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
