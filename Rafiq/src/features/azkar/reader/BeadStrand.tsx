import { I18nManager, StyleSheet, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { physicalLeft } from '@/shared/lib/rtl';
import { useTheme } from '@/shared/theme/useTheme';

const STRAND_H = 92;
/** Counts up to this many get a bead each; longer ones run in rounds of `ROUND`. */
const SINGLE_MAX = 12;
const ROUND = 10;
const PAD = 30;
const SAG = 52;
const TOP = 14;
const MAX_BEAD = 20;
const THREAD_SEGMENTS = 22;
const CROSS = { damping: 15, stiffness: 190, mass: 0.6 };
const RETURN = { damping: 18, stiffness: 160, mass: 0.7 };
const RETURN_STAGGER_MS = 18;

export const beadsPerRound = (total: number) => (total <= SINGLE_MAX ? total : ROUND);
export const roundsOf = (total: number) => Math.ceil(total / beadsPerRound(total));
export const roundAt = (count: number, total: number) =>
  Math.min(roundsOf(total), Math.floor(Math.max(0, count - 1) / beadsPerRound(total)) + 1);

/** Beads across in the current round. A full round stays full until the next tap starts a new one. */
function across(count: number, n: number) {
  'worklet';
  return count <= 0 ? 0 : ((count - 1) % n) + 1;
}

interface BeadStrandProps {
  width: number;
  total: number;
  /** Repetitions said so far, owned by the reader and written on the UI thread. */
  count: SharedValue<number>;
  /** The count at mount, so beads already across start there instead of travelling. */
  initial: number;
  /** 0 → 1 → 0 when the zekr completes. */
  glow: SharedValue<number>;
}

/**
 * A hanging tasbih strand. Beads wait at the reading-start end; each
 * repetition sends one across the gap to the other end on a spring. The curve
 * is an analytic parabola in physical pixels, so under forced RTL the strand
 * simply runs the other way. Every bead owns one shared value that only moves
 * when that bead's side flips: a tap animates one view, not the whole strand.
 */
export function BeadStrand({ width, total, count, initial, glow }: BeadStrandProps) {
  const { c } = useTheme();
  const n = beadsPerRound(total);
  const span = width - PAD * 2;
  const size = Math.min(MAX_BEAD, (span * 0.62) / n);
  const step = (size * 1.08) / span;
  const s0 = size / 2 / span;
  const rtl = I18nManager.isRTL;
  const xAt = (s: number) => (rtl ? width - PAD - s * span : PAD + s * span);
  const yAt = (s: number) => TOP + 4 * SAG * s * (1 - s);

  const thread = Array.from({ length: THREAD_SEGMENTS }, (_, k) => {
    const a = k / THREAD_SEGMENTS;
    const b = (k + 1) / THREAD_SEGMENTS;
    const dx = xAt(b) - xAt(a);
    const dy = yAt(b) - yAt(a);
    const len = Math.hypot(dx, dy) + 1;
    return { len, x: (xAt(a) + xAt(b)) / 2 - len / 2, y: (yAt(a) + yAt(b)) / 2, angle: Math.atan2(dy, dx) };
  });

  return (
    <View pointerEvents="none" style={[styles.strand, { width }]}>
      {thread.map((t, k) => (
        <View
          key={k}
          style={[
            styles.thread,
            { width: t.len, backgroundColor: c.selbr, transform: [{ translateX: t.x }, { translateY: t.y }, { rotate: `${t.angle}rad` }] },
          ]}
        />
      ))}
      {Array.from({ length: n }, (_, i) => (
        <Bead
          key={i}
          index={i}
          n={n}
          count={count}
          startsAcross={across(initial, n) > i}
          glow={glow}
          size={size}
          rest={{ x: xAt(s0 + (n - 1 - i) * step), y: yAt(s0 + (n - 1 - i) * step) }}
          done={{ x: xAt(1 - s0 - i * step), y: yAt(1 - s0 - i * step) }}
          sag={SAG * 0.35}
          idle={c.selbr}
          lit={c.accent}
        />
      ))}
    </View>
  );
}

interface Point {
  x: number;
  y: number;
}

interface BeadProps {
  index: number;
  n: number;
  count: SharedValue<number>;
  startsAcross: boolean;
  glow: SharedValue<number>;
  size: number;
  rest: Point;
  done: Point;
  sag: number;
  idle: string;
  lit: string;
}

function Bead({ index, n, count, startsAcross, glow, size, rest, done, sag, idle, lit }: BeadProps) {
  const pos = useSharedValue(startsAcross ? 1 : 0);
  useAnimatedReaction(
    () => across(count.get(), n) > index,
    (over, was) => {
      if (was === null || over === was) return;
      pos.set(over ? withSpring(1, CROSS) : withDelay(index * RETURN_STAGGER_MS, withSpring(0, RETURN)));
    },
  );
  const style = useAnimatedStyle(() => {
    const p = pos.get();
    // Dip a little below the straight line between the two ends, as a bead on a slack thread would.
    const dip = sag * 4 * p * (1 - p);
    return {
      backgroundColor: interpolateColor(p, [0, 1], [idle, lit]),
      transform: [
        { translateX: rest.x + (done.x - rest.x) * p - size / 2 },
        { translateY: rest.y + (done.y - rest.y) * p + dip - size / 2 },
        { scale: 1 + 0.22 * glow.get() * (p > 0.5 ? 1 : 0) },
      ],
    };
  });
  return <Animated.View style={[styles.bead, { width: size, height: size, borderRadius: size / 2 }, style]} />;
}

const styles = StyleSheet.create({
  strand: { height: STRAND_H },
  thread: { position: 'absolute', top: 0, ...physicalLeft(0), height: 1.5, borderRadius: 1 },
  bead: { position: 'absolute', top: 0, ...physicalLeft(0) },
});
