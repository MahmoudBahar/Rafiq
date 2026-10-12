import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet } from 'react-native';
import { useTheme } from '@/shared/theme/useTheme';

/**
 * Absolute-fill vertical sky gradient (skytop → skybot).
 * Native gradient view (not react-native-svg): Android paints it with
 * dithering, which removes the banding a long, low-contrast ramp shows on
 * 8-bit surfaces. `colors` overrides the theme's sky for scenery that keeps
 * its own palette. `foot` ends the ramp that far down the view, in 0..1, with the
 * bottom colour flat below it.
 */
export function GradientBackground({ colors, foot = 1 }: { colors?: readonly [string, string]; foot?: number }) {
  const { c } = useTheme();
  return (
    <LinearGradient
      colors={colors ?? [c.skytop, c.skybot]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: foot }}
      dither
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
  );
}
