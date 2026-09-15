import { StyleSheet } from 'react-native';
import { formatCountdown } from '@/shared/lib/arabic';
import { useWallClock } from '@/shared/lib/useWallClock';
import { Text } from '@/shared/ui/Text';

interface CountdownDigitsProps {
  /** Moment counted down to. */
  at: Date;
}

/**
 * The big h:mm:ss. Owns its own one-second clock so only this text node
 * re-renders each second; the rest of the home screen stays still.
 */
export function CountdownDigits({ at }: CountdownDigitsProps) {
  const now = useWallClock(1000);
  const diff = Math.max(0, Math.floor((at.getTime() - now.getTime()) / 1000));
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  return (
    <Text size={56} weight="bold" lineHeight={68} style={styles.countdown}>
      {formatCountdown(h, m, s)}
    </Text>
  );
}

const styles = StyleSheet.create({
  countdown: { fontVariant: ['tabular-nums'] },
});
