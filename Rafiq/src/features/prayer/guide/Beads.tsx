import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import { useMotion } from '@/shared/lib/motion';

export type BeadLook = 'solid' | 'outline' | 'faint';

export interface BeadsProps {
  /** One entry per bead, in order. */
  looks: BeadLook[];
  /** Beads per group (a taslim); 0 = one group. */
  perGroup: number;
  color: string;
  faintColor: string;
  /** Delay before the first bead pops, ms; each following bead adds `STAGGER_MS`. */
  delay: number;
  size?: number;
}

export const STAGGER_MS = 40;
const POP = { damping: 12, stiffness: 220, mass: 0.8 };

/** Rak'ah as beads, popping in one after another. */
export function Beads({ looks, perGroup, color, faintColor, delay, size = 11 }: BeadsProps) {
  const groups: BeadLook[][] = [];
  if (perGroup <= 0) groups.push(looks);
  else for (let i = 0; i < looks.length; i += perGroup) groups.push(looks.slice(i, i + perGroup));
  let index = 0;
  return (
    <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {groups.map((g, gi) => (
        <View key={gi} style={styles.group}>
          {g.map((look, bi) => (
            <Bead key={bi} look={look} color={color} faintColor={faintColor} size={size} delay={delay + index++ * STAGGER_MS} />
          ))}
        </View>
      ))}
    </View>
  );
}

interface BeadProps {
  look: BeadLook;
  color: string;
  faintColor: string;
  size: number;
  delay: number;
}

function Bead({ look, color, faintColor, size, delay }: BeadProps) {
  const { reduced } = useMotion();
  const s = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    s.set(reduced ? 1 : withDelay(delay, withSpring(1, POP)));
  }, [delay, reduced, s]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.get() }] }));
  const look_ =
    look === 'solid'
      ? { backgroundColor: color, borderColor: color }
      : look === 'outline'
        ? { backgroundColor: 'transparent', borderColor: color }
        : { backgroundColor: 'transparent', borderColor: faintColor };
  return <Animated.View style={[{ width: size, height: size, borderRadius: size, borderWidth: 1.5 }, look_, style]} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  group: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
