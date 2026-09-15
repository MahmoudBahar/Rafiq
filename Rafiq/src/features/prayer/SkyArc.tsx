import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  ReduceMotion,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { formatTimeShort, toArabicIndic } from '@/shared/lib/arabic';
import { physicalLeft } from '@/shared/lib/rtl';
import { useOscillator } from '@/shared/lib/useOscillator';
import { useTheme } from '@/shared/theme/useTheme';
import { MoonIcon, SunIcon } from '@/shared/ui/Icons';
import { Text } from '@/shared/ui/Text';
import type { DayTimes } from './engine';
import { moonPath } from './moonPath';
import { ARC_HEIGHT, ARC_WIDTH, P_START, type SkyState } from './sky';

const AnimatedG = Animated.createAnimatedComponent(G);

const SUN_R = 7;
const MOON_R = 7;

interface SkyArcProps {
  sky: SkyState;
  day: DayTimes;
}

/**
 * The header arc. Everything that moves every frame (halos, the empty-arc
 * marker) lives in plain animated views layered over the SVG: an animated
 * prop inside react-native-svg re-rasterises the whole canvas on the CPU each
 * frame, which is what dragged the idle home screen down to ~25 fps.
 */
export function SkyArc({ sky, day }: SkyArcProps) {
  const { c } = useTheme();
  const pulse = useOscillator(1500);

  // Rendered width of the SVG, to place the overlays in dp (height is fixed at ARC_HEIGHT).
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w !== width) setWidth(w);
  };
  const sx = width / ARC_WIDTH;

  // Moonrise / moonset fade instead of popping. The last on-arc position is
  // kept so a fade-out finishes where the moon was.
  const moonOp = useSharedValue(sky.moon.visible ? 1 : 0);
  useEffect(() => {
    moonOp.set(withTiming(sky.moon.visible ? 1 : 0, { duration: 400, reduceMotion: ReduceMotion.System }));
  }, [sky.moon.visible, moonOp]);
  const moonStyle = useAnimatedProps(() => ({ opacity: moonOp.get() }));
  const [moonPos, setMoonPos] = useState({ x: sky.moon.x, y: sky.moon.y });
  if (sky.moon.visible && (moonPos.x !== sky.moon.x || moonPos.y !== sky.moon.y)) {
    setMoonPos({ x: sky.moon.x, y: sky.moon.y });
  }

  const litPath = sky.moon.fraction >= 0.03 ? moonPath(sky.moon.phase, MOON_R) : null;
  const dayMinutes = Math.round((day.sunset.getTime() - day.byKey.sunrise.getTime()) / 60_000);
  const dayLength = toArabicIndic(`${Math.floor(dayMinutes / 60)}:${String(dayMinutes % 60).padStart(2, '0')}`);

  return (
    <View style={styles.wrap}>
      <View onLayout={onLayout}>
        <Svg width="100%" height={ARC_HEIGHT} viewBox={`0 0 ${ARC_WIDTH} ${ARC_HEIGHT}`} preserveAspectRatio="none">
          {sky.arc.map((d) => (
            <Path
              key={d}
              d={d}
              stroke={c.arcdim}
              strokeWidth={2}
              strokeDasharray="1 6"
              strokeLinecap="round"
              fill="none"
            />
          ))}

          {sky.sun.trail.map((d) => (
            <Path key={d} d={d} stroke={c.accent} strokeWidth={2.5} strokeLinecap="round" fill="none" />
          ))}

          <AnimatedG transform={`translate(${moonPos.x} ${moonPos.y})`} animatedProps={moonStyle}>
            <Circle cx={0} cy={0} r={MOON_R + 7} fill={c.moon} opacity={0.1} />
            <Circle cx={0} cy={0} r={MOON_R} fill={c.moon} opacity={0.22} />
            {litPath ? <Path d={litPath} fill={c.moon} /> : null}
          </AnimatedG>

          {sky.sun.visible ? (
            <>
              {sky.sun.glow > 0 ? (
                <Circle
                  cx={sky.sun.x}
                  cy={sky.sun.y}
                  r={8 + 12 * sky.sun.glow}
                  fill={c.accent}
                  opacity={0.06 + 0.2 * sky.sun.glow}
                />
              ) : null}
              <Circle cx={sky.sun.x} cy={sky.sun.y} r={SUN_R} fill={c.accent} opacity={sky.sun.opacity} />
            </>
          ) : null}
        </Svg>

        {width > 0 ? (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {sky.sun.visible ? (
              <Halo
                x={sky.sun.x * sx}
                y={sky.sun.y}
                radius={12 * sx}
                grow={1.35}
                color={c.accent}
                width={1.5}
                opacity={[0.35 * sky.sun.opacity, 0.12 * sky.sun.opacity]}
                pulse={pulse}
              />
            ) : null}
            {sky.moon.visible ? (
              <Halo
                x={sky.moon.x * sx}
                y={sky.moon.y}
                radius={11 * sx}
                grow={1.35}
                color={c.moon}
                width={1.2}
                opacity={[0.4, 0.15]}
                pulse={pulse}
              />
            ) : null}
            {sky.empty ? (
              <Halo
                x={P_START.x * sx}
                y={P_START.y}
                radius={2.2 * sx}
                grow={1.45}
                color={c.accent}
                width={0}
                fill
                opacity={[0.7, 0.25]}
                pulse={pulse}
              />
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={styles.footer}>
        <EndTimes kind="rise" sun={day.byKey.sunrise} moon={sky.moon.rise} />
        <Text size={10} weight="semi" color={c.tm} align="center" style={styles.dayLength}>
          طول النهار {dayLength}
        </Text>
        <EndTimes kind="set" sun={day.sunset} moon={sky.moon.set} />
      </View>
    </View>
  );
}

interface HaloProps {
  /** Centre in dp within the arc box. */
  x: number;
  y: number;
  radius: number;
  /** Scale at the top of the pulse. */
  grow: number;
  color: string;
  width: number;
  fill?: boolean;
  /** Opacity at the bottom and top of the pulse. */
  opacity: [number, number];
  pulse: SharedValue<number>;
}

/** Pulsing ring (or dot) drawn as a plain view, so the pulse never touches the SVG. */
function Halo({ x, y, radius, grow, color, width, fill, opacity, pulse }: HaloProps) {
  const [lo, hi] = opacity;
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.get(), [0, 1], [lo, hi]),
    transform: [{ scale: interpolate(pulse.get(), [0, 1], [1, grow]) }],
  }));
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          ...physicalLeft(x - radius),
          top: y - radius,
          width: radius * 2,
          height: radius * 2,
          borderRadius: radius,
          borderWidth: fill ? 0 : width,
          borderColor: color,
          backgroundColor: fill ? color : 'transparent',
        },
        style,
      ]}
    />
  );
}

