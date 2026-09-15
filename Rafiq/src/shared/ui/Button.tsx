import type { ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { radius } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { PressScale } from './PressScale';
import { Text } from './Text';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary';
  icon?: ReactNode;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ label, onPress, variant = 'primary', icon, disabled, style }: ButtonProps) {
  const { c } = useTheme();
  const primary = variant === 'primary';
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      haptic={primary ? 'press' : 'tap'}
      style={[
        styles.base,
        primary
          ? { backgroundColor: c.hero, boxShadow: `0 8px 22px ${c.shadow}` }
          : { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
        style,
      ]}
    >
      {icon}
      <Text size={primary ? 14.5 : 14} weight={primary ? 'bold' : 'semi'} color={primary ? c.herotext : c.tp}>
        {label}
      </Text>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
  },
});
