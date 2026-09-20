import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
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

/** Arabic UI text (IBM Plex Sans Arabic). Defaults to primary text colour. */
export function Text({ size = 14, weight = 'regular', color, lineHeight, align, style, ...rest }: TextProps) {
  const { c } = useTheme();
  return (
    <RNText
      accessibilityLanguage="ar"
      {...rest}
      style={[
        {
          fontFamily: WEIGHT_TO_FAMILY[weight],
          fontSize: size,
          color: color ?? c.tp,
          writingDirection: 'rtl',
          textAlign: align,
          lineHeight: lineHeight ?? Math.round(size * 1.5),
        },
        style,
      ]}
    />
  );
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
export function Display({ size = 28, bold = false, color, lineHeight, align, style, ...rest }: DisplayProps) {
  const { c } = useTheme();
  const natural = Math.ceil(size * DISPLAY_NATURAL);
  const pull = lineHeight === undefined ? -(natural - Math.round(size * DISPLAY_LINE)) / 2 : 0;
  return (
    <RNText
      accessibilityLanguage="ar"
      {...rest}
      style={[
        {
          fontFamily: bold ? fonts.displayBold : fonts.display,
          fontSize: size,
          color: color ?? c.tp,
          writingDirection: 'rtl',
          textAlign: align,
          lineHeight: lineHeight ?? natural,
          marginVertical: pull,
        },
        style,
      ]}
    />
  );
}
