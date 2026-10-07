import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { GestureDetector, type PanGesture } from 'react-native-gesture-handler';
import Animated, {
  FadeInUp,
  FadeOut,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useMotion } from '@/shared/lib/motion';
import { radius } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { PressScale } from '@/shared/ui/PressScale';
import { Display, Text } from '@/shared/ui/Text';
import type { AzkarSetId } from '../data';
import type { SetStanding } from '../engine/lead';
import type { DrawerValues } from './useAzkarDrawer';

/** The band's closed height above the tab bar: hint, handle and the peek row. */
export const DRAWER_LIP = 134;
/** The band's top when open, below the status bar. */
export const DRAWER_OPEN_TOP = 110;
const ROW_STAGGER_MS = 70;
const BREATH_MS = 1200;

export interface DrawerRow {
  set: AzkarSetId;
  title: string;
  status: string;
  action: string;
  standing: SetStanding;
  /** Per entry, whether it is done: the progress line. */
  flags: readonly boolean[];
  /** The set the clock calls for: it carries the ember. */
  lead: boolean;
}

interface AzkarDrawerProps {
  /** Where the band's top sits when closed, in screen px. */
  horizon: number;
  /** How far up it travels. */
  travel: number;
  values: DrawerValues;
  pan: PanGesture;
  open: boolean;
  /** The row the band shows while closed: the set the clock calls for. */
  peek: DrawerRow;
  rows: readonly DrawerRow[];
  /** The handle breathes until the drawer has been opened once. */
  breathing: boolean;
  hint: string;
  onToggle: () => void;
  onStart: (set: AzkarSetId) => void;
}

/**
 * The ground band below the dial, as a drawer. Closed it shows a handle and
 * the one set that is up now; pulled up it lists the three sets with their
 * progress. The handle breathes in the accent until the drawer has been
 * opened once, and folds into a chevron while it is open.
 */
