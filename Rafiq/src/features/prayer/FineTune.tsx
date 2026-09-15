import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { LinearTransition, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { toArabicIndic } from '@/shared/lib/arabic';
import { click, stop } from '@/shared/lib/haptics';
import { useMotion } from '@/shared/lib/motion';
import { ADJUST_LIMIT, clampAdjust, useSettings, type Adjustments, type PrayerKey } from '@/shared/storage/settings';
import { radius } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { ChevronDownIcon, MinusIcon, PlusIcon } from '@/shared/ui/Icons';
import { PressScale } from '@/shared/ui/PressScale';
import { Text } from '@/shared/ui/Text';
import { PRAYERS } from './engine';

/** `+٢ د`, `−٣ د`, or `٠`. */
function formatAdjust(n: number): string {
  if (n === 0) return '٠';
  return `${n > 0 ? '+' : '−'}${toArabicIndic(Math.abs(n))} د`;
}

function summary(adj: Adjustments): string {
  const count = Object.values(adj).filter((v) => v).length;
  if (count === 0) return 'معطّل';
  if (count === 1) return 'صلاة واحدة';
  if (count === 2) return 'صلاتان';
  return `${toArabicIndic(count)} صلوات`;
}

/**
 * Collapsible per-prayer minute offsets, for matching a local mosque table.
 * Writes straight to settings; everything downstream recomputes.
 */
export function FineTune() {
  const { c } = useTheme();
  const m = useMotion();
  const { settings, update } = useSettings();
  const [open, setOpen] = useState(false);
  const adj = settings.adjustments;
  const anyTuned = Object.values(adj).some((v) => v);

  const rot = useSharedValue(0);
  useEffect(() => {
    rot.set(m.reduced ? (open ? 180 : 0) : withTiming(open ? 180 : 0, { duration: 220 }));
  }, [open, m.reduced, rot]);
  const chevronStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.get()}deg` }] }));

  const setAdj = (key: PrayerKey, delta: number) => {
    const next = clampAdjust((adj[key] ?? 0) + delta);
    if (next === (adj[key] ?? 0)) {
      stop();
      return;
    }
    click();
    const merged: Adjustments = { ...adj };
    if (next === 0) delete merged[key];
    else merged[key] = next;
    update({ adjustments: merged });
  };

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
            ضبط دقيق
          </Text>
          <Text size={12} color={anyTuned ? c.accent : c.tm}>
            {summary(adj)}
          </Text>
        </View>
        <Animated.View style={chevronStyle}>
          <ChevronDownIcon size={16} color={c.tm} />
        </Animated.View>
      </PressScale>

      {open ? (
        <Animated.View entering={m.fadeInDown(0, 220)} exiting={m.fadeOut(150)} layout={layout} style={styles.body}>
          <Text size={11.5} color={c.tm} style={styles.hint}>
            أضف أو اطرح دقائق لكل صلاة لمطابقة جدول مسجدك.
          </Text>
          {PRAYERS.map((p) => {
            const value = adj[p.key] ?? 0;
            return (
              <View key={p.key} style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Text size={14} weight="semi" color={p.isPrayer ? c.tp : c.tm}>
                  {p.name}
                </Text>
                <View style={styles.stepper}>
                  <Stepper label={`إنقاص ${p.name}`} disabled={value <= -ADJUST_LIMIT} onPress={() => setAdj(p.key, -1)}>
                    <MinusIcon size={14} color={value <= -ADJUST_LIMIT ? c.border : c.tp} />
                  </Stepper>
                  <Text
                    size={13.5}
                    weight="bold"
                    color={value === 0 ? c.tm : c.accent}
                    align="center"
                    style={styles.value}
                  >
                    {formatAdjust(value)}
                  </Text>
                  <Stepper label={`زيادة ${p.name}`} disabled={value >= ADJUST_LIMIT} onPress={() => setAdj(p.key, 1)}>
                    <PlusIcon size={14} color={value >= ADJUST_LIMIT ? c.border : c.tp} />
                  </Stepper>
                </View>
              </View>
            );
          })}
          {anyTuned ? (
            <Animated.View entering={m.fadeInUp(0, 200)} exiting={m.fadeOut(120)} style={styles.resetRow}>
              <PressScale
                accessibilityRole="button"
                onPress={() => update({ adjustments: {} })}
                pressedScale={0.95}
              >
                <Text size={12.5} weight="semi" color={c.accent}>
                  إعادة الضبط
                </Text>
              </PressScale>
            </Animated.View>
          ) : null}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

function Stepper({
  label,
  disabled,
  onPress,
  children,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  const { c } = useTheme();
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      onPress={onPress}
      pressedScale={disabled ? 0.96 : 0.88}
      style={[styles.stepBtn, { backgroundColor: c.bg, borderColor: c.border, opacity: disabled ? 0.5 : 1 }]}
    >
      {children}
    </PressScale>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { minWidth: 52, fontVariant: ['tabular-nums'] },
  resetRow: { alignItems: 'center', paddingTop: 2 },
});
