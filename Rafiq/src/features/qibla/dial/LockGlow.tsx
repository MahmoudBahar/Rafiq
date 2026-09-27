import { LinearGradient } from 'expo-linear-gradient';
import { I18nManager, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

const DEPTH = 96;
const SIDE = DEPTH * 0.7;
const ACCENT = 'rgba(201,123,90,';

/**
 * The screen's edges bloom in the accent as the mat locks in, then fade: one
 * bright moment marking the arrival, over the whole page. Four gradients
 * fading inward, on a layer whose opacity the lock drives.
 *
 * The side strips are placed by physical edge: RN swaps `left`/`right` under
 * RTL but a gradient's direction stays physical, so a logical `left` strip
 * would land on the right edge with its bright side facing inward.
 */
export function LockGlow({ t }: { t: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({ opacity: t.get() }));
  const colors = [`${ACCENT}0.9)`, `${ACCENT}0)`] as const;
  const rtl = I18nManager.isRTL;
  const physicalLeft = rtl ? { right: 0 } : { left: 0 };
  const physicalRight = rtl ? { left: 0 } : { right: 0 };
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.top} />
      <LinearGradient colors={colors} start={{ x: 0, y: 1 }} end={{ x: 0, y: 0 }} style={styles.bottom} />
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.side, physicalLeft]} />
      <LinearGradient colors={colors} start={{ x: 1, y: 0 }} end={{ x: 0, y: 0 }} style={[styles.side, physicalRight]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0, height: DEPTH },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: DEPTH },
  side: { position: 'absolute', top: 0, bottom: 0, width: SIDE },
});
