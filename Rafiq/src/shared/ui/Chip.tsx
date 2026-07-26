import { Pressable, StyleSheet } from 'react-native';
import { radius } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { Text } from './Text';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  size?: 'sm' | 'md';
}

export function Chip({ label, selected = false, onPress, size = 'sm' }: ChipProps) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        size === 'md' ? styles.md : styles.sm,
        { backgroundColor: selected ? c.selbg : c.surface, borderColor: selected ? c.accent : c.border },
      ]}
    >
      <Text size={size === 'md' ? 13.5 : 13} weight="semi" color={selected ? c.accent : c.tp}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { borderWidth: 1, borderRadius: radius.pill },
  sm: { paddingVertical: 9, paddingHorizontal: 16 },
  md: { paddingVertical: 10, paddingHorizontal: 18 },
});
