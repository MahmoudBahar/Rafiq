import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { I18nManager, PixelRatio, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type DerivedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnUI } from 'react-native-worklets';
import { click, warning } from '@/shared/lib/haptics';
import { useMotion } from '@/shared/lib/motion';
import { physicalLeft } from '@/shared/lib/rtl';
import { radius } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { AzkarIcon, ClockIcon, CompassIcon, TasbihIcon, type IconProps } from './Icons';
import { BAR_PAD, ICON, PILL_H, layoutFor, type BarLayout } from './tabBarLayout';
import { tabTravelMs } from './tabMotion';
import { Text } from './Text';

export const TAB_BAR_HEIGHT = PILL_H + BAR_PAD * 2;
export const TAB_BAR_MARGIN = 14;
const SIDE = 24;

/** Distance from the bottom of the window to the top of the floating bar. */
export function useTabBarInset(): number {
  return useSafeAreaInsets().bottom + TAB_BAR_MARGIN + TAB_BAR_HEIGHT;
}

interface Item {
  /** Route name for a live tab; the rest only announce themselves. */
  key: string;
  label: string;
  Icon: ComponentType<IconProps>;
  soon?: boolean;
}

const ITEMS: readonly Item[] = [
  { key: 'index', label: 'الصلاة', Icon: ClockIcon },
  { key: 'azkar', label: 'الأذكار', Icon: AzkarIcon },
  { key: 'tasbih', label: 'التسبيح', Icon: TasbihIcon, soon: true },
  { key: 'qibla', label: 'القبلة', Icon: CompassIcon, soon: true },
];

const LABEL_SIZE = 12.5;
const LABEL_LINE = 19;
/** An intrinsic-width RTL label on Android can measure a hair short and clip. */
const LABEL_SLACK = 2;
/** The settle after arrival, as a fraction of the travel clock. */
const TAIL = 0.3;
const WOBBLE_PX = 5;
const THIN = 0.22;
const MID_BASE = 100;
const PX = PixelRatio.get();

interface Snapshot {
  L: number;
  R: number;
  x: number[];
  lab: number[];
}

interface Frame extends Snapshot {
  scaleY: number;
}

