import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useMotion } from '@/shared/lib/motion';
import { useTheme } from '@/shared/theme/useTheme';
import { Text } from '@/shared/ui/Text';

/** How far the ghost phone tips: almost lying on the floor line, still readable as a phone. */
const LAID_DEG = 78;
/** One demonstration: stand 0.3 s, lie down over 1 s, stay 0.6 s, stand up again over 0.5 s. */
const STAND_MS = 290;
const LIE_MS = 1030;
const STAY_MS = 600;
const RISE_MS = 480;
const SLOW = 2.5;
const EASE = Easing.bezier(0.6, 0.05, 0.3, 1);

interface LayFlatCoachProps {
  /** 0..1, the phone held up (the mat rolls up first; this follows once it is nearly rolled). */
  t: SharedValue<number>;
  /** Run the demonstration loop: only while the phone is held up, so nothing animates otherwise. */
  active: boolean;
  /** The dial's size: the coach scales with it. */
  size: number;
}

/**
 * What to do, shown rather than described: a ghost phone standing on a floor
 * line lies down on it, again and again, over «ضع الهاتف مستويًا». It fades in
 * once the mat has rolled up and out as it unrolls.
 */
export function LayFlatCoach({ t, active, size }: LayFlatCoachProps) {
  const { c } = useTheme();
  const { reduced } = useMotion();
  const tip = useSharedValue(0);
  const k = size / 196;

  useEffect(() => {
    if (!active) {
      cancelAnimation(tip);
      tip.set(0);
      return;
    }
    const pace = reduced ? SLOW : 1;
    tip.set(
      withRepeat(
        withSequence(
          withDelay(STAND_MS * pace, withTiming(LAID_DEG, { duration: LIE_MS * pace, easing: EASE })),
          withDelay(STAY_MS * pace, withTiming(0, { duration: RISE_MS * pace, easing: EASE })),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(tip);
  }, [active, reduced, tip]);

  const shown = useAnimatedStyle(() => {
    const x = Math.min(1, Math.max(0, (t.get() - 0.75) / 0.25));
    const e = x * x * (3 - 2 * x);
    return { opacity: e, transform: [{ translateY: (1 - e) * 14 * k + 34 * k }] };
  });
  const ghost = useAnimatedStyle(() => ({
    transform: [{ perspective: 260 * k }, { rotateX: `${tip.get()}deg` }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, shown]}>
      <View style={{ width: 120 * k, height: 92 * k }}>
        <View style={[styles.floor, { left: 6 * k, right: 6 * k, bottom: 8 * k, backgroundColor: c.tm }]} />
        <Animated.View
          style={[
            styles.ghost,
            ghost,
            {
              width: 40 * k,
              height: 72 * k,
              marginLeft: -20 * k,
              bottom: 10 * k,
              borderRadius: 9 * k,
              borderColor: c.accent,
              backgroundColor: `${c.accent}1f`,
            },
          ]}
        >
          <View style={[styles.speaker, { width: 10 * k, height: 3 * k, top: 5 * k, backgroundColor: c.accent }]} />
        </Animated.View>
      </View>
      <Text size={14} weight="semi" color={c.tp} align="center" style={styles.wide}>
        ضع الهاتف مستويًا
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', alignItems: 'center', gap: 12, left: 0, right: 0 },
  floor: { position: 'absolute', height: 2, borderRadius: 1, opacity: 0.5 },
  // Centred by a half-width margin on each side's own terms, so an RTL swap of left/right changes nothing.
  ghost: { position: 'absolute', left: '50%', borderWidth: 2, transformOrigin: 'center bottom', alignItems: 'center' },
  speaker: { position: 'absolute', borderRadius: 2, opacity: 0.6 },
  wide: { alignSelf: 'stretch' },
});
