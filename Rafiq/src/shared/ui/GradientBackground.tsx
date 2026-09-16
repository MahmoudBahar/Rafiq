import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet } from 'react-native';
import { useTheme } from '@/shared/theme/useTheme';

/**
 * Absolute-fill vertical sky gradient (skytop → skybot).
 * Native gradient view (not react-native-svg): Android paints it with
 * dithering, which removes the banding a long, low-contrast ramp shows on
 * 8-bit surfaces.
 */
export function GradientBackground() {
  const { c } = useTheme();
  return (
    <LinearGradient
      colors={[c.skytop, c.skybot]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      dither
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
  );
}
