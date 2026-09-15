import { BlurView } from 'expo-blur';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useMotion } from '@/shared/lib/motion';
import { radius } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { ChevronBackIcon } from './Icons';
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
  /** Fires once per focused-index change while scrolling. Hook point for haptics. */
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

  const selectedIndex = Math.max(
    0,
    items.findIndex((i) => i.key === selectedKey),
  );

  // Stay mounted while the close animation plays; `openIndex` is frozen at
  // open time so live selection updates don't re-scroll the wheel.
  const [prevVisible, setPrevVisible] = useState(visible);
  const [closing, setClosing] = useState(false);
  const [openIndex, setOpenIndex] = useState(selectedIndex);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) setOpenIndex(selectedIndex);
    else setClosing(true);
  }
  const mounted = visible || closing;

  const dim = useSharedValue(0);
  const panelOp = useSharedValue(0);
  const panelScale = useSharedValue(0.94);
  const scrollY = useSharedValue(0);
  const listRef = useRef<Animated.ScrollView>(null);

  const emitFocus = useCallback((index: number) => onFocusChange?.(index), [onFocusChange]);
  const finishClose = useCallback(() => setClosing(false), []);
  const settle = useCallback(
    (index: number) => {
      const key = items[index]?.key;
      if (key && key !== selectedKey) onSelect(key);
    },
    [items, onSelect, selectedKey],
  );

  useEffect(() => {
    if (visible) {
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
  }, [visible, closing, reduced, openIndex, dim, panelOp, panelScale, scrollY, finishClose]);

  // Android safety net for `contentOffset`.
  useEffect(() => {
    if (mounted) listRef.current?.scrollTo({ y: openIndex * ITEM_H, animated: false });
  }, [mounted, openIndex]);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.set(e.contentOffset.y);
    },
    onEndDrag: (e) => {
      // Only when the finger lifts exactly on a snap point (no momentum follows).
      const y = e.contentOffset.y;
      const v = e.velocity?.y ?? 0;
      if (Math.abs(v) < 0.01 && Math.abs(y - Math.round(y / ITEM_H) * ITEM_H) < 0.5) {
        scheduleOnRN(settle, Math.round(y / ITEM_H));
      }
    },
    onMomentumEnd: (e) => {
      scheduleOnRN(settle, Math.round(e.contentOffset.y / ITEM_H));
    },
  });

  const focused = useDerivedValue(() => {
    const idx = Math.round(scrollY.get() / ITEM_H);
    return Math.min(Math.max(idx, 0), items.length - 1);
  });
  useAnimatedReaction(
    () => focused.get(),
    (cur, prev) => {
      if (prev !== null && cur !== prev) scheduleOnRN(emitFocus, cur);
    },
  );

  const backdropStyle = useAnimatedStyle(() => ({ opacity: dim.get() }));
  const panelStyle = useAnimatedStyle(() => ({
    opacity: panelOp.get(),
    transform: [{ scale: panelScale.get() }],
  }));

  if (!mounted) return null;

  const onRowPress = (item: DrumItem, index: number) => {
    if (item.key === selectedKey) {
      onClose();
      return;
    }
    onSelect(item.key);
    listRef.current?.scrollTo({ y: index * ITEM_H, animated: true });
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

          <View style={styles.wheel}>
            <Animated.ScrollView
              ref={listRef}
              onScroll={onScroll}
              scrollEventThrottle={16}
              snapToInterval={ITEM_H}
              decelerationRate="fast"
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              contentOffset={{ x: 0, y: openIndex * ITEM_H }}
              contentContainerStyle={{ paddingVertical: PAD }}
              style={{ height: LIST_H }}
            >
              {items.map((item, index) => (
                <DrumRow
                  key={item.key}
                  item={item}
                  index={index}
                  scrollY={scrollY}
                  selected={item.key === selectedKey}
                  reduced={reduced}
                  onPress={() => onRowPress(item, index)}
                />
              ))}
            </Animated.ScrollView>
            <View pointerEvents="none" style={[styles.lens, { borderColor: c.accent }]} />
            <View pointerEvents="none" style={styles.pointer}>
              <ChevronBackIcon size={16} color={c.accent} strokeWidth={2.6} />
            </View>
          </View>

          <Pressable accessibilityRole="button" onPress={onClose} style={styles.done}>
            <Text size={13.5} weight="bold" color={c.accent}>
              تم
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </View>
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
    const d = Math.max(-2.5, Math.min(2.5, (scrollY.get() - index * ITEM_H) / ITEM_H));
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
    <Animated.View style={[styles.row, { backgroundColor: c.bg, borderColor: c.border }, style]}>
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
  row: {
    height: ITEM_H - 6,
    marginVertical: 3,
    marginHorizontal: 24,
    borderWidth: 1,
    borderRadius: radius.md,
    justifyContent: 'center',
  },
  rowPress: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, gap: 1 },
  done: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 28 },
});
