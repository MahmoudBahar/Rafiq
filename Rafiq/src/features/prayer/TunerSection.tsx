import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { LinearTransition, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useMotion } from '@/shared/lib/motion';
import { radius } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { ChevronDownIcon } from '@/shared/ui/Icons';
import { PressScale } from '@/shared/ui/PressScale';
import { Text } from '@/shared/ui/Text';

export interface TunerSectionProps {
  title: string;
  summary: string;
  /** Summary drawn in accent when the section holds non-default values. */
  tuned: boolean;
  hint: string;
  /** Label of the reset row; the row shows only while `tuned`. */
  resetLabel: string;
  onReset: () => void;
  children: ReactNode;
}

/** Collapsible settings card shared by the fine-tune and iqama tuners. */
export function TunerSection({ title, summary, tuned, hint, resetLabel, onReset, children }: TunerSectionProps) {
  const { c } = useTheme();
  const m = useMotion();
  const [open, setOpen] = useState(false);

  const rot = useSharedValue(0);
  useEffect(() => {
    rot.set(m.reduced ? (open ? 180 : 0) : withTiming(open ? 180 : 0, { duration: 220 }));
  }, [open, m.reduced, rot]);
  const chevronStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.get()}deg` }] }));

  const layout = m.reduced ? undefined : LinearTransition.duration(220);

  return (
    <Animated.View layout={layout} style={styles.section}>
      <PressScale
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        pressedScale={0.985}
        style={[styles.headerCard, { backgroundColor: c.surface, borderColor: c.border }]}
      >
        <View style={styles.headerTexts}>
          <Text size={14.5} weight="semi">
            {title}
          </Text>
          <Text size={12} color={tuned ? c.accent : c.tm}>
            {summary}
          </Text>
        </View>
        <Animated.View style={chevronStyle}>
          <ChevronDownIcon size={16} color={c.tm} />
        </Animated.View>
      </PressScale>

      {open ? (
        <Animated.View entering={m.fadeInDown(0, 220)} exiting={m.fadeOut(150)} layout={layout} style={styles.body}>
          <Text size={11.5} color={c.tm} style={styles.hint}>
            {hint}
          </Text>
          {children}
          {tuned ? (
            <Animated.View entering={m.fadeInUp(0, 200)} exiting={m.fadeOut(120)} style={styles.resetRow}>
              <PressScale accessibilityRole="button" onPress={onReset} pressedScale={0.95}>
                <Text size={12.5} weight="semi" color={c.accent}>
                  {resetLabel}
                </Text>
              </PressScale>
            </Animated.View>
          ) : null}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 9 },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
  headerTexts: { flex: 1, gap: 1 },
  body: { gap: 8 },
  hint: { paddingHorizontal: 4, paddingBottom: 2 },
  resetRow: { alignItems: 'center', paddingTop: 2 },
});
