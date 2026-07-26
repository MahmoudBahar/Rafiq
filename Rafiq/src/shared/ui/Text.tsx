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

/** Arabic display text (Scheherazade New) for titles and the wordmark. */
export function Display({ size = 28, bold = false, color, lineHeight, align, style, ...rest }: DisplayProps) {
  const { c } = useTheme();
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
          lineHeight: lineHeight ?? Math.round(size * 1.35),
        },
        style,
      ]}
    />
  );
}
