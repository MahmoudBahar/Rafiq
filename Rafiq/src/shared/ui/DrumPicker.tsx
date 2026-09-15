import { BlurView } from 'expo-blur';
import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { click, detent, stop } from '@/shared/lib/haptics';
import { useMotion } from '@/shared/lib/motion';
import { radius } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { ChevronBackIcon } from './Icons';
import { useClick } from './PressScale';
import { Text } from './Text';

export interface DrumItem {
  key: string;
  title: string;
  sub?: string;
}

export interface DrumPickerProps {
  visible: boolean;
  title: string;
  items: DrumItem[];
  selectedKey: string;
  /** Called whenever the wheel settles on a new item (auto-apply). */
  onSelect: (key: string) => void;
  onClose: () => void;
  /** Fires once per focused-index change while the wheel moves (the tick haptic is built in). */
  onFocusChange?: (index: number) => void;
  /** Android: ref of the `BlurTargetView` wrapping the content behind the picker. */
  blurTarget?: RefObject<View | null>;
}

const ITEM_H = 60;
const VISIBLE = 5;
const LIST_H = ITEM_H * VISIBLE;
const PAD = ITEM_H * 2;
const MAX_PANEL_W = 360;
const SPRING = { damping: 16, stiffness: 190, mass: 0.9 };

// Wheel physics. The finger drives a raw offset through a gear ratio; detents
// pull the displayed offset toward the nearest row (cogging), the ends
// rubber-band, and a flick decays exponentially to a projected stop that is
// snapped to a row. Together they make the wheel feel heavy: each row costs
// a deliberate push and a flick carries only a handful of rows.
const DRAG_GAIN = 0.85;
// Below ITEM_H / 2π (≈ 0.159) the raw→displayed mapping stays monotonic.
const COG_AMPLITUDE = ITEM_H * 0.14;
const RUBBER = 0.35;
const DECAY_PER_MS = 0.992;
const MAX_FLICK_ROWS = 8;
const SNAP_SPRING = { damping: 24, stiffness: 260, mass: 0.8 };
const EDGE_SPRING = { damping: 22, stiffness: 260 };
const TAU = Math.PI * 2;
// Rows further than this from the lens are fully outside the visible wheel.
const FAR_ROWS = 3.2;
// Rows mounted on each side of the lens (visible: 2 either side).
const WINDOW = 7;
const FAR_STYLE = { opacity: 0, transform: [{ perspective: 600 }, { rotateX: '0deg' }, { scale: 1 }, { translateY: 0 }] };

/**
 * Centred drum picker: items snap into a fixed lens; neighbours shrink, fade
 * and tilt away like a physical wheel. Selection applies when the wheel
 * settles. Backdrop is dimmed and blurred (Android 12+ RenderNode blur,
 * tint-only fallback on older Android).
 */
