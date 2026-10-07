import { BlurView } from 'expo-blur';
import { useIsFocused, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { BackHandler, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedProps, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AZKAR_SETS, NEW_SET_ORDER, itemsForPrayer, type AzkarSetId } from '@/features/azkar/data';
import { DialBodies } from '@/features/azkar/dial/DialBodies';
import { DialCenter } from '@/features/azkar/dial/DialCenter';
import { DialSky } from '@/features/azkar/dial/DialSky';
import { useDial } from '@/features/azkar/dial/useDial';
import { AzkarDrawer, DRAWER_LIP, DRAWER_OPEN_TOP, type DrawerRow } from '@/features/azkar/drawer/AzkarDrawer';
import { useAzkarDrawer } from '@/features/azkar/drawer/useAzkarDrawer';
import { drawerAction, drawerStatus, drawerTitle, leadSet, type SetStanding } from '@/features/azkar/engine/lead';
import { prayerSessionKey } from '@/features/azkar/engine/window';
import { useAzkarProgress, type AzkarProgress } from '@/features/azkar/progress';
import { useAzkarClock } from '@/features/azkar/time';
import { useSettings } from '@/shared/storage/settings';
import { dialSky } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { useTabBarInset } from '@/shared/ui/TabBar';
import { TabScene } from '@/shared/ui/TabScene';
import { Display } from '@/shared/ui/Text';

const HEADER_H = 64;
const BODY_CLEARANCE = 56;
/** The once-a-day nudge waits for the page to settle. */
const NUDGE_DELAY_MS = 700;

const AnimatedBlur = Animated.createAnimatedComponent(BlurView);

const standingOf = (p: AzkarProgress): SetStanding => ({
  done: p.done,
  total: p.total,
  complete: p.complete,
  started: p.counts.some((n) => n > 0),
});

/**
 * The azkar tab: a dial on the horizon with the sun on one end and the moon on
 * the other. Turning it swaps morning for evening, sky and all. It opens on
 * the side the hour calls for. The ground below the horizon is a drawer that
 * holds the day's other sets: waking, after each prayer, and sleep.
 */
export default function AzkarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const focused = useIsFocused();
  const tabInset = useTabBarInset();
  const clock = useAzkarClock();
  const { settings, update } = useSettings();
  const { side, values, pan, toggle } = useDial(clock.side);
  const latest = clock.latest.key;
  const prayerIndices = useMemo(() => itemsForPrayer(latest).map((p) => p.index), [latest]);
  const progress = {
    morning: useAzkarProgress('morning', clock.dayKey),
    evening: useAzkarProgress('evening', clock.dayKey),
    waking: useAzkarProgress('waking', clock.wakingKey),
    prayer: useAzkarProgress('prayer', prayerSessionKey(clock.dayKey, latest), prayerIndices),
    sleep: useAzkarProgress('sleep', clock.dayKey),
  };

  // The window is the first answer, so the dial is drawn on the very first frame; layout then corrects it.
  const window = useWindowDimensions();
  const [measured, setMeasured] = useState<{ w: number; h: number } | null>(null);
  const size = measured ?? { w: window.width, h: window.height };
  const horizon = size.h - tabInset - DRAWER_LIP;
  const top = insets.top + 12;
  // As large as the width allows, but never so tall that the body on top crowds the text above it.
  const radius = Math.max(90, Math.min(size.w * 0.56, horizon - top - HEADER_H - 190 - BODY_CLEARANCE));
  const centerBottom = horizon - radius - BODY_CLEARANCE;
  const travel = Math.max(0, horizon - (insets.top + DRAWER_OPEN_TOP));

  const drawer = useAzkarDrawer(travel);
  const { k } = drawer.values;
  // Android back closes the drawer first. A tab is never "removed", so this is a plain back listener
  // rather than `usePreventBack`, which guards a screen's own pop.
  const { open: drawerOpen, close: closeDrawer } = drawer;
  useEffect(() => {
    if (!drawerOpen || !focused) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeDrawer();
      return true;
    });
    return () => sub.remove();
  }, [drawerOpen, focused, closeDrawer]);

  // The cues: a nudge once a day, and a breathing handle until the drawer has been opened once.
  const { nudge } = drawer;
  const nudgedToday = settings.azkarNudgeDay === clock.wakingKey;
  useEffect(() => {
    if (!focused || nudgedToday) return;
    const timer = setTimeout(() => {
      nudge();
      update({ azkarNudgeDay: clock.wakingKey });
    }, NUDGE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [focused, nudgedToday, nudge, update, clock.wakingKey]);
  useEffect(() => {
    if (drawer.open && !settings.azkarDrawerOpened) update({ azkarDrawerOpened: true });
  }, [drawer.open, settings.azkarDrawerOpened, update]);

  const { t } = values;
  const onMorning = useAnimatedStyle(() => ({ opacity: 1 - t.get() }));
  const onEvening = useAnimatedStyle(() => ({ opacity: t.get() }));
  // The dial scene drifts up and shrinks a little as the drawer rises: the drawer comes forward, the sky recedes.
  const scene = useAnimatedStyle(() => ({ transform: [{ translateY: -26 * k.get() }, { scale: 1 - 0.04 * k.get() }] }));
  const dim = useAnimatedStyle(() => ({ opacity: 0.5 * k.get() }));
  const blur = useAnimatedProps(() => ({ intensity: 30 * k.get() }));

  const rows: DrawerRow[] = NEW_SET_ORDER.map((set) => {
    const standing = standingOf(progress[set]);
    const lead = set === 'prayer' && clock.window.inWindow;
    return {
      set,
      title: drawerTitle(set, AZKAR_SETS[set].title, latest),
      status: drawerStatus(standing, lead ? clock.window.minutesLeft : null),
      action: drawerAction(standing),
      standing,
      flags: set === 'prayer' ? prayerIndices.map((i) => progress.prayer.counts[i] >= AZKAR_SETS.prayer.items[i].count) : AZKAR_SETS[set].items.map((z, i) => progress[set].counts[i] >= z.count),
      lead,
    };
  });
  const lead = leadSet(clock.window.inWindow, NEW_SET_ORDER, (s) => standingOf(progress[s]));
  const peek = rows.find((r) => r.set === lead) ?? rows[0];

  const start = (set: AzkarSetId) => {
    if (progress[set].complete) progress[set].reset();
    // The reader's sheet rises from wherever the drawer's top is right now.
    const ground = Math.round(horizon + (drawer.open ? -travel : 0));
    router.push({ pathname: '/azkar/[set]', params: { set, ground: String(ground), prayer: latest } });
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
        <View style={styles.screen}>
          <Animated.View
            style={[styles.screen, styles.scene, scene]}
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
          </Animated.View>

          {/* The dial fades and (on iOS) blurs behind the rising drawer; a tap on it closes the drawer. */}
          {Platform.OS === 'ios' ? <AnimatedBlur tint="dark" animatedProps={blur} style={styles.fill} pointerEvents="none" /> : null}
          <Animated.View style={[styles.fill, { backgroundColor: '#041a16' }, dim]} pointerEvents={drawer.open ? 'auto' : 'none'}>
            <Pressable accessibilityRole="button" accessibilityLabel="إغلاق" onPress={drawer.close} style={styles.fill} />
          </Animated.View>

          <AzkarDrawer
            horizon={horizon}
            travel={travel}
            values={drawer.values}
            pan={drawer.pan}
            open={drawer.open}
            peek={peek}
            rows={rows}
            breathing={!settings.azkarDrawerOpened}
            hint="اسحب يمينًا أو يسارًا للتبديل بين الصباح والمساء"
            onToggle={drawer.toggle}
            onStart={start}
          />
        </View>
      </GestureDetector>
    </TabScene>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  fill: { ...StyleSheet.absoluteFill },
  scene: { transformOrigin: 'top' },
  header: { position: 'absolute', left: 0, right: 0 },
  headerLayer: { ...StyleSheet.absoluteFill, justifyContent: 'center' },
  wide: { alignSelf: 'stretch' },
  center: { position: 'absolute', left: 0, right: 0 },
});
