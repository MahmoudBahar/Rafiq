import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { select } from '@/shared/lib/haptics';
import { radius } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { Text } from './Text';

export interface SegmentOption<K extends string> {
  key: K;
  label: string;
  icon?: (color: string) => ReactNode;
}

export interface SegmentedProps<K extends string> {
  options: SegmentOption<K>[];
  value: K;
  onChange: (key: K) => void;
}

export function Segmented<K extends string>({ options, value, onChange }: SegmentedProps<K>) {
  const { c } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: c.surface, borderColor: c.border }]}>
      {options.map((o) => {
        const active = o.key === value;
        const color = active ? c.herotext : c.tm;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (active) return;
              select();
              onChange(o.key);
            }}
            style={[styles.segment, { backgroundColor: active ? c.hero : 'transparent' }]}
          >
            {o.icon?.(color)}
            <Text size={13} weight="bold" color={color}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 6,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 11,
    paddingHorizontal: 6,
    borderRadius: radius.sm,
  },
});
