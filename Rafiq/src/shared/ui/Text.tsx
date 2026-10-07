import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import Animated, { type AnimatedProps } from 'react-native-reanimated';
import { fonts } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';

type Weight = 'regular' | 'medium' | 'semi' | 'bold';

const WEIGHT_TO_FAMILY: Record<Weight, string> = {
  regular: fonts.ui,
  medium: fonts.uiMedium,
  semi: fonts.uiSemi,
  bold: fonts.uiBold,
};

export interface TextProps extends RNTextProps {
  size?: number;
  weight?: Weight;
  color?: string;
  lineHeight?: number;
  align?: TextStyle['textAlign'];
}

function useTextStyle({ size = 14, weight = 'regular', color, lineHeight, align }: TextProps): TextStyle {
  const { c } = useTheme();
  return {
    fontFamily: WEIGHT_TO_FAMILY[weight],
    fontSize: size,
    color: color ?? c.tp,
    writingDirection: 'rtl',
    textAlign: align,
    lineHeight: lineHeight ?? Math.round(size * 1.5),
  };
}

/** Arabic UI text (IBM Plex Sans Arabic). Defaults to primary text colour. */
export function Text({ size, weight, color, lineHeight, align, style, ...rest }: TextProps) {
  const base = useTextStyle({ size, weight, color, lineHeight, align });
  return <RNText accessibilityLanguage="ar" {...rest} style={[base, style]} />;
}

export type AnimatedTextProps = Omit<TextProps, 'style'> & { style?: AnimatedProps<RNTextProps>['style'] };

/** `Text` whose `style` may be an animated one: for a colour that moves. */
export function AnimatedText({ size, weight, color, lineHeight, align, style, ...rest }: AnimatedTextProps) {
  const base = useTextStyle({ size, weight, color, lineHeight, align });
  return <Animated.Text accessibilityLanguage="ar" {...rest} style={[base, style]} />;
}

export interface DisplayProps extends Omit<TextProps, 'weight'> {
  bold?: boolean;
}

/** Scheherazade New's own line: ascent 1.343 + descent 0.697 of the font size (from its hhea table). */
const DISPLAY_NATURAL = 2.04;
const DISPLAY_LINE = 1.35;

/**
 * Arabic display text (Scheherazade New) for titles and the wordmark.
 * Android clips text at its line box, not at its view, so a box tighter than
 * the face's natural line shaves whatever reaches past it: the dots under a
 * final ي were the first to go. The line box is therefore the natural one, and
 * an equal negative margin takes the extra height back, which leaves the
 * baseline, and every layout, exactly where the 1.35 box had them. A caller
 * that passes its own `lineHeight` (running text) keeps it as given.
 */
export function Display({ size, bold, color, lineHeight, align, style, ...rest }: DisplayProps) {
  const base = useDisplayStyle({ size, bold, color, lineHeight, align });
  return <RNText accessibilityLanguage="ar" {...rest} style={[base, style]} />;
}

export type AnimatedDisplayProps = Omit<DisplayProps, 'style'> & { style?: AnimatedProps<RNTextProps>['style'] };

/** `Display` whose `style` may be an animated one. */
export function AnimatedDisplay({ size, bold, color, lineHeight, align, style, ...rest }: AnimatedDisplayProps) {
  const base = useDisplayStyle({ size, bold, color, lineHeight, align });
  return <Animated.Text accessibilityLanguage="ar" {...rest} style={[base, style]} />;
}

function useDisplayStyle({ size = 28, bold = false, color, lineHeight, align }: DisplayProps): TextStyle {
  const { c } = useTheme();
  const natural = Math.ceil(size * DISPLAY_NATURAL);
  const pull = lineHeight === undefined ? -(natural - Math.round(size * DISPLAY_LINE)) / 2 : 0;
  return {
    fontFamily: bold ? fonts.displayBold : fonts.display,
    fontSize: size,
    color: color ?? c.tp,
    writingDirection: 'rtl',
    textAlign: align,
    lineHeight: lineHeight ?? natural,
    marginVertical: pull,
  };
}