interface EndTimesProps {
  kind: 'rise' | 'set';
  sun: Date;
  moon: Date | null;
}

/** Rise or set times of both bodies under one arc end, each behind its glyph. */
function EndTimes({ kind, sun, moon }: EndTimesProps) {
  const { c } = useTheme();
  // The set column is mirrored so its glyphs sit on the outer edge, under the corner.
  const row = kind === 'rise' ? styles.endRow : [styles.endRow, styles.endRowMirrored];
  return (
    <View style={[styles.endTimes, kind === 'set' && styles.endTimesMirrored]}>
      <View style={row}>
        <SunIcon size={10} color={c.accent} strokeWidth={2.4} />
        <Text size={10} weight="semi" color={c.tm}>
          {formatTimeShort(sun)}
        </Text>
      </View>
      <View style={row}>
        <MoonIcon size={10} color={c.moon} strokeWidth={2.4} />
        <Text size={10} weight="semi" color={c.tm}>
          {moon ? formatTimeShort(moon) : '—'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 6, marginTop: 6 },
  // Pulled up into the empty band under the arc and inset so each glyph sits under its corner
  // (corners are 18 of 330 units in from the edges).
  footer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    marginTop: -14,
  },
  dayLength: { marginTop: 1, opacity: 0.9 },
  endTimes: { gap: 1 },
  endTimesMirrored: { alignItems: 'flex-end' },
  endRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  endRowMirrored: { flexDirection: 'row-reverse' },
});