function clamp01(v: number) {
  'worklet';
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function easeOut(t: number) {
  'worklet';
  return 1 - Math.pow(1 - t, 3);
}
function easeInOut(t: number) {
  'worklet';
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
function snap(v: number) {
  'worklet';
  return Math.round(v * PX) / PX;
}

/**
 * The elastic pill at clock `p` (0 → 1 travel, 1 → 1 + TAIL settle). The edge
 * facing the target leaves first and the other edge catches up, so the pill
 * stretches across the gap; it thins while stretched and ends on a small
 * damped wobble. Everything is closed-form on one clock, which is what lets a
 * tap mid-flight restart from the live frame with nothing to cancel.
 */
function frameAt(p: number, from: Snapshot, target: BarLayout, to: number): Frame {
  'worklet';
  const lead = easeOut(clamp01(p / 0.62));
  const trail = easeInOut(clamp01((p - 0.32) / 0.68));
  const movingLeft = target.pillL + target.pillR < from.L + from.R;
  let L = from.L + (target.pillL - from.L) * (movingLeft ? lead : trail);
  let R = from.R + (target.pillR - from.R) * (movingLeft ? trail : lead);
  const u = (p - 1) / TAIL;
  if (u > 0 && u < 1) {
    const wob = WOBBLE_PX * Math.exp(-4 * u) * Math.sin(u * Math.PI * 3) * (movingLeft ? -1 : 1);
    L += wob;
    R += wob;
  }
  const travel = clamp01(p);
  const e = easeInOut(travel);
  const out = 1 - clamp01(p / 0.3);
  const x: number[] = [];
  const lab: number[] = [];
  for (let i = 0; i < target.iconX.length; i++) {
    x.push(from.x[i] + (target.iconX[i] - from.x[i]) * e);
    const fading = from.lab[i] * out;
    lab.push(i === to ? Math.max(fading, clamp01((p - 0.62) / 0.38)) : fading);
  }
  return { L, R, x, lab, scaleY: 1 - THIN * Math.sin(Math.PI * travel) * (from.L === target.pillL ? 0 : 1) };
}

export interface TabBarProps extends BottomTabBarProps {
  /** Called when a not-yet-available tab is tapped. */
  onComingSoon: () => void;
}

/**
 * Floating pill tab bar. It is the navigator's `tabBar`, so it outlives the
 * tab screens and the pill can travel between them. Nothing here lays out
 * during the animation: the pill is two round caps and a scaled strip, icons
 * and labels only translate and fade.
 */
export function TabBar({ state, navigation, onComingSoon }: TabBarProps) {
  const { c } = useTheme();
  const { reduced } = useMotion();
  const insets = useSafeAreaInsets();
  const rtl = I18nManager.isRTL;

  const routeName = state.routes[state.index]?.name;
  const active = Math.max(0, ITEMS.findIndex((it) => it.key === routeName));

  const [barW, setBarW] = useState(0);
  const [labelW, setLabelW] = useState<readonly number[]>(() => ITEMS.map(() => 0));
  const measured = barW > 0 && labelW.every((w) => w > 0);
  const layouts = useMemo(
    () => (measured ? ITEMS.map((_, i) => layoutFor(i, barW, labelW, rtl)) : null),
    [measured, barW, labelW, rtl],
  );

  const table = useSharedValue<BarLayout[]>([]);
  const from = useSharedValue<Snapshot>({ L: 0, R: 0, x: [], lab: [] });
  const to = useSharedValue(active);
  const p = useSharedValue(1 + TAIL);

  // A new measurement (first layout, rotation, font scale) snaps into place.
  useEffect(() => {
    if (!layouts) return;
    const here = layouts[active];
    table.set(layouts);
    from.set({ L: here.pillL, R: here.pillR, x: here.iconX, lab: ITEMS.map((_, i) => (i === active ? 1 : 0)) });
    to.set(active);
    p.set(1 + TAIL);
    // `active` is handled by the effect below; this one is about geometry only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layouts]);

  useEffect(() => {
    scheduleOnUI(() => {
      'worklet';
      const t = table.get();
      if (t.length === 0 || to.get() === active) return;
      const now = frameAt(p.get(), from.get(), t[to.get()], to.get());
      const travel = tabTravelMs(Math.abs(active - to.get()));
      from.set({ L: now.L, R: now.R, x: now.x, lab: now.lab });
      to.set(active);
      if (reduced) {
        p.set(1 + TAIL);
        return;
      }
      p.set(0);
      p.set(withTiming(1 + TAIL, { duration: travel * (1 + TAIL), easing: Easing.linear }));
    });
  }, [active, reduced, table, from, to, p]);

  const cur = useDerivedValue<Frame | null>(() => {
    const t = table.get();
    return t.length === 0 ? null : frameAt(p.get(), from.get(), t[to.get()], to.get());
  });

  const visuals = useAnimatedStyle(() => ({ opacity: cur.get() ? 1 : 0 }));
  const pill = useAnimatedStyle(() => ({ transform: [{ scaleY: cur.get()?.scaleY ?? 1 }] }));
  const capL = useAnimatedStyle(() => ({ transform: [{ translateX: snap(cur.get()?.L ?? 0) }] }));
  const capR = useAnimatedStyle(() => ({ transform: [{ translateX: snap((cur.get()?.R ?? PILL_H) - PILL_H) }] }));
  // The strip scales about its centre, so its translation carries half the change in width.
  const mid = useAnimatedStyle(() => {
    const f = cur.get();
    if (!f) return { transform: [{ translateX: 0 }, { scaleX: 0 }] };
    const l = snap(f.L) + PILL_H / 2 - 1;
    const w = Math.max(0, snap(f.R) - PILL_H / 2 + 1 - l);
    return { transform: [{ translateX: l + (w - MID_BASE) / 2 }, { scaleX: w / MID_BASE }] };
  });

  const press = (item: Item) => {
    if (item.soon) {
      warning();
      onComingSoon();
      return;
    }
    // The tab already open has no key to press: only a change of page clicks.
    if (item.key !== routeName) click();
    const route = state.routes.find((r) => r.name === item.key);
    if (!route) return;
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (item.key !== routeName && !event.defaultPrevented) navigation.navigate(route.name, route.params);
  };

  return (
    <View
      accessibilityRole="tablist"
      onLayout={(e) => setBarW(e.nativeEvent.layout.width)}
      style={[
        styles.bar,
        { bottom: insets.bottom + TAB_BAR_MARGIN, backgroundColor: c.tabbg, boxShadow: `0 10px 26px ${c.shadow}` },
      ]}
    >
      <Animated.View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[StyleSheet.absoluteFill, visuals]}
      >
        <Animated.View style={[styles.pill, pill]}>
          <Animated.View style={[styles.cap, { backgroundColor: c.tabactive }, capL]} />
          <Animated.View style={[styles.cap, { backgroundColor: c.tabactive }, capR]} />
          <Animated.View style={[styles.mid, { backgroundColor: c.tabactive }, mid]} />
        </Animated.View>
        {ITEMS.map((item, i) => (
          <TabVisual
            key={item.key}
            index={i}
            item={item}
            cur={cur}
            idle={c.tabicon}
            labelX={layouts?.[i].labelX ?? 0}
            width={labelW[i]}
            onMeasure={(w) => setLabelW((prev) => (prev[i] === w ? prev : prev.map((v, j) => (j === i ? w : v))))}
          />
        ))}
      </Animated.View>
      {ITEMS.map((item, i) => {
        const hit = layouts?.[active].hit[i];
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityHint={item.soon ? 'قريبًا' : undefined}
            accessibilityState={{ selected: i === active }}
            onPress={() => press(item)}
            style={[styles.hit, hit ? { ...physicalLeft(hit.x), width: hit.w } : styles.hitUnmeasured]}
          />
        );
      })}
    </View>
  );
}

interface TabVisualProps {
  index: number;
  item: Item;
  cur: DerivedValue<Frame | null>;
  idle: string;
  labelX: number;
  width: number;
  onMeasure: (width: number) => void;
}

/**
 * One tab's icon and label. The icon is drawn twice, muted and white, and the
 * white copy fades in exactly while the pill covers it: colour follows the
 * pill's real edges, and no SVG prop is ever animated.
 */
function TabVisual({ index, item, cur, idle, labelX, width, onMeasure }: TabVisualProps) {
  const { Icon } = item;
  const icon = useAnimatedStyle(() => ({ transform: [{ translateX: cur.get()?.x[index] ?? 0 }] }));
  const lit = useAnimatedStyle(() => {
    const f = cur.get();
    if (!f) return { opacity: 0 };
    const cx = f.x[index] + ICON / 2;
    const inside = Math.min(cx - f.L, f.R - cx);
    return { opacity: inside <= -6 ? 0 : inside >= 6 ? 1 : (inside + 6) / 12 };
  });
  const label = useAnimatedStyle(() => {
    const o = cur.get()?.lab[index] ?? 0;
    return { opacity: o, transform: [{ scale: 0.85 + 0.15 * o }] };
  });
  return (
    <>
      <Animated.View style={[styles.icon, icon]}>
        <Icon size={ICON} color={idle} />
        <Animated.View style={[StyleSheet.absoluteFill, lit]}>
          <Icon size={ICON} color="#ffffff" />
        </Animated.View>
      </Animated.View>
      <Animated.View
        collapsable={false}
        onLayout={width > 0 ? undefined : (e) => onMeasure(Math.ceil(e.nativeEvent.layout.width) + LABEL_SLACK)}
        style={[styles.label, physicalLeft(labelX), width > 0 && { width }, label]}
      >
        <Text size={LABEL_SIZE} lineHeight={LABEL_LINE} weight="bold" color="#ffffff" align="center" numberOfLines={1}>
          {item.label}
        </Text>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    start: SIDE,
    end: SIDE,
    height: TAB_BAR_HEIGHT,
    borderRadius: radius.pill,
  },
  pill: { position: 'absolute', top: BAR_PAD, left: 0, right: 0, height: PILL_H },
  // Full circles rather than half-round caps: symmetrical, so forced RTL has nothing to mirror.
  cap: { position: 'absolute', top: 0, ...physicalLeft(0), width: PILL_H, height: PILL_H, borderRadius: PILL_H / 2 },
  mid: { position: 'absolute', top: 0, ...physicalLeft(0), width: MID_BASE, height: PILL_H },
  icon: { position: 'absolute', top: BAR_PAD + (PILL_H - ICON) / 2, ...physicalLeft(0), width: ICON, height: ICON },
  label: { position: 'absolute', top: BAR_PAD + (PILL_H - LABEL_LINE) / 2 },
  hit: { position: 'absolute', top: 0, bottom: 0 },
  hitUnmeasured: { width: 0 },
});
