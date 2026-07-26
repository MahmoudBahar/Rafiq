import { Pressable, StyleSheet, View } from 'react-native';
import { radius } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { ClockIcon, CompassIcon, MoonIcon, TasbihIcon } from './Icons';
import { Text } from './Text';

export interface TabBarProps {
  /** Called when a not-yet-available tab is tapped. */
  onComingSoon: () => void;
  bottom: number;
}

/**
 * Floating pill tab bar from the design. Only "الصلاة" exists in this
 * version; the other three tabs surface a coming-soon toast.
 */
export function TabBar({ onComingSoon, bottom }: TabBarProps) {
  const { c } = useTheme();
  const soon = [
    { key: 'azkar', label: 'الأذكار', Icon: MoonIcon },
    { key: 'tasbih', label: 'التسبيح', Icon: TasbihIcon },
    { key: 'qibla', label: 'القبلة', Icon: CompassIcon },
  ] as const;
  return (
    <View
      accessibilityRole="tablist"
      style={[styles.bar, { bottom, backgroundColor: c.tabbg, boxShadow: `0 10px 26px ${c.shadow}` }]}
    >
      <View accessibilityRole="tab" accessibilityState={{ selected: true }} style={[styles.active, { backgroundColor: c.tabactive }]}>
        <ClockIcon size={16} color="#ffffff" />
        <Text size={12.5} weight="bold" color="#ffffff">
          الصلاة
        </Text>
      </View>
      {soon.map(({ key, label, Icon }) => (
        <Pressable
          key={key}
          accessibilityRole="tab"
          accessibilityLabel={label}
          onPress={onComingSoon}
          style={({ pressed }) => [styles.tab, pressed && { opacity: 0.7 }]}
        >
          <Icon size={17} color={c.tabicon} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    start: 24,
    end: 24,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderRadius: radius.pill,
    padding: 8,
  },
  active: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.pill,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  tab: { paddingVertical: 10, paddingHorizontal: 12 },
});