export function AzkarDrawer({ horizon, travel, values, pan, open, peek, rows, breathing, hint, onToggle, onStart }: AzkarDrawerProps) {
  const { c } = useTheme();
  const { reduced } = useMotion();
  const { y, k } = values;

  const band = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  const peekStyle = useAnimatedStyle(() => ({ opacity: 1 - k.get() * 1.6, transform: [{ translateY: k.get() * -8 }] }));
  const lift = useAnimatedStyle(() => ({ shadowOpacity: 0.08 + 0.16 * k.get(), elevation: 6 + 10 * k.get() }));

  // The handle: a pill that breathes while the drawer has never been opened, folding into a chevron as it opens.
  const breath = useSharedValue(0);
  useEffect(() => {
    breath.set(breathing && !reduced ? withRepeat(withTiming(1, { duration: BREATH_MS }), -1, true) : withTiming(0, { duration: 200 }));
  }, [breath, breathing, reduced]);
  const pill = useAnimatedStyle(() => ({
    opacity: 1 - k.get(),
    backgroundColor: interpolateColor(breath.get(), [0, 1], [c.selbr, c.accent]),
    transform: [{ scaleX: 1 + 0.5 * breath.get() }],
  }));
  // Two bars fold up into a chevron as the band rises. Each turns about its inner end, so the two
  // ends stay on one point and their round caps make the tip.
  const barL = useAnimatedStyle(() => ({ opacity: k.get(), transform: [{ rotate: `${30 * k.get()}deg` }] }));
  const barR = useAnimatedStyle(() => ({ opacity: k.get(), transform: [{ rotate: `${-30 * k.get()}deg` }] }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[styles.band, { top: horizon, height: travel + DRAWER_LIP + 200, backgroundColor: c.bg, shadowColor: c.tp }, band, lift]}
        accessibilityRole="adjustable"
        accessibilityLabel="أذكار اليوم الأخرى"
        accessibilityValue={{ text: open ? 'مفتوح' : 'مغلق' }}
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={onToggle}
      >
        <Text size={11.5} color={c.tm} align="center" style={styles.hint}>
          {hint}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel={open ? 'إغلاق' : 'المزيد من الأذكار'} onPress={onToggle} hitSlop={14} style={styles.handleHit}>
          <Animated.View style={[styles.pill, pill]} />
          <Animated.View style={[styles.bar, styles.barLeft, { backgroundColor: c.accent }, barL]} />
          <Animated.View style={[styles.bar, styles.barRight, { backgroundColor: c.accent }, barR]} />
        </Pressable>

        <Animated.View style={[styles.peek, peekStyle]} pointerEvents={open ? 'none' : 'box-none'}>
          <View style={styles.texts}>
            <Display size={24}>{peek.title}</Display>
            <Text size={11.5} color={c.tm}>
              {peek.status}
            </Text>
          </View>
          <PressScale accessibilityRole="button" accessibilityLabel={`${peek.action} ${peek.title}`} pressedScale={0.95} onPress={() => onStart(peek.set)} style={[styles.cta, { backgroundColor: c.accent }]}>
            <Text size={12.5} weight="bold" color="#ffffff" align="center">
              {peek.action}
            </Text>
          </PressScale>
        </Animated.View>

        {open ? (
          <View style={styles.rows}>
            {rows.map((row, i) => (
              <Animated.View
                key={row.set}
                entering={reduced ? undefined : FadeInUp.delay(i * ROW_STAGGER_MS).springify().damping(14).stiffness(170)}
                exiting={reduced ? undefined : FadeOut.duration(120)}
              >
                <PressScale
                  accessibilityRole="button"
                  accessibilityLabel={`${row.action} ${row.title}، ${row.status}`}
                  pressedScale={0.98}
                  onPress={() => onStart(row.set)}
                  style={[styles.row, { backgroundColor: c.surface, borderColor: row.lead ? c.accent : c.border }]}
                >
                  <View style={styles.texts}>
                    <View style={styles.titleRow}>
                      {row.lead ? <Ember color={c.accent} /> : null}
                      <Display size={22}>{row.title}</Display>
                    </View>
                    <Text size={11.5} color={c.tm}>
                      {row.status}
                    </Text>
                    <View style={styles.segments} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                      {row.flags.map((f, j) => (
                        <View key={j} style={[styles.segment, { backgroundColor: f ? c.accent : c.selbr }]} />
                      ))}
                    </View>
                  </View>
                  <View style={[styles.cta, styles.ghost, { borderColor: c.selbr }]}>
                    <Text size={12.5} weight="bold" color={c.tp} align="center">
                      {row.action}
                    </Text>
                  </View>
                </PressScale>
              </Animated.View>
            ))}
          </View>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}

/** A small breathing dot: the set the hour calls for. */
function Ember({ color }: { color: string }) {
  const { reduced } = useMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(reduced ? 0 : withRepeat(withTiming(1, { duration: 900 }), -1, true));
  }, [reduced, t]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 - 0.25 * t.get() }], opacity: 1 - 0.3 * t.get() }));
  return <Animated.View style={[styles.ember, { backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopStartRadius: 32,
    borderTopEndRadius: 32,
    paddingHorizontal: 18,
    shadowOffset: { width: 0, height: -6 },
    shadowRadius: 18,
  },
  hint: { alignSelf: 'stretch', marginTop: 12 },
  handleHit: { alignSelf: 'center', width: 44, height: 22, marginTop: 4, alignItems: 'center', justifyContent: 'center' },
  pill: { width: 44, height: 5, borderRadius: 3 },
  bar: { position: 'absolute', top: 6, width: 14, height: 3, borderRadius: 2 },
  barLeft: { left: 8, transformOrigin: 'right center' },
  barRight: { left: 22, transformOrigin: 'left center' },
  peek: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cta: { paddingVertical: 8, paddingHorizontal: 18, borderRadius: radius.pill },
  ghost: { borderWidth: 1 },
  rows: { marginTop: 14, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14 },
  segments: { flexDirection: 'row', gap: 2, marginTop: 5 },
  segment: { flex: 1, height: 3, borderRadius: 2 },
  ember: { width: 8, height: 8, borderRadius: 4 },
});
