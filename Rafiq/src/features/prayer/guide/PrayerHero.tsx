import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { formatTime12 } from '@/shared/lib/arabic';
import { useMotion } from '@/shared/lib/motion';
import { radius } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { Display, Text } from '@/shared/ui/Text';
import { CountdownDigits } from '../CountdownDigits';
import type { EventKind } from '../engine';

/** Card height once settled, with and without the live countdown row. */
export const HERO_H = 158;
export const HERO_LIVE_H = 204;
export const HERO_MARGIN = 20;
const SPRING = { damping: 18, stiffness: 170, mass: 0.9 };
/** The shadow is mounted, static, once the visible travel is over. */
const SHADOW_MS = 480;
/** Fallback start when no row rectangle was passed: a short rise from below. */
const FALLBACK_DY = 40;

export interface HeroOrigin {
  /** Window-relative top of the pressed row and its height, in dp. */
  y: number;
  h: number;
  /** The row was the highlighted "next" row (hero colours). */
  highlighted: boolean;
}

export interface HeroTime {
  label: string;
  at: Date;
}

interface PrayerHeroProps {
  title: string;
  /** The home row's label and time, so frame one matches the row. */
  rowName: string;
  rowTime: string;
  dayLabel: string;
  /** Adhan / iqama, or the Duha window. */
  times: HeroTime[];
  /** Live countdown when this page's prayer is what the home screen counts to. */
  live: { kind: EventKind; at: Date } | null;
  origin: HeroOrigin | null;
  /** Morph progress owned by the screen: 0 = on the row, 1 = settled. */
  progress: SharedValue<number>;
  /** Final top of the card inside the band. */
  top: number;
}

const LIVE_LABEL: Record<EventKind, string> = {
  adhan: 'يتبقى على الأذان',
  iqama: 'يتبقى على الإقامة',
  sunrise: 'يتبقى على الشروق',
};

/**
 * The hero card. It mounts invisible, measures where it will sit, then
 * springs from the pressed row's rectangle into place while its row-styled
 * layer cross-fades into the full card.
 */
