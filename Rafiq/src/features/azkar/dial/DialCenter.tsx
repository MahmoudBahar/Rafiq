import { StyleSheet, View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle } from 'react-native-reanimated';
import { toArabicIndic } from '@/shared/lib/arabic';
import { dialSky, radius } from '@/shared/theme/tokens';
import { PressScale } from '@/shared/ui/PressScale';
import { Display, Text } from '@/shared/ui/Text';
import { AZKAR_SETS, type DialSide } from '../data';
import type { AzkarProgress } from '../progress';
import type { DialValues } from './useDial';

interface DialCenterProps {
  values: DialValues;
  side: DialSide;
  progress: Record<DialSide, AzkarProgress>;
  onStart: (set: DialSide) => void;
}

/**
 * What the dial is pointing at: the set's name, today's progress and the way
 * in. Two fixed layers, one per side, cross-fade as the dial turns; each is
 * written in its own sky's colours, since it sits on that sky.
 */
export function DialCenter({ values, side, progress, onStart }: DialCenterProps) {
  const { t } = values;
  const morning = useAnimatedStyle(() => {
    const o = interpolate(t.get(), [0, 0.4], [1, 0], 'clamp');
    return { opacity: o, transform: [{ translateY: (1 - o) * -10 }] };
  });
  const evening = useAnimatedStyle(() => {
    const o = interpolate(t.get(), [0.6, 1], [0, 1], 'clamp');
    return { opacity: o, transform: [{ translateY: (1 - o) * 10 }] };
  });
  return (
    <View style={styles.fill} pointerEvents="box-none">
      <Animated.View style={[styles.layer, morning]} pointerEvents={side === 'morning' ? 'box-none' : 'none'}>
        <Layer set="morning" progress={progress.morning} onStart={onStart} />
      </Animated.View>
      <Animated.View style={[styles.layer, evening]} pointerEvents={side === 'evening' ? 'box-none' : 'none'}>
        <Layer set="evening" progress={progress.evening} onStart={onStart} />
      </Animated.View>
    </View>
  );
}

interface LayerProps {
  set: DialSide;
  progress: AzkarProgress;
  onStart: (set: DialSide) => void;
}

function Layer({ set, progress, onStart }: LayerProps) {
  const sky = dialSky[set];
  const { items, title } = AZKAR_SETS[set];
  const started = progress.counts.some((n) => n > 0);
  const action = progress.complete ? 'أعد القراءة' : started ? 'تابع' : 'ابدأ';
  const status = progress.complete
    ? 'أتممتها اليوم، تقبّل اللّٰه'
    : started
      ? `${toArabicIndic(progress.done)} من ${toArabicIndic(progress.total)}`
      : `${toArabicIndic(progress.total)} ذكرًا`;
  return (
    <>
      {/* Full width and centred by textAlign: an intrinsic-width RTL label can clip on Android. */}
      <Display size={40} color={sky.text} align="center" style={styles.wide}>
        {title}
      </Display>
      <Text size={13} weight="medium" color={sky.sub} align="center" style={styles.wide}>
        {status}
      </Text>
      <View style={styles.segments} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {items.map((z, i) => (
          <View
            key={z.id}
            style={[
              styles.segment,
              { backgroundColor: progress.counts[i] >= z.count ? dialSky.dusk : sky.muted, opacity: progress.counts[i] >= z.count ? 1 : 0.35 },
            ]}
          />
        ))}
      </View>
      <PressScale
        accessibilityRole="button"
        accessibilityLabel={`${action} ${title}`}
        pressedScale={0.95}
        onPress={() => onStart(set)}
        style={[styles.button, { backgroundColor: dialSky.dusk }]}
      >
        <Text size={15} weight="bold" color="#ffffff" align="center">
          {action}
        </Text>
      </PressScale>
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  layer: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 32 },
  wide: { alignSelf: 'stretch' },
  segments: { flexDirection: 'row', alignSelf: 'stretch', gap: 2, marginTop: 10, marginHorizontal: 12 },
  segment: { flex: 1, height: 3, borderRadius: 2 },
  button: { marginTop: 16, minWidth: 148, paddingVertical: 12, paddingHorizontal: 36, borderRadius: radius.pill },
});