export function DrumPicker({
  visible,
  title,
  items,
  selectedKey,
  onSelect,
  onClose,
  onFocusChange,
  blurTarget,
}: DrumPickerProps) {
  const { c, isDark } = useTheme();
  const { reduced } = useMotion();
  const { width: W } = useWindowDimensions();
  const panelW = Math.min(W - 40, MAX_PANEL_W);
  const maxY = Math.max(0, items.length - 1) * ITEM_H;

  const selectedIndex = Math.max(
    0,
    items.findIndex((i) => i.key === selectedKey),
  );

  // Stay mounted while the close animation plays; `openIndex` is frozen at
  // open time so live selection updates don't re-scroll the wheel.
  const [prevVisible, setPrevVisible] = useState(visible);
  const [closing, setClosing] = useState(false);
  const [openIndex, setOpenIndex] = useState(selectedIndex);
  // Only rows near the lens are mounted; `center` follows the wheel per detent.
  const [center, setCenter] = useState(selectedIndex);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) {
      setOpenIndex(selectedIndex);
      setCenter(selectedIndex);
    } else {
      setClosing(true);
    }
  }
  const mounted = visible || closing;

  const dim = useSharedValue(0);
  const panelOp = useSharedValue(0);
  const panelScale = useSharedValue(0.94);
  const scrollY = useSharedValue(0);
  const dragStart = useSharedValue(0);
  const overEdge = useSharedValue(false);
  // True once a touch has dragged; a row press after a drag is not a tap.
  const dragged = useSharedValue(false);
  // Ticks are armed by the first touch, so positioning the wheel on open is silent.
  const armed = useSharedValue(false);

  const onDetent = useCallback(
    (index: number) => {
      detent();
      setCenter(index);
      onFocusChange?.(index);
    },
    [onFocusChange],
  );
  const finishClose = useCallback(() => setClosing(false), []);
  const settle = useCallback(
    (index: number) => {
      const key = items[index]?.key;
      if (key && key !== selectedKey) onSelect(key);
    },
    [items, onSelect, selectedKey],
  );
  // Landing is silent: the last detent already clicked.
  const land = settle;

  useEffect(() => {
    if (visible) {
      armed.set(false);
      cancelAnimation(scrollY);
      scrollY.set(openIndex * ITEM_H);
      if (reduced) {
        dim.set(1);
        panelOp.set(1);
        panelScale.set(1);
      } else {
        dim.set(withTiming(1, { duration: 220 }));
        panelOp.set(withTiming(1, { duration: 200 }));
        panelScale.set(withSpring(1, SPRING));
      }
      return;
    }
    if (!closing) return;
    if (reduced) {
      dim.set(0);
      panelOp.set(0);
      scheduleOnRN(finishClose);
      return;
    }
    dim.set(withTiming(0, { duration: 180 }));
    panelScale.set(withTiming(0.97, { duration: 160 }));
    panelOp.set(
      withTiming(0, { duration: 160 }, (finished) => {
        'worklet';
        if (finished) scheduleOnRN(finishClose);
      }),
    );
  }, [visible, closing, reduced, openIndex, dim, panelOp, panelScale, scrollY, armed, finishClose]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-6, 6])
        .failOffsetX([-14, 14])
        .onBegin(() => {
          // Touching a moving wheel catches it.
          cancelAnimation(scrollY);
          dragStart.set(scrollY.get());
          overEdge.set(false);
          dragged.set(false);
          armed.set(true);
        })
        .onUpdate((e) => {
          dragged.set(true);
          const raw = dragStart.get() - e.translationY * DRAG_GAIN;
          let y: number;
          if (raw < 0) {
            y = raw * RUBBER;
          } else if (raw > maxY) {
            y = maxY + (raw - maxY) * RUBBER;
          } else {
            y = reduced ? raw : raw - COG_AMPLITUDE * Math.sin((TAU * raw) / ITEM_H);
          }
          const outside = raw < 0 || raw > maxY;
          if (outside && !overEdge.get()) {
            overEdge.set(true);
            scheduleOnRN(stop);
          } else if (!outside && overEdge.get()) {
            overEdge.set(false);
          }
          scrollY.set(y);
        })
        .onEnd((e) => {
          const y = scrollY.get();
          const v = -e.velocityY; // px/s along scrollY
          if (y < 0 || y > maxY) {
            const edge = y < 0 ? 0 : maxY;
            if (reduced) {
              scrollY.set(edge);
              scheduleOnRN(land, edge / ITEM_H);
              return;
            }
            scrollY.set(
              withSpring(edge, { ...EDGE_SPRING, velocity: v }, (finished) => {
                'worklet';
                if (finished) scheduleOnRN(land, edge / ITEM_H);
              }),
            );
            return;
          }
          // Projected stop under exponential decay, clamped to a sane flick, snapped to a row.
          const vms = v / 1000;
          let dist = vms / (1 - DECAY_PER_MS);
          dist = Math.max(-MAX_FLICK_ROWS * ITEM_H, Math.min(MAX_FLICK_ROWS * ITEM_H, dist));
          const target = Math.max(0, Math.min(maxY, Math.round((y + dist) / ITEM_H) * ITEM_H));
          const index = target / ITEM_H;
          if (reduced) {
            scrollY.set(target);
            scheduleOnRN(land, index);
            return;
          }
          const done = (finished?: boolean) => {
            'worklet';
            if (finished) scheduleOnRN(land, index);
          };
          if (Math.abs(target - y) < ITEM_H) {
            scrollY.set(withSpring(target, { ...SNAP_SPRING, velocity: v }, done));
          } else {
            const duration = Math.max(240, Math.min(800, 200 + Math.abs(target - y) * 1.1));
            scrollY.set(withTiming(target, { duration, easing: Easing.out(Easing.poly(4)) }, done));
          }
        }),
    [armed, dragStart, dragged, land, maxY, overEdge, reduced, scrollY],
  );

  const focused = useDerivedValue(() => {
    const idx = Math.round(scrollY.get() / ITEM_H);
    return Math.min(Math.max(idx, 0), items.length - 1);
  });
  useAnimatedReaction(
    () => focused.get(),
    (cur, prev) => {
      if (prev !== null && cur !== prev && armed.get()) scheduleOnRN(onDetent, cur);
    },
  );

  const backdropStyle = useAnimatedStyle(() => ({ opacity: dim.get() }));
  const panelStyle = useAnimatedStyle(() => ({
    opacity: panelOp.get(),
    transform: [{ scale: panelScale.get() }],
  }));
  const columnStyle = useAnimatedStyle(() => ({ transform: [{ translateY: PAD - scrollY.get() }] }));

  if (!mounted) return null;

  // Tapping the selected row is a button press (it closes the picker) and
  // clicks; tapping another row only turns the wheel, whose detents speak.
  const onRowPress = (item: DrumItem, index: number) => {
    if (dragged.get()) return;
    if (item.key === selectedKey && index === Math.round(scrollY.get() / ITEM_H)) {
      click();
      onClose();
      return;
    }
    armed.set(true);
    onSelect(item.key);
    cancelAnimation(scrollY);
    const target = index * ITEM_H;
    if (reduced) {
      scrollY.set(target);
      return;
    }
    scrollY.set(withTiming(target, { duration: 280, easing: Easing.out(Easing.cubic) }));
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
        <BlurView
          style={StyleSheet.absoluteFill}
          intensity={25}
          tint={isDark ? 'dark' : 'light'}
          blurMethod="dimezisBlurViewSdk31Plus"
          blurTarget={blurTarget}
        />
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(0,0,0,0.45)' : 'rgba(14,60,53,0.28)' }]}
        />
        <Pressable accessibilityRole="button" accessibilityLabel="إغلاق" style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <View style={styles.centre} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.panel,
            { width: panelW, backgroundColor: c.surface, boxShadow: `0 16px 40px ${c.shadow}` },
            panelStyle,
          ]}
        >
          <Text size={15} weight="bold" align="center" style={styles.title}>
            {title}
          </Text>

          <GestureDetector gesture={pan}>
            <View style={styles.wheel}>
              <Animated.View style={[styles.column, { height: items.length * ITEM_H }, columnStyle]}>
                {items.map((item, index) =>
                  Math.abs(index - center) <= WINDOW ? (
                    <DrumRow
                      key={item.key}
                      item={item}
                      index={index}
                      scrollY={scrollY}
                      selected={item.key === selectedKey}
                      reduced={reduced}
                      onPress={() => onRowPress(item, index)}
                    />
                  ) : null,
                )}
              </Animated.View>
              <View pointerEvents="none" style={[styles.lens, { borderColor: c.accent }]} />
              <View pointerEvents="none" style={styles.pointer}>
                <ChevronBackIcon size={16} color={c.accent} strokeWidth={2.6} />
              </View>
            </View>
          </GestureDetector>

          <PressableDone onPress={onClose} color={c.accent} />
        </Animated.View>
      </View>
    </View>
  );
}

