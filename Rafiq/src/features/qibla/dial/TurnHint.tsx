import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/shared/theme/useTheme';
import { Text } from '@/shared/ui/Text';
import { hintFor } from '../hint';
import type { Qibla } from '../useQibla';

interface TurnHintProps {
  qibla: Qibla;
}

/** What to do next, in one line, and the bearing under it (see `hintFor`). */
export function TurnHint({ qibla }: TurnHintProps) {
  const { c } = useTheme();
  const hint = hintFor(qibla);
  return (
    <View style={styles.wrap}>
      <Text
        size={16}
        weight="semi"
        color={hint.locked ? c.accent : c.tp}
        align="center"
        numberOfLines={1}
        style={styles.wide}
        accessibilityLabel={hint.spoken}
      >
        {hint.line}
      </Text>
      {hint.sub ? (
        <Text
          size={11.5}
          color={c.tm}
          align="center"
          numberOfLines={1}
          style={styles.wide}
          accessibilityLabel={hint.subSpoken ?? undefined}
        >
          {hint.sub}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 2, paddingHorizontal: 24 },
  wide: { alignSelf: 'stretch' },
});
