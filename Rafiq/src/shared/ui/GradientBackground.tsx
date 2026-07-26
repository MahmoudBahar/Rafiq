import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '@/shared/theme/useTheme';

/**
 * Absolute-fill vertical sky gradient (skytop → skybot).
 * The Svg gets explicit pixel dimensions: percentage-sized Svg roots are
 * mispositioned on Android when the layout direction is RTL.
 */
export function GradientBackground() {
  const { c } = useTheme();
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev && prev.w === width && prev.h === height ? prev : { w: width, h: height }));
  };
  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout} pointerEvents="none">
      {size ? (
        <Svg width={size.w} height={size.h}>
          <Defs>
            <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={c.skytop} />
              <Stop offset="1" stopColor={c.skybot} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width={size.w} height={size.h} fill="url(#sky)" />
        </Svg>
      ) : null}
    </View>
  );
}
