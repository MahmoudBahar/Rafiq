import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useMotion } from '@/shared/lib/motion';
import { radius } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { Text } from '@/shared/ui/Text';
import { rakaatLabel, stationsOf, type PrayerGuide, type Station } from '../sunnah';
import { Beads, STAGGER_MS, type BeadLook } from './Beads';

/** When the first card starts entering, after the hero has mostly settled. */
export const PATH_START_MS = 260;
const CARD_GAP_MS = 90;
const CARD_MS = 420;
const SPINE_MS = 700;
const NODE = 22;

interface SunnahPathProps {
  guide: PrayerGuide;
  /** Line under the fard title: the iqama, or its absence. */
  fardNote: string;
}

/**
 * The vertical timeline: a spine that draws itself downward while the
 * stations fade up one after another and their beads pop in.
 */
export function SunnahPath({ guide, fardNote }: SunnahPathProps) {
  const { c } = useTheme();
  const m = useMotion();
  const spineH = useSharedValue(0);
  const [height, setHeight] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h === height) return;
    setHeight(h);
    const target = Math.max(0, h - NODE);
    spineH.set(
      m.reduced ? target : withDelay(PATH_START_MS, withTiming(target, { duration: SPINE_MS, easing: Easing.out(Easing.cubic) })),
    );
  };
  const spineStyle = useAnimatedStyle(() => ({ height: spineH.get() }));

  const stations = stationsOf(guide);

  return (
    <View style={styles.path} onLayout={onLayout}>
      {stations.length > 1 ? <Animated.View style={[styles.spine, { backgroundColor: c.border }, spineStyle]} /> : null}
      {stations.map((s, i) => {
        const delay = PATH_START_MS + i * CARD_GAP_MS;
        return (
          <Animated.View key={s === 'fard' ? 'fard' : s.id} entering={m.fadeInUp(delay, CARD_MS)} style={styles.stationRow}>
            {s === 'fard' ? (
              <FardStation guide={guide} note={fardNote} delay={delay + CARD_MS * 0.5} />
            ) : (
              <SunnahStation station={s} delay={delay + CARD_MS * 0.5} />
            )}
          </Animated.View>
        );
      })}
    </View>
  );
}

function Node({ color, fill, size = 10 }: { color: string; fill: boolean; size?: number }) {
  return (
    <View style={styles.nodeCol}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size,
          borderWidth: 2,
          borderColor: color,
          backgroundColor: fill ? color : 'transparent',
        }}
      />
    </View>
  );
}

function Tag({ label, tone }: { label: string; tone: 'solid' | 'outline' | 'muted' }) {
  const { c } = useTheme();
  const box =
    tone === 'solid'
      ? { backgroundColor: c.accent, borderColor: c.accent }
      : tone === 'outline'
        ? { backgroundColor: 'transparent', borderColor: c.accent }
        : { backgroundColor: 'transparent', borderColor: c.border };
  const color = tone === 'solid' ? '#ffffff' : tone === 'outline' ? c.accent : c.tm;
  return (
    <View style={[styles.tag, box]}>
      <Text size={10.5} weight="bold" color={color}>
        {label}
      </Text>
    </View>
  );
}

function SunnahStation({ station, delay }: { station: Station; delay: number }) {
  const { c } = useTheme();
  const none = station.emphasis === 'none';
  const solid = station.emphasis === 'muakkadah';
  const looks: BeadLook[] = station.range
    ? Array.from({ length: station.range[1] }, (_, i): BeadLook => (i < station.range![0] ? (solid ? 'solid' : 'outline') : 'faint'))
    : Array.from({ length: station.rakaat }, (): BeadLook => (solid ? 'solid' : 'outline'));
  return (
    <>
      <Node color={none ? c.border : c.accent} fill={solid} />
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, none && styles.muted]}>
        <View style={styles.cardHead}>
          <Text size={14.5} weight="semi" color={none ? c.tm : c.tp}>
            {station.title}
          </Text>
          <Tag label={station.tag} tone={none ? 'muted' : solid ? 'solid' : 'outline'} />
        </View>
        <Text size={12.5} color={none ? c.tm : c.ts}>
          {station.line}
        </Text>
        {none ? null : (
          <View style={styles.beadsRow}>
            <Beads looks={looks} perGroup={station.range ? 0 : 2} color={c.accent} faintColor={c.border} delay={delay} />
            <Text size={11.5} weight="semi" color={c.tm}>
              {rakaatLabel(station.rakaat, station.range)}
            </Text>
          </View>
        )}
      </View>
    </>
  );
}

function FardStation({ guide, note, delay }: { guide: PrayerGuide; note: string; delay: number }) {
  const { c } = useTheme();
  const looks: BeadLook[] = Array.from({ length: guide.fardRakaat }, () => 'solid');
  return (
    <>
      <Node color={c.tp} fill size={14} />
      <View style={[styles.card, { backgroundColor: c.selbg, borderColor: c.accent }]}>
        <View style={styles.cardHead}>
          <Text size={15} weight="bold">
            الفريضة · {guide.title}
          </Text>
          <Text size={11.5} weight="semi" color={c.tm}>
            {rakaatLabel(guide.fardRakaat)}
          </Text>
        </View>
        <Text size={12.5} color={c.ts}>
          {note}
        </Text>
        <View style={styles.beadsRow}>
          <Beads looks={looks} perGroup={0} color={c.tp} faintColor={c.border} delay={delay} size={12} />
        </View>
      </View>
    </>
  );
}

/** Delay at which the last bead of `n` has popped, for chaining. */
export const beadsDoneMs = (start: number, n: number) => start + n * STAGGER_MS;

const styles = StyleSheet.create({
  path: { gap: 12 },
  // Physical start side: the nodes column is the first child of each row.
  spine: { position: 'absolute', top: NODE / 2, start: NODE / 2 - 1, width: 2, borderRadius: 1 },
  stationRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  nodeCol: { width: NODE, height: NODE, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  card: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: 13,
    paddingHorizontal: 16,
    gap: 6,
  },
  muted: { opacity: 0.75 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  tag: { borderWidth: 1, borderRadius: radius.pill, paddingVertical: 3, paddingHorizontal: 9 },
  beadsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingTop: 4 },
});
