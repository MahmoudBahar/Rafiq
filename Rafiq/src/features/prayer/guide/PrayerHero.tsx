import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PixelRatio, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { ROW_GAP } from '@/features/prayer/PrayerList';
import { formatTime12 } from '@/shared/lib/arabic';
import { useMotion } from '@/shared/lib/motion';
import { radius } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { Display, Text } from '@/shared/ui/Text';
import { CountdownDigits } from '../CountdownDigits';


/** Card height once settled; every page's card has the bottom row, so one height. */
export const HERO_H = 204;
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
 * The strip runs a little way under each cap. Meeting edge to edge left a
 * hairline: the joint falls at 29 dp, which is not a whole number of physical
 * pixels on most screens (108.75 px at 3.75x), so each piece was drawn at
 * partial coverage along that row and the page showed through. It only showed
 * on the way back, when the backing shadow view is hidden, and mostly on the
 * cream next-prayer card. The pieces are one opaque colour and the caps are
 * drawn over the strip, so the overlap itself cannot be seen.
 */
const OVERLAP = 1;
const SPRING = { damping: 18, stiffness: 170, mass: 0.9 };
/** The row-shaped box under the card shows only while the card is within ~4 dp of the row's height. */
const RING_UNTIL = 0.03;
const RING_ROOM = 32;
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
  /** Bottom row: a ticking countdown (`at`) or a static value. */
  foot: HeroFoot;
  origin: HeroOrigin | null;
  /** Morph progress owned by the screen: 0 = on the row, 1 = settled. */
  progress: SharedValue<number>;
  /**
   * Window top and height of the row's place on the home. Owned by the screen,
   * which measures the place again before the return.
   */
  rowY: SharedValue<number>;
  rowH: SharedValue<number>;
  /** The page's scroll offset: the card sits in the scrolled content, the row does not. */
  scrollY: SharedValue<number>;
  /** Final top of the card inside the band. */
  top: number;
  /** The return has begun. */
  returning: boolean;
}

export interface HeroFoot {
  label: string;
  /** Counted down to, ticking. */
  at?: Date;
  /** Shown instead when there is nothing to count to. */
  value?: string;
}

/**
 * The hero card. It mounts invisible, measures where it will sit, then
 * springs from the pressed row's rectangle into place while its row-styled
 * layer cross-fades into the full card.
 */
