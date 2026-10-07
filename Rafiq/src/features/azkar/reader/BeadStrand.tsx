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

/** The thread: a parabola over `s` ∈ 0..1 in reading order, in physical pixels. Beads ride the same curve. */
function curveX(s: number, width: number, rtl: boolean) {
  'worklet';
  return rtl ? width - PAD - s * (width - PAD * 2) : PAD + s * (width - PAD * 2);
}
function curveY(s: number) {
  'worklet';
  return TOP + 4 * SAG * s * (1 - s);
}

/** Beads across in the current round. A full round stays full until the next tap starts a new one. */
function across(count: number, n: number) {
  'worklet';
  return count <= 0 ? 0 : ((count - 1) % n) + 1;
}

interface BeadStrandProps {
  width: number;
  total: number;
  /** This strand's page, and the page the reader's live `count` currently belongs to. */
  page: number;
  owner: SharedValue<number>;
  /** Repetitions of the page in view, written on the UI thread so a bead moves with the tap. */
  count: SharedValue<number>;
  /** Where the strand's own count starts: the beginning of the current stage of a compound entry. */
  offset: SharedValue<number>;
  /** This page's saved count within the strand: what a neighbouring page shows, and where beads start. */
  said: number;
  /** 0 → 1 → 0 when the zekr completes. */
  glow: SharedValue<number>;
}

/**
 * A hanging tasbih strand. Beads wait at the reading-start end; each
 * repetition sends one across the gap to the other end on a spring. The curve
 * is an analytic parabola in physical pixels, so under forced RTL the strand
 * simply runs the other way. Every bead owns one shared value that only moves
 * when that bead's side flips: a tap animates one view, not the whole strand.
 *
 * Each page of the reader carries its own strand, so it slides with its zekr.
 * Only the page in view follows the live count; the others show what is saved,
 * and so does a page for the frame in which the live count is still its
 * predecessor's.
 */
export function BeadStrand({ width, total, page, owner, count, offset, said, glow }: BeadStrandProps) {
  const { c } = useTheme();
  const n = beadsPerRound(total);
  const span = width - PAD * 2;
  const size = Math.min(MAX_BEAD, (span * 0.62) / n);
  const step = (size * 1.08) / span;
  const s0 = size / 2 / span;
  const rtl = I18nManager.isRTL;
  const xAt = (s: number) => curveX(s, width, rtl);
  const yAt = (s: number) => curveY(s);

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
          total={total}
          page={page}
          owner={owner}
          count={count}
          offset={offset}
          said={said}
          glow={glow}
          size={size}
          width={width}
          rtl={rtl}
          sRest={s0 + (n - 1 - i) * step}
          sDone={1 - s0 - i * step}
          idle={c.selbr}
          lit={c.accent}
        />
      ))}
    </View>
  );
}

interface BeadProps {
  index: number;
  n: number;
  /** The entry's whole count: a last round shorter than `n` shows only the beads it has. */
  total: number;
  page: number;
  owner: SharedValue<number>;
  count: SharedValue<number>;
  offset: SharedValue<number>;
  said: number;
  glow: SharedValue<number>;
  size: number;
  width: number;
  rtl: boolean;
  /** Where the bead waits and where it ends up, as positions along the thread. */
  sRest: number;
  sDone: number;
  idle: string;
  lit: string;
}

function Bead({ index, n, total, page, owner, count, offset, said, glow, size, width, rtl, sRest, sDone, idle, lit }: BeadProps) {
  const pos = useSharedValue(across(said, n) > index ? 1 : 0);
  useAnimatedReaction(
    () => across(owner.get() === page ? count.get() - offset.get() : said, n) > index,
    (over, was) => {
      if (was === null || over === was) return;
      pos.set(over ? withSpring(1, CROSS) : withDelay(index * RETURN_STAGGER_MS, withSpring(0, RETURN)));
    },
  );
  const style = useAnimatedStyle(() => {
    const p = pos.get();
    // Travel is along the thread itself; the spring's overshoot stays on it too.
    const s = Math.min(1, Math.max(0, sRest + (sDone - sRest) * p));
    // The round in progress, from the live count: a full round stays full until the next tap.
    const live = owner.get() === page ? count.get() - offset.get() : said;
    const roundStart = live <= 0 ? 0 : Math.floor((live - 1) / n) * n;
    return {
      opacity: roundStart + index < total ? 1 : 0,
      backgroundColor: interpolateColor(p, [0, 1], [idle, lit]),
      transform: [
        { translateX: curveX(s, width, rtl) - size / 2 },
        { translateY: curveY(s) - size / 2 },
        { scale: 1 + 0.22 * glow.get() * (p > 0.5 && owner.get() === page ? 1 : 0) },
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
