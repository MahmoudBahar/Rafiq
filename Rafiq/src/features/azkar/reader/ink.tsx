import { interpolateColor, useAnimatedProps, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Animated from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import type { Sky } from '@/shared/theme/tokens';

/**
 * The band's ink between two skies: `mix` runs 0 → 1 as the reader moves from
 * one prayer's sky to the next, and every coloured thing in the band follows
 * it, so a title changes colour in place rather than fading through a ghost
 * of itself. Settled, both skies are the same.
 */
export interface SkyMix {
  mix: SharedValue<number>;
  from: Sky;
  to: Sky;
}

/** An animated style with one colour property moving between the two skies' `pick`. */
export function useInk(ink: SkyMix, pick: (s: Sky) => string, prop: 'color' | 'backgroundColor' | 'borderColor' = 'color') {
  const a = pick(ink.from);
  const b = pick(ink.to);
  return useAnimatedStyle(() => ({ [prop]: a === b ? a : interpolateColor(ink.mix.get(), [0, 1], [a, b]) }));
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** The reader's back chevron, stroked in the moving ink. */
export function InkChevron({ ink, size = 16 }: { ink: SkyMix; size?: number }) {
  const a = ink.from.text;
  const b = ink.to.text;
  const props = useAnimatedProps(() => ({ stroke: a === b ? a : interpolateColor(ink.mix.get(), [0, 1], [a, b]) }));
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <AnimatedPath d="M9 6l6 6-6 6" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" animatedProps={props} />
    </Svg>
  );
}