export function PrayerHero({ title, rowName, rowTime, dayLabel, times, live, origin, progress, top }: PrayerHeroProps) {
  const { c } = useTheme();
  const { reduced } = useMotion();
  const { height: winH } = useWindowDimensions();
  const box = useRef<View>(null);
  const settledH = live ? HERO_LIVE_H : HERO_H;

  const measured = useSharedValue(0);
  const originDy = useSharedValue(FALLBACK_DY);
  const originH = useSharedValue(settledH);
  const [started, setStarted] = useState(false);
  const [landed, setLanded] = useState(reduced);
  useEffect(() => {
    if (!started || reduced) return;
    const id = setTimeout(() => setLanded(true), SHADOW_MS);
    return () => clearTimeout(id);
  }, [started, reduced]);

  useEffect(() => {
    if (started) return;
    const node = box.current;
    if (!node) return;
    node.measureInWindow((_x, heroY) => {
      const valid = origin !== null && origin.h > 0 && origin.y >= 0 && origin.y < winH;
      originDy.set(valid ? origin.y - heroY : FALLBACK_DY);
      originH.set(valid ? origin.h : settledH);
      measured.set(1);
      setStarted(true);
      progress.set(reduced ? 1 : withSpring(1, SPRING));
    });
  }, [started, origin, winH, settledH, reduced, originDy, originH, measured, progress]);

  // The next prayer's row is drawn in the hero colours; its page keeps them.
  const highlighted = origin?.highlighted ?? false;
  const bg = highlighted ? c.hero : c.surface;
  const border = highlighted ? c.hero : c.border;
  // The original architecture: one box, translated from the row and growing
  // to the card's height (a layout property animated per frame).
  const card = useAnimatedStyle(() => {
    const t = progress.get();
    return {
      opacity: measured.get(),
      transform: [{ translateY: originDy.get() * (1 - t) }],
      height: interpolate(t, [0, 1], [originH.get(), settledH]),
      borderRadius: interpolate(t, [0, 1], [radius.md, radius.xl]),
    };
  });
  const rowLayer = useAnimatedStyle(() => ({ opacity: interpolate(progress.get(), [0, 0.5], [1, 0], 'clamp') }));
  const fullLayer = useAnimatedStyle(() => ({ opacity: interpolate(progress.get(), [0.5, 1], [0, 1], 'clamp') }));

  const rowText = highlighted ? c.herotext : c.tp;
  const rowTimeColor = highlighted ? c.herotext : c.ts;
  const ink = highlighted ? c.herotext : c.tp;
  const inkSoft = highlighted ? c.herotext : c.tm;
  // Hex tokens: append an alpha byte for the translucent divider on the hero colour.
  const rule = highlighted ? `${c.herotext}33` : c.border;

  return (
    <View ref={box} collapsable={false} style={[styles.slot, { top, height: settledH }]}>
      <Animated.View style={[styles.card, { backgroundColor: bg, borderColor: border }, card]}>
        {/* Static, mounted after landing: a blurred shadow whose opacity animates is re-rendered every frame. */}
        {landed ? <View style={[styles.shadow, { backgroundColor: bg, boxShadow: `0 12px 30px ${c.shadow}` }]} /> : null}
        {/* Frame one: the home row, verbatim. */}
        <Animated.View pointerEvents="none" style={[styles.rowLayer, rowLayer]}>
          <View style={styles.rowName}>
            <View style={[styles.dot, { backgroundColor: c.accent, opacity: highlighted ? 1 : 0 }]} />
            <Text size={16} weight={highlighted ? 'bold' : 'semi'} color={rowText}>
              {rowName}
            </Text>
          </View>
          <Text size={14.5} weight={highlighted ? 'bold' : 'semi'} color={rowTimeColor} style={styles.tabular}>
            {rowTime}
          </Text>
        </Animated.View>

        <Animated.View style={[styles.fullLayer, fullLayer]}>
          <View style={styles.titleRow}>
            {/* Default display line height: Scheherazade's descenders clip in a tighter box. */}
            <Display size={34} bold color={ink}>
              {title}
            </Display>
            <Text size={12} weight="medium" color={inkSoft} style={highlighted && styles.soft}>
              {dayLabel}
            </Text>
          </View>
          <View style={styles.timesRow}>
            {times.map((t) => (
              <View key={t.label} style={styles.timeBlock}>
                <Text size={11} weight="semi" color={inkSoft} style={highlighted && styles.soft}>
                  {t.label}
                </Text>
                <Text size={19} weight="bold" color={ink} style={styles.tabular}>
                  {formatTime12(t.at)}
                </Text>
              </View>
            ))}
          </View>
          {live ? (
            <View style={[styles.liveRow, { borderTopColor: rule }]}>
              <Text size={11.5} weight="semi" color={c.accent}>
                {LIVE_LABEL[live.kind]}
              </Text>
              <CountdownDigits at={live.at} size={22} color={ink} />
            </View>
          ) : null}
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const FILL = { position: 'absolute', top: 0, bottom: 0, start: 0, end: 0 } as const;

const styles = StyleSheet.create({
  // Outside the band's clipping so the card can start low, on the pressed row.
  slot: { position: 'absolute', start: HERO_MARGIN, end: HERO_MARGIN, zIndex: 2 },
  card: { borderWidth: 1, overflow: 'hidden' },
  shadow: { ...FILL, borderRadius: radius.xl },
  rowLayer: {
    ...FILL,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
  },
  rowName: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 7, height: 7, borderRadius: 999 },
  fullLayer: { ...FILL, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14, gap: 10 },
  soft: { opacity: 0.72 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  timesRow: { flexDirection: 'row', gap: 28 },
  timeBlock: { gap: 0 },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: 10,
  },
  tabular: { fontVariant: ['tabular-nums'] },
});
