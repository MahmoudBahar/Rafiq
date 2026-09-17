import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PixelRatio, StyleSheet, View, useWindowDimensions } from 'react-native';
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
/**
 * The background is three pieces so the card can change height without a
 * layout pass: two fixed corner caps and a middle strip that scales. Height
 * is a layout prop, and animating it on the new architecture commits the
 * shadow tree every frame (which lagged the transforms and halved the fps).
 */
const CAP = 28;
/** Physical pixels per point; moving edges are snapped to whole pixels. */
const PX = PixelRatio.get();
/** Fill inset so the settled card's outline (on the shadow view) shows around the pieces. */
const INSET = 1;
/**
 * No overlap between the strip and the caps: the strip's scaled height is
 * exactly the card's height minus the caps, so the pieces meet edge to edge.
 * (A hairline gap seen earlier came from a scale computed without the
 * overlap that was then in use, not from the pieces themselves.)
 */
const OVERLAP = 0;
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
  const settledH = live ? HERO_LIVE_H : HERO_H;

  // The card's window position is its slot's `top`: this screen fills the
  // window, so no measurement round trip is needed and the spring starts
  // before the first paint. Missing or absurd params fall back to a short rise.
  const valid = origin !== null && origin.h > 0 && origin.y >= 0 && origin.y < winH;
  const originDy = useSharedValue(valid ? origin.y - top : FALLBACK_DY);
  const originH = useSharedValue(valid ? origin.h : settledH);
  const kicked = useRef(false);
  const [landed, setLanded] = useState(reduced);
  useLayoutEffect(() => {
    if (kicked.current) return;
    kicked.current = true;
    progress.set(reduced ? 1 : withSpring(1, SPRING));
  }, [reduced, progress]);
  useEffect(() => {
    if (reduced) return;
    const id = setTimeout(() => setLanded(true), SHADOW_MS);
    return () => clearTimeout(id);
  }, [reduced]);

  // The next prayer's row is drawn in the hero colours; its page keeps them.
  const highlighted = origin?.highlighted ?? false;
  const bg = highlighted ? c.hero : c.surface;
  const border = highlighted ? c.hero : c.border;
  const mid = settledH - 2 * CAP - 2 * INSET;
  // Every moving edge is snapped to a whole physical pixel: two edges meeting
  // between pixels are each drawn at partial coverage and the background
  // shows through as a hairline. (Borders are also kept off the pieces: on
  // Android a zero-width side still insets the fill by a fraction.)
  const snap = (v: number) => {
    'worklet';
    return Math.round(v * PX) / PX;
  };
  const card = useAnimatedStyle(() => ({
    transform: [{ translateY: snap(originDy.get() * (1 - progress.get())) }],
  }));
  // 2. The shadow shows only while the card is settled: on the way back it must
  // not ride along at full size (it is a full-size view inside the container).
  const shadow = useAnimatedStyle(() => ({ opacity: progress.get() > 0.98 ? 1 : 0 }));
  const paint = { backgroundColor: bg };
  // Every style below reads `progress` directly: a helper worklet called from
  // these styles was seen with a frozen value on the UI thread.
  const capTop = useAnimatedStyle(() => {
    const r = interpolate(progress.get(), [0, 1], [radius.md, radius.xl]);
    return { borderTopStartRadius: r, borderTopEndRadius: r };
  });
  const capBottom = useAnimatedStyle(() => {
    const t = progress.get();
    const h = snap(interpolate(t, [0, 1], [originH.get(), settledH]));
    const r = interpolate(t, [0, 1], [radius.md, radius.xl]);
    return { borderBottomStartRadius: r, borderBottomEndRadius: r, transform: [{ translateY: h - settledH }] };
  });
  const midStyle = useAnimatedStyle(() => {
    // Scale about the top edge (RN scales about the centre, so shift up by the
    // lost half). With `h` snapped, the strip's ends land on whole pixels too.
    const h = snap(interpolate(progress.get(), [0, 1], [originH.get(), settledH]));
    const natural = mid + 2 * OVERLAP;
    // Target length: the card height minus both caps and both insets.
    const sc = Math.max(0.001, (h - 2 * CAP - 2 * INSET + 2 * OVERLAP) / natural);
    return { transform: [{ translateY: (-(1 - sc) * natural) / 2 }, { scaleY: sc }] };
  });
  // The row layer stays centred in the short box; the full layer waits for room.
  const rowLayer = useAnimatedStyle(() => {
    const t = progress.get();
    const h = interpolate(t, [0, 1], [originH.get(), settledH]);
    return { opacity: interpolate(t, [0, 0.5], [1, 0], 'clamp'), transform: [{ translateY: (h - settledH) / 2 }] };
  });
  const fullLayer = useAnimatedStyle(() => ({ opacity: interpolate(progress.get(), [0.5, 1], [0, 1], 'clamp') }));

  const rowText = highlighted ? c.herotext : c.tp;
  const rowTimeColor = highlighted ? c.herotext : c.ts;
  const ink = highlighted ? c.herotext : c.tp;
  const inkSoft = highlighted ? c.herotext : c.tm;
  // Hex tokens: append an alpha byte for the translucent divider on the hero colour.
  const rule = highlighted ? `${c.herotext}33` : c.border;

  return (
    <View style={[styles.slot, { top, height: settledH }]}>
      <Animated.View style={[styles.card, card]}>
        {/* Mounted after landing (a blurred shadow is costly to re-render while the card moves). */}
        {landed ? (
          <Animated.View
            style={[styles.shadow, { backgroundColor: bg, borderColor: border, boxShadow: `0 12px 30px ${c.shadow}` }, shadow]}
          />
        ) : null}
        {/* Strip, then the caps. */}
        <Animated.View style={[styles.mid, { top: INSET + CAP - OVERLAP, height: mid + 2 * OVERLAP }, paint, midStyle]} />
        <Animated.View style={[styles.cap, styles.capTop, paint, capTop]} />
        <Animated.View style={[styles.cap, styles.capBottom, paint, capBottom]} />
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
  card: { flex: 1 },
  // Settled card: outline and shadow live here, under the borderless pieces.
  shadow: { ...FILL, borderRadius: radius.xl, borderWidth: 1 },
  cap: { position: 'absolute', start: INSET, end: INSET, height: CAP },
  capTop: { top: INSET },
  capBottom: { bottom: INSET },
  mid: { position: 'absolute', start: INSET, end: INSET },
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
