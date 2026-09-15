import { Pressable, StyleSheet, View } from 'react-native';
import { select } from '@/shared/lib/haptics';
import { radius } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { Text } from './Text';

export interface RadioCardProps {
  title: string;
  sub: string;
  selected: boolean;
  onPress: () => void;
}

export function RadioCard({ title, sub, selected, onPress }: RadioCardProps) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={() => {
        select();
        onPress();
      }}
      style={[
        styles.card,
        { backgroundColor: selected ? c.selbg : c.surface, borderColor: selected ? c.selbr : c.border },
      ]}
    >
      <View style={[styles.ring, { borderColor: selected ? c.accent : c.border }]}>
        <View style={[styles.dot, { backgroundColor: c.accent, opacity: selected ? 1 : 0 }]} />
      </View>
      <View style={styles.texts}>
        <Text size={14.5} weight="semi">
          {title}
        </Text>
        <Text size={12} color={c.tm}>
          {sub}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
  ring: {
    width: 20,
    height: 20,
    borderRadius: 999,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 10, height: 10, borderRadius: 999 },
  texts: { flex: 1, gap: 1 },
});