function PressableDone({ onPress, color }: { onPress: () => void; color: string }) {
  const press = useClick(onPress);
  return (
    <Pressable accessibilityRole="button" {...press} style={styles.done}>
      <Text size={13.5} weight="bold" color={color}>
        تم
      </Text>
    </Pressable>
  );
}

interface DrumRowProps {
  item: DrumItem;
  index: number;
  scrollY: SharedValue<number>;
  selected: boolean;
  reduced: boolean;
  onPress: () => void;
}

function DrumRow({ item, index, scrollY, selected, reduced, onPress }: DrumRowProps) {
  const { c } = useTheme();
  const style = useAnimatedStyle(() => {
    const raw = (scrollY.get() - index * ITEM_H) / ITEM_H;
    // Rows outside the lens window are off-screen: a constant style costs
    // nothing per frame, which keeps an 80-row wheel as smooth as a 10-row one.
    if (raw > FAR_ROWS || raw < -FAR_ROWS) return FAR_STYLE;
    const d = Math.max(-2.5, Math.min(2.5, raw));
    const a = Math.abs(d);
    const opacity = interpolate(a, [0, 1, 2.5], [1, 0.55, 0.25]);
    if (reduced) return { opacity };
    return {
      opacity,
      transform: [
        { perspective: 600 },
        { rotateX: `${interpolate(d, [-2.5, 0, 2.5], [-55, 0, 55])}deg` },
        { scale: interpolate(a, [0, 1, 2.5], [1, 0.92, 0.8]) },
        { translateY: interpolate(d, [-2.5, 0, 2.5], [-14, 0, 14]) },
      ],
    };
  });
  return (
    <Animated.View style={[styles.row, { top: index * ITEM_H + 3, backgroundColor: c.bg, borderColor: c.border }, style]}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        onPress={onPress}
        style={styles.rowPress}
      >
        <Text size={14.5} weight="semi" align="center" numberOfLines={1}>
          {item.title}
        </Text>
        {item.sub ? (
          <Text size={11.5} color={c.tm} align="center" numberOfLines={1}>
            {item.sub}
          </Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  centre: { position: 'absolute', top: 0, bottom: 0, start: 0, end: 0, alignItems: 'center', justifyContent: 'center' },
  panel: { borderRadius: radius.xl, paddingTop: 18, paddingBottom: 6, overflow: 'hidden' },
  title: { paddingHorizontal: 20, paddingBottom: 8 },
  wheel: { height: LIST_H, overflow: 'hidden' },
  lens: {
    position: 'absolute',
    top: PAD,
    height: ITEM_H,
    start: 16,
    end: 16,
    borderWidth: 1.5,
    borderRadius: radius.lg,
  },
  pointer: {
    position: 'absolute',
    end: 2,
    top: PAD + ITEM_H / 2 - 8,
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  column: { width: '100%' },
  row: {
    position: 'absolute',
    start: 24,
    end: 24,
    height: ITEM_H - 6,
    borderWidth: 1,
    borderRadius: radius.md,
    justifyContent: 'center',
  },
  rowPress: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, gap: 1 },
  done: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 28 },
});
