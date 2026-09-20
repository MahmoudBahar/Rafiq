import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector, type PanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { COL_PAD, type CarouselValues } from './useDayCarousel';

interface DaySwipeSurfaceProps {
  gesture: PanGesture;
  children: ReactNode;
}

/** Gesture surface for the pager; wraps the whole vertical list area. */
export function DaySwipeSurface({ gesture, children }: DaySwipeSurfaceProps) {
  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.fill}>{children}</View>
    </GestureDetector>
  );
}

interface DayCarouselProps {
  offset: number;
  values: CarouselValues;
  renderDay: (dayOffset: number) => ReactNode;
  /** Columns take the strip's full height (pages that scroll on their own) instead of their content's. */
  fill?: boolean;
}

/**
 * Three-column ring buffer (prev / current / next). Columns are keyed by
 * `dayOffset mod 3`, so a commit never re-renders the column on screen.
 */
export function DayCarousel({ offset, values, renderDay, fill = false }: DayCarouselProps) {
  const columns = [offset - 1, offset, offset + 1];
  return (
    <View style={[styles.strip, fill && styles.fill, { width: values.width }]}>
      {columns.map((d) => (
        <Column key={((d % 3) + 3) % 3} d={d} inFlow={d === offset} fill={fill} values={values}>
          {renderDay(d)}
        </Column>
      ))}
    </View>
  );
}

interface ColumnProps {
  d: number;
  inFlow: boolean;
  fill: boolean;
  values: CarouselValues;
  children: ReactNode;
}

function Column({ d, inFlow, fill, values, children }: ColumnProps) {
  const { center, tx, op, dir, width } = values;
  const style = useAnimatedStyle(() => ({
    opacity: op.get(),
    transform: [{ translateX: dir * (center.get() - d) * width + tx.get() }],
  }));
  return (
    <Animated.View
      style={[styles.column, { width }, inFlow ? null : styles.floating, fill && (inFlow ? styles.fill : styles.tall), style]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  strip: { overflow: 'visible' },
  column: { paddingHorizontal: COL_PAD },
  // Physical `left` so forced RTL cannot mirror the maths.
  floating: { position: 'absolute', top: 0, left: 0 },
  tall: { bottom: 0 },
});
