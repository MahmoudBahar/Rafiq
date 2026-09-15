import { BlurTargetView } from 'expo-blur';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { CITIES, DEFAULT_CITY } from '@/features/prayer/engine';
import { useLocate } from '@/features/prayer/useLocate';
import { useMotion } from '@/shared/lib/motion';
import { useSettings } from '@/shared/storage/settings';
import { radius } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { Button } from '@/shared/ui/Button';
import { DrumPicker, type DrumItem } from '@/shared/ui/DrumPicker';
import { GradientBackground } from '@/shared/ui/GradientBackground';
import { CrosshairIcon, PinIcon } from '@/shared/ui/Icons';
import { Mark } from '@/shared/ui/Mark';
import { Display, Text } from '@/shared/ui/Text';

const CITY_ITEMS: DrumItem[] = CITIES.map((c) => ({ key: c.name, title: c.name, sub: `محافظة ${c.gov}` }));

export default function OnboardingScreen() {
  const [step, setStep] = useState<1 | 2>(1);
  const { update } = useSettings();
  const blurTarget = useRef<View | null>(null);
  const [wheel, setWheel] = useState(false);
  const [picked, setPicked] = useState(DEFAULT_CITY);
  const openWheel = useCallback(() => setWheel(true), []);
  // The wheel only stages the choice; onboarding flips when it closes so the
  // route guard never pops this screen mid-scroll.
  const confirmCity = useCallback(() => {
    setWheel(false);
    update({ city: picked, locationMode: 'manual', onboarded: true });
  }, [picked, update]);

  return (
    <View style={styles.screen}>
      <BlurTargetView ref={blurTarget} style={styles.screen}>
        <GradientBackground />
        {step === 1 ? (
          <WelcomeStep key="welcome" onNext={() => setStep(2)} />
        ) : (
          <LocationStep key="location" onManual={openWheel} />
        )}
      </BlurTargetView>
      <DrumPicker
        visible={wheel}
        title="المدينة"
        items={CITY_ITEMS}
        selectedKey={picked}
        onSelect={setPicked}
        onClose={confirmCity}
        blurTarget={blurTarget}
      />
    </View>
  );
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  const { c } = useTheme();
  const m = useMotion();
  return (
    <Animated.View exiting={m.fadeOut()} style={styles.center}>
      <Animated.View
        entering={m.fadeInUp(0)}
        style={[styles.heroTile, { backgroundColor: c.hero, boxShadow: `0 12px 32px ${c.shadow}` }]}
      >
        <Mark size={72} color={c.skybot} knockout={c.hero} accent={c.accent} />
      </Animated.View>
      <Animated.View entering={m.fadeInUp(150)} style={styles.titleBlock}>
        <Display size={46} align="center">
          رفيق
        </Display>
        <Text size={14.5} weight="medium" color={c.ts} align="center">
          رفيقك في الصلاة والذكر
        </Text>
      </Animated.View>
      <Animated.View entering={m.fadeInUp(300)} style={styles.startWrap}>
        <Button label="ابدأ" onPress={onNext} style={styles.startButton} />
      </Animated.View>
    </Animated.View>
  );
}

function LocationStep({ onManual }: { onManual: () => void }) {
  const { c } = useTheme();
  const m = useMotion();
  const { locating, error, cannotAskAgain, locate } = useLocate();

  const useGps = async () => {
    // `onboarded` rides along in the same update so the route guard flips exactly once.
    const ok = await locate({ onboarded: true });
    if (!ok) onManual();
  };
  const showOpenSettings = cannotAskAgain && Platform.OS !== 'web';

  return (
    <Animated.View entering={m.fadeInDown()} style={[styles.center, styles.locationCenter]}>
      <View style={[styles.pinCircle, { backgroundColor: c.surface, borderColor: c.border }]}>
        <PinIcon size={36} color={c.accent} strokeWidth={1.8} />
        {locating ? <Spinner color={c.accent} /> : null}
      </View>
      <View style={styles.copy}>
        <Display size={32} align="center">
          أين تصلي؟
        </Display>
        <Text size={14} color={c.ts} align="center" lineHeight={24} style={styles.body}>
          نحتاج موقعك لحساب مواقيت الصلاة بدقة في مدينتك. لا نشارك موقعك مع أي جهة.
        </Text>
      </View>
      <View style={styles.actions}>
        <Button
          label={locating ? 'جارٍ تحديد موقعك…' : 'استخدام موقعي الحالي'}
          onPress={useGps}
          icon={<CrosshairIcon size={15} color={c.herotext} />}
        />
        <Button label="اختيار المدينة يدوياً" variant="secondary" onPress={onManual} />
        {showOpenSettings ? (
          <Button label="فتح إعدادات الجهاز" variant="secondary" onPress={() => Linking.openSettings()} />
        ) : null}
      </View>
      {error ? (
        <Text size={12.5} color={c.tm} align="center" lineHeight={20} style={styles.body}>
          {error}
        </Text>
      ) : null}
    </Animated.View>
  );
}

/** Rotating arc around the location circle while "locating". */
function Spinner({ color }: { color: string }) {
  const rot = useSharedValue(0);
  useEffect(() => {
    rot.set(withRepeat(withTiming(360, { duration: 1100, easing: Easing.linear }), -1, false));
  }, [rot]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.get()}deg` }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.spinner, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100">
        <Circle cx="50" cy="50" r="47" fill="none" stroke={color} strokeWidth={2.5} strokeDasharray="70 226" strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    start: 0,
    end: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 22,
    paddingHorizontal: 36,
  },
  locationCenter: { gap: 16, paddingHorizontal: 32 },
  heroTile: {
    width: 112,
    height: 112,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: { alignItems: 'center' },
  startWrap: { marginTop: 18 },
  startButton: { paddingVertical: 16, paddingHorizontal: 52 },
  pinCircle: {
    width: 86,
    height: 86,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: { position: 'absolute', top: -8, bottom: -8, start: -8, end: -8 },
  copy: { alignItems: 'center', gap: 6 },
  body: { maxWidth: 280 },
  actions: { width: '100%', maxWidth: 300, gap: 10, marginTop: 12 },
});
