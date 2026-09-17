import { StyleSheet, View } from 'react-native';
import { click, stop } from '@/shared/lib/haptics';
import { radius } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { MinusIcon, PlusIcon } from '@/shared/ui/Icons';
import { PressScale } from '@/shared/ui/PressScale';
import { Text } from '@/shared/ui/Text';

export interface StepperRowProps {
  label: string;
  /** Formatted value shown between the buttons. */
  value: string;
  /** Value is at its resting/default state (drawn muted) rather than tuned (accent). */
  neutral: boolean;
  atMin: boolean;
  atMax: boolean;
  /** Called with ±1; the caller clamps. */
  onStep: (delta: 1 | -1) => void;
}

/**
 * One labelled ± row of the settings tuners (fine-tune offsets, iqama
 * delays). Clicks on each step and thuds once a limit is reached: the only
 * steppers allowed haptics in the app.
 */
export function StepperRow({ label, value, neutral, atMin, atMax, onStep }: StepperRowProps) {
  const { c } = useTheme();
  const step = (delta: 1 | -1, blocked: boolean) => {
    if (blocked) {
      stop();
      return;
    }
    click();
    onStep(delta);
  };
  return (
    <View style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Text size={14} weight="semi">
        {label}
      </Text>
      <View style={styles.stepper}>
        <StepButton label={`إنقاص ${label}`} disabled={atMin} onPress={() => step(-1, atMin)}>
          <MinusIcon size={14} color={atMin ? c.border : c.tp} />
        </StepButton>
        <Text size={13.5} weight="bold" color={neutral ? c.tm : c.accent} align="center" style={styles.value}>
          {value}
        </Text>
        <StepButton label={`زيادة ${label}`} disabled={atMax} onPress={() => step(1, atMax)}>
          <PlusIcon size={14} color={atMax ? c.border : c.tp} />
        </StepButton>
      </View>
    </View>
  );
}

function StepButton({
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
});
