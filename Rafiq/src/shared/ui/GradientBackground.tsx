import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet } from 'react-native';
import { useTheme } from '@/shared/theme/useTheme';

/**
 * Absolute-fill vertical sky gradient (skytop → skybot).
 * Native gradient view (not react-native-svg): Android paints it with
 * dithering, which removes the banding a long, low-contrast ramp shows on
 * 8-bit surfaces. `colors` overrides the theme's sky for scenery that keeps
 * its own palette.
 */
export function GradientBackground({ colors }: { colors?: readonly [string, string] }) {
  const { c } = useTheme();
  return (
    <LinearGradient
      colors={colors ?? [c.skytop, c.skybot]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      dither
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
  );
}
