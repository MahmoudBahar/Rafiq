import { useIsFocused, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DialBodies } from '@/features/azkar/dial/DialBodies';
import { DialCenter } from '@/features/azkar/dial/DialCenter';
import { DialSky } from '@/features/azkar/dial/DialSky';
import { useDial } from '@/features/azkar/dial/useDial';
import type { AzkarSetId } from '@/features/azkar/data';
import { useAzkarProgress } from '@/features/azkar/progress';
import { useAzkarClock } from '@/features/azkar/time';
import { dialSky } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { useTabBarInset } from '@/shared/ui/TabBar';
import { TabScene } from '@/shared/ui/TabScene';
import { Display, Text } from '@/shared/ui/Text';

/** Ground showing above the floating bar; the hint line lives on it. */
const GROUND_LIP = 46;
const HEADER_H = 64;
const BODY_CLEARANCE = 56;

/**
 * The azkar tab: a dial on the horizon with the sun on one end and the moon on
 * the other. Turning it swaps morning for evening, sky and all. It opens on
 * the side the hour calls for.
 */
export default function AzkarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const focused = useIsFocused();
  const tabInset = useTabBarInset();
  const clock = useAzkarClock();
  const { side, values, pan, toggle } = useDial(clock.side);
  const progress = {
    morning: useAzkarProgress('morning', clock.dayKey),
    evening: useAzkarProgress('evening', clock.dayKey),
  };

  // The window is the first answer, so the dial is drawn on the very first frame; layout then corrects it.
  const window = useWindowDimensions();
  const [measured, setMeasured] = useState<{ w: number; h: number } | null>(null);
  const size = measured ?? { w: window.width, h: window.height };
  const horizon = size.h - tabInset - GROUND_LIP;
  const top = insets.top + 12;
  // As large as the width allows, but never so tall that the body on top crowds the text above it.
  const radius = Math.max(90, Math.min(size.w * 0.56, horizon - top - HEADER_H - 190 - BODY_CLEARANCE));
  const centerBottom = horizon - radius - BODY_CLEARANCE;

  const { t } = values;
  const onMorning = useAnimatedStyle(() => ({ opacity: 1 - t.get() }));
  const onEvening = useAnimatedStyle(() => ({ opacity: t.get() }));

  const start = (set: AzkarSetId) => {
    if (progress[set].complete) progress[set].reset();
    router.push({ pathname: '/azkar/[set]', params: { set, ground: String(Math.round(horizon)) } });
  };

  return (
    <TabScene
      name="azkar"
      index={1}
      slot={1}
      // Clipped to the page: the dial's ring is wider than the screen, and would otherwise hang over
      // the neighbouring tab while the pages slide. The page's own colour is the ground's: a sky
      // colour here showed as a light hairline down the edge of the ground band during the slide.
      style={{ overflow: 'hidden', backgroundColor: c.bg }}
      onLayout={(e) => setMeasured({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {focused ? <StatusBar style={side === 'morning' ? 'dark' : 'light'} /> : null}
      <GestureDetector gesture={pan}>
        <View
          style={styles.screen}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="وقت الأذكار"
          accessibilityValue={{ text: side === 'morning' ? 'الصباح' : 'المساء' }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={toggle}
        >
          <DialSky values={values} horizon={horizon} />
          <DialBodies values={values} cx={size.w / 2} cy={horizon} radius={radius} />

          <View style={[styles.header, { top, height: HEADER_H }]} pointerEvents="none">
            <Animated.View style={[styles.headerLayer, onMorning]}>
              <Display size={32} color={dialSky.morning.text} align="center" style={styles.wide}>
                الأذكار
              </Display>
            </Animated.View>
            <Animated.View style={[styles.headerLayer, onEvening]}>
              <Display size={32} color={dialSky.evening.text} align="center" style={styles.wide}>
                الأذكار
              </Display>
            </Animated.View>
          </View>

          <View style={[styles.center, { top: top + HEADER_H, height: centerBottom - top - HEADER_H }]} pointerEvents="box-none">
            <DialCenter values={values} side={side} progress={progress} onStart={start} />
          </View>

          <View style={[styles.ground, { top: horizon, backgroundColor: c.bg }]} pointerEvents="none">
            <Text size={11.5} color={c.tm} align="center" style={styles.hint}>
              اسحب يمينًا أو يسارًا للتبديل بين الصباح والمساء
            </Text>
          </View>
        </View>
      </GestureDetector>
    </TabScene>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { position: 'absolute', left: 0, right: 0 },
  headerLayer: { ...StyleSheet.absoluteFill, justifyContent: 'center' },
  wide: { alignSelf: 'stretch' },
  center: { position: 'absolute', left: 0, right: 0 },
  ground: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopStartRadius: 32,
    borderTopEndRadius: 32,
  },
  hint: { alignSelf: 'stretch', marginTop: 14 },
});