export function PrayerHero({
  title,
  rowName,
  rowTime,
  dayLabel,
  times,
  foot,
  origin,
  progress,
  rowY,
  rowH,
  scrollY,
  top,
  returning,
}: PrayerHeroProps) {
  const { c } = useTheme();
  const { reduced } = useMotion();
  const { height: winH } = useWindowDimensions();
  const settledH = HERO_H;

  // The card's window position is its slot's `top`: this screen fills the
  // window, so no measurement round trip is needed and the spring starts
  // before the first paint. Missing or absurd params fall back to a short rise.
  const valid = origin !== null && origin.h > 0 && origin.y >= 0 && origin.y < winH;
  const kicked = useRef(false);
  const [landed, setLanded] = useState(reduced);
  // The shadow fades in once after landing (a blurred view is costly to fade,
  // but this is one short fade on a settled page) and cuts out at the first
  // frame of the return so it never rides back at full size.
  const shadowIn = useSharedValue(reduced ? 1 : 0);
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
  useEffect(() => {
    if (landed && !reduced) shadowIn.set(withTiming(1, { duration: 220 }));
  }, [landed, reduced, shadowIn]);

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
  // The way to the row is measured from where the card is now: once the page has
  // been scrolled the card has gone up with it, and the row is that much further.
  const card = useAnimatedStyle(() => {
    const dy = valid ? rowY.get() - top + scrollY.get() : FALLBACK_DY;
    return { transform: [{ translateY: snap(dy * (1 - progress.get())) }] };
  });
  // 2. The shadow shows only while the card is settled: on the way back it must
  // not ride along at full size (it is a full-size view inside the container).
  // It is taken down by React (see below), not by this style alone: a settled
  // animated opacity is handed back to React as the view's own, and a one-frame
  // change written at the same instant as the return's first commit was seen to
  // lose the race, leaving a full-size opaque box travelling back over the rows.
  const shadow = useAnimatedStyle(() => ({ opacity: progress.get() > 0.98 ? shadowIn.get() : 0 }));
  const paint = { backgroundColor: bg };
  // The home row's own box (fill, outline and, for the next-prayer row, its shadow), at the row's
  // size, under the pieces. The pieces are inset by the border's width, so it shows around them
  // only; while the card is taller than the row its bottom edge is hidden behind them. It is
  // filled like the row because an outline alone left a hairline of page between it and the
  // pieces (the inset is not a whole number of pixels). It is there
  // as the card lifts off and again as it lands, so that handing over to the real row, which
  // has that border and shadow, changes nothing the eye can catch.
  const rowRadius = highlighted ? radius.lg : radius.md;
  // Only over the last few dp of height: the box is as tall as the row and a border's width wider
  // than the pieces, so while the card is still taller it would stick out at the sides as ears.
  const ring = useAnimatedStyle(() => ({ opacity: interpolate(progress.get(), [0, RING_UNTIL], [1, 0], 'clamp') }));
  // Every style below reads `progress` directly: a helper worklet called from
  // these styles was seen with a frozen value on the UI thread.
  const capTop = useAnimatedStyle(() => {
    const r = interpolate(progress.get(), [0, 1], [rowRadius - INSET, radius.xl]);
    return { borderTopStartRadius: r, borderTopEndRadius: r };
  });
  const capBottom = useAnimatedStyle(() => {
    const t = progress.get();
    const h = snap(interpolate(t, [0, 1], [valid ? rowH.get() : settledH, settledH]));
    const r = interpolate(t, [0, 1], [rowRadius - INSET, radius.xl]);
    return { borderBottomStartRadius: r, borderBottomEndRadius: r, transform: [{ translateY: h - settledH }] };
  });
  const midStyle = useAnimatedStyle(() => {
    // Scale about the top edge (RN scales about the centre, so shift up by the
    // lost half). With `h` snapped, the strip's ends land on whole pixels too.
    const h = snap(interpolate(progress.get(), [0, 1], [valid ? rowH.get() : settledH, settledH]));
    const natural = mid + 2 * OVERLAP;
    // Target length: the card height minus both caps and both insets.
    const sc = Math.max(0.001, (h - 2 * CAP - 2 * INSET + 2 * OVERLAP) / natural);
    return { transform: [{ translateY: (-(1 - sc) * natural) / 2 }, { scaleY: sc }] };
  });
  // The text is cut at the box's bottom edge. Both layers are as tall as the settled
  // card, and on the way back the box shrinks over the live home with nothing behind
  // it to hide what hangs out. Done with a pair of opposite translations, since a
  // clip that changed height would be a layout pass per frame.
  const clip = useAnimatedStyle(() => {
    const h = snap(interpolate(progress.get(), [0, 1], [valid ? rowH.get() : settledH, settledH]));
    return { transform: [{ translateY: h - settledH }] };
  });
  const unclip = useAnimatedStyle(() => {
    const h = snap(interpolate(progress.get(), [0, 1], [valid ? rowH.get() : settledH, settledH]));
    return { transform: [{ translateY: settledH - h }] };
  });
  // The row layer stays centred in the short box. The two fades overlap so the box
  // never travels blank.
  const rowLayer = useAnimatedStyle(() => {
    const t = progress.get();
    const h = interpolate(t, [0, 1], [valid ? rowH.get() : settledH, settledH]);
    return { opacity: interpolate(t, [0, 0.6], [1, 0], 'clamp'), transform: [{ translateY: (h - settledH) / 2 }] };
  });
  const fullLayer = useAnimatedStyle(() => ({ opacity: interpolate(progress.get(), [0.4, 1], [0, 1], 'clamp') }));

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
        {landed && !returning ? (
          <Animated.View
            style={[styles.shadow, { backgroundColor: bg, borderColor: border, boxShadow: `0 12px 30px ${c.shadow}` }, shadow]}
          />
        ) : null}
        {valid ? (
          // Clipped just below the row: on the home the next row is drawn after this one and
          // covers the shadow that falls on it, so the shadow only ever shows in the gap. One
          // physical pixel short: the gap is not a whole number of pixels, and rounding it up
          // laid the shadow over the next row's top border.
          <View pointerEvents="none" style={[styles.ringClip, { height: RING_ROOM + origin.h + ROW_GAP - 1 / PX }]}>
            <Animated.View
              style={[
                styles.ring,
                { height: origin.h, borderRadius: rowRadius, borderColor: border, backgroundColor: bg },
                highlighted && { boxShadow: `0 8px 20px ${c.shadow}` },
                ring,
              ]}
            />
          </View>
        ) : null}
        {/* Strip, then the caps. */}
        <Animated.View style={[styles.mid, { top: INSET + CAP - OVERLAP, height: mid + 2 * OVERLAP }, paint, midStyle]} />
        <Animated.View style={[styles.cap, styles.capTop, paint, capTop]} />
        <Animated.View style={[styles.cap, styles.capBottom, paint, capBottom]} />
        <Animated.View pointerEvents="none" style={[styles.clip, clip]}>
          <Animated.View style={[styles.unclip, unclip]}>
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
              <View style={[styles.liveRow, { borderTopColor: rule }]}>
                <Text size={11.5} weight="semi" color={foot.at ? c.accent : inkSoft} style={!foot.at && highlighted && styles.soft}>
                  {foot.label}
                </Text>
                {foot.at ? (
                  <CountdownDigits at={foot.at} size={22} color={ink} />
                ) : (
                  <Text size={19} weight="bold" color={ink} style={styles.tabular}>
                    {foot.value}
                  </Text>
                )}
              </View>
            </Animated.View>
          </Animated.View>
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
  // Room above and beside the row for its shadow (the row above is drawn first, so the shadow does fall on it).
  ringClip: { position: 'absolute', top: -RING_ROOM, start: -HERO_MARGIN, end: -HERO_MARGIN, overflow: 'hidden' },
  ring: { position: 'absolute', top: RING_ROOM, start: HERO_MARGIN, end: HERO_MARGIN, borderWidth: 1 },
  cap: { position: 'absolute', start: INSET, end: INSET, height: CAP },
  capTop: { top: INSET },
  capBottom: { bottom: INSET },
  mid: { position: 'absolute', start: INSET, end: INSET },
  clip: { ...FILL, overflow: 'hidden' },
  unclip: FILL,
  rowLayer: {
    ...FILL,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // The home row's padding plus its border: the text must not move when the real row takes over.
    paddingHorizontal: 19,
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
