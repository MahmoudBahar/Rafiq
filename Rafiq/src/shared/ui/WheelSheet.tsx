import { BlurView } from 'expo-blur';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { useMotion } from '@/shared/lib/motion';
import { radius } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { Text } from './Text';

export interface WheelItem {
  key: string;
  title: string;
  sub?: string;
}

export interface WheelSheetProps {
  visible: boolean;
  title: string;
  items: WheelItem[];
  selectedKey: string;
  onSelect: (key: string) => void;
  onClose: () => void;
  /** Fires once per focused-index change while scrolling. Hook point for haptics. */
  onFocusChange?: (index: number) => void;
  /** Android: ref of the `BlurTargetView` wrapping the content behind the sheet. */
  blurTarget?: RefObject<View | null>;
}

const ITEM_H = 64;
const VISIBLE = 5;
const LIST_H = ITEM_H * VISIBLE;
const PAD = ITEM_H * 2;
const HEADER_H = 96;
const SPRING = { damping: 18, stiffness: 170, mass: 0.9 };
const DISMISS_FRACTION = 0.28;
const DISMISS_VELOCITY = 900;

/**
 * Bottom sheet whose list scrolls like a wheel: items snap into a centre
 * "focus lens" where the focused card is scaled up and highlighted.
 * Backdrop is dimmed and blurred (Android 12+ uses the RenderNode blur;
 * older Android falls back to the tint only).
 */
export function WheelSheet({
  visible,
  title,
  items,
  selectedKey,
  onSelect,
  onClose,
  onFocusChange,
  blurTarget,
}: WheelSheetProps) {
  const { c, isDark } = useTheme();
  const { reduced } = useMotion();
  const insets = useSafeAreaInsets();
  const sheetH = LIST_H + HEADER_H + insets.bottom;

  // Stay mounted while the close animation plays. `closing` flips on the
  // render where `visible` turns false (state adjusted during render) and
  // clears from the animation's completion callback.
  const [prevVisible, setPrevVisible] = useState(visible);
  const [closing, setClosing] = useState(false);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (!visible) setClosing(true);
  }
  const mounted = visible || closing;

  const dim = useSharedValue(0);
  const sheetY = useSharedValue(sheetH);
  const scrollY = useSharedValue(0);
  const listRef = useRef<Animated.ScrollView>(null);

  const selectedIndex = Math.max(
    0,
    items.findIndex((i) => i.key === selectedKey),
  );

  const emitFocus = useCallback((index: number) => onFocusChange?.(index), [onFocusChange]);
  const finishClose = useCallback(() => setClosing(false), []);

  // Open / close animations follow `visible`; the parent owns that flag.
  useEffect(() => {
    if (visible) {
      scrollY.set(selectedIndex * ITEM_H);
      if (reduced) {
        dim.set(1);
        sheetY.set(0);
      } else {
        dim.set(withTiming(1, { duration: 220 }));
        sheetY.set(withSpring(0, SPRING));
      }
      return;
    }
    if (!closing) return;
    if (reduced) {
      dim.set(0);
      sheetY.set(sheetH);
      scheduleOnRN(finishClose);
      return;
    }
    dim.set(withTiming(0, { duration: 180 }));
    sheetY.set(
      withTiming(sheetH, { duration: 220, easing: Easing.in(Easing.cubic) }, (finished) => {
        'worklet';
        if (finished) scheduleOnRN(finishClose);
      }),
    );
    // selectedIndex only matters at open time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, closing, reduced, sheetH, dim, sheetY, scrollY, finishClose]);

  // Android safety net for `contentOffset`.
  useEffect(() => {
    if (mounted) listRef.current?.scrollTo({ y: selectedIndex * ITEM_H, animated: false });
  }, [mounted, selectedIndex]);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.set(e.contentOffset.y);
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

  const drag = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(6)
        .onUpdate((e) => {
          sheetY.set(Math.max(0, e.translationY));
        })
        .onEnd((e) => {
          if (e.translationY > sheetH * DISMISS_FRACTION || e.velocityY > DISMISS_VELOCITY) {
            scheduleOnRN(onClose);
          } else {
            sheetY.set(withSpring(0, SPRING));
          }
        }),
    [onClose, sheetH, sheetY],
  );

  const backdropStyle = useAnimatedStyle(() => ({ opacity: dim.get() }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: sheetY.get() }] }));

  if (!mounted) return null;

  const select = (key: string) => {
    onSelect(key);
    onClose();
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

      <Animated.View
        style={[
          styles.sheet,
          { backgroundColor: c.surface, paddingBottom: insets.bottom + 12, boxShadow: `0 -8px 30px ${c.shadow}` },
          sheetStyle,
        ]}
      >
        <GestureDetector gesture={drag}>
          <View style={styles.sheetHeader}>
            <View style={[styles.handle, { backgroundColor: c.border }]} />
            <Text size={15} weight="bold" align="center">
              {title}
            </Text>
            <Text size={11.5} color={c.tm} align="center">
              مرّر لاختيار الطريقة ثم اضغط عليها
            </Text>
          </View>
        </GestureDetector>

        <Animated.ScrollView
          ref={listRef}
          onScroll={onScroll}
          scrollEventThrottle={16}
          snapToInterval={ITEM_H}
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          contentOffset={{ x: 0, y: selectedIndex * ITEM_H }}
          contentContainerStyle={{ paddingVertical: PAD }}
          style={{ height: LIST_H }}
        >
          {items.map((item, index) => (
            <WheelRow
              key={item.key}
              item={item}
              index={index}
              scrollY={scrollY}
              selected={item.key === selectedKey}
              reduced={reduced}
              accent={c.accent}
              selbg={c.selbg}
              onPress={() => select(item.key)}
            />
          ))}
        </Animated.ScrollView>
      </Animated.View>
    </View>
  );
}

interface WheelRowProps {
  item: WheelItem;
  index: number;
  scrollY: SharedValue<number>;
  selected: boolean;
  reduced: boolean;
  accent: string;
  selbg: string;
  onPress: () => void;
}

function WheelRow({ item, index, scrollY, selected, reduced, accent, selbg, onPress }: WheelRowProps) {
  const { c } = useTheme();
  const style = useAnimatedStyle(() => {
    const d = Math.min(Math.abs(scrollY.get() - index * ITEM_H) / ITEM_H, 1);
    return {
      transform: [{ scale: reduced ? 1 : interpolate(d, [0, 1], [1, 0.92]) }],
      opacity: interpolate(d, [0, 1], [1, 0.45]),
      borderColor: interpolateColor(d, [0, 0.5], [accent, 'transparent']),
      backgroundColor: interpolateColor(d, [0, 0.5], [selbg, 'transparent']),
    };
  });
  return (
    <Animated.View style={[styles.row, style]}>
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
  sheet: {
    position: 'absolute',
    start: 0,
    end: 0,
    bottom: 0,
    borderTopStartRadius: radius.xl,
    borderTopEndRadius: radius.xl,
  },
  sheetHeader: { alignItems: 'center', gap: 4, paddingTop: 10, paddingBottom: 12, height: HEADER_H },
  handle: { width: 40, height: 5, borderRadius: 999, marginBottom: 8 },
  row: {
    height: ITEM_H,
    marginHorizontal: 16,
    borderWidth: 1,
    borderRadius: radius.md,
    justifyContent: 'center',
  },
  rowPress: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, gap: 1 },
});
