import { useEffect, useRef } from 'react';
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

/** Holding a button this long starts it repeating. */
const HOLD_MS = 500;
/** One step per tick while held. */
const REPEAT_MS = 110;

/**
 * One labelled ± row of the settings tuners (fine-tune offsets, iqama
 * delays). A tap steps once; holding repeats until release or the limit.
 * Clicks on each step and thuds once at a limit: the only steppers allowed
 * haptics in the app.
 */
export function StepperRow({ label, value, neutral, atMin, atMax, onStep }: StepperRowProps) {
  const { c } = useTheme();
  // Each step re-renders the parent with fresh closures, so the repeat loop
  // reads the latest props through refs instead of the ones it was started with.
  const latest = useRef({ onStep, atMin, atMax });
  useEffect(() => {
    latest.current = { onStep, atMin, atMax };
  });
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopRepeat = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stopRepeat, []);

  const blocked = (delta: 1 | -1) => (delta < 0 ? latest.current.atMin : latest.current.atMax);

  const step = (delta: 1 | -1) => {
    if (blocked(delta)) {
      stop();
      return;
    }
    click();
    latest.current.onStep(delta);
  };

  const startRepeat = (delta: 1 | -1) => {
    stopRepeat();
    if (blocked(delta)) return;
    timer.current = setInterval(() => {
      if (blocked(delta)) {
        stopRepeat();
        stop();
        return;
      }
      click();
      latest.current.onStep(delta);
    }, REPEAT_MS);
  };

  return (
    <View style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Text size={14} weight="semi">
        {label}
      </Text>
      <View style={styles.stepper}>
        <StepButton
          label={`إنقاص ${label}`}
          disabled={atMin}
          onPress={() => step(-1)}
          onHold={() => startRepeat(-1)}
          onRelease={stopRepeat}
        >
          <MinusIcon size={14} color={atMin ? c.border : c.tp} />
        </StepButton>
        <Text size={13.5} weight="bold" color={neutral ? c.tm : c.accent} align="center" style={styles.value}>
          {value}
        </Text>
        <StepButton
          label={`زيادة ${label}`}
          disabled={atMax}
          onPress={() => step(1)}
          onHold={() => startRepeat(1)}
          onRelease={stopRepeat}
        >
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
  onHold,
  onRelease,
  children,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
  onHold: () => void;
  onRelease: () => void;
  children: React.ReactNode;
}) {
  const { c } = useTheme();
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      onPress={onPress}
      onLongPress={onHold}
      delayLongPress={HOLD_MS}
      onPressOut={onRelease}
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
