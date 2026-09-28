import { useIsFocused, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Text as RNText, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocate } from '@/features/prayer/useLocate';
import { StatusCard } from '@/features/qibla/calibration/StatusCard';
import { CompassDial } from '@/features/qibla/dial/CompassDial';
import { ConfidencePill } from '@/features/qibla/dial/ConfidencePill';
import { LockGlow } from '@/features/qibla/dial/LockGlow';
import { TurnHint } from '@/features/qibla/dial/TurnHint';
import { useQibla, type QiblaDebug } from '@/features/qibla/useQibla';
import { useQiblaCoords } from '@/features/qibla/useQiblaCoords';
import { useTheme } from '@/shared/theme/useTheme';
import { GradientBackground } from '@/shared/ui/GradientBackground';
import { PressScale } from '@/shared/ui/PressScale';
import { useTabBarInset } from '@/shared/ui/TabBar';
import { TabScene } from '@/shared/ui/TabScene';
import { Display, Text } from '@/shared/ui/Text';

/** Ground showing above the floating bar: the place line, or a card that needs the user's hand. */
const GROUND_LIP = 150;
const HEADER_H = 76;
const HINT_H = 62;
const SIDE = 32;

/**
 * The Qibla tab: a prayer mat that turns with the phone and lies straight
 * when the phone faces the Kaaba. The dial is the hero; under it, what to do
 * next; on the ground, where the bearing is taken from.
 */
export default function QiblaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { c, isDark } = useTheme();
  const focused = useIsFocused();
  const tabInset = useTabBarInset();
  const { coords, label, source } = useQiblaCoords();
  const qibla = useQibla(coords, 'flat', focused);
  const { locating, locate } = useLocate();

  const window = useWindowDimensions();
  const [measured, setMeasured] = useState<{ w: number; h: number } | null>(null);
  const size = measured ?? { w: window.width, h: window.height };
  const horizon = size.h - tabInset - GROUND_LIP;
  const top = insets.top + 12;
  const dialTop = top + HEADER_H;
  const dial = Math.max(180, Math.min(size.w - SIDE * 2, horizon - dialTop - HINT_H - 16));

  const trusted = qibla.confidence === 'good' || qibla.confidence === 'settling';
  const cardShowing = !trusted;

  return (
    <TabScene
      name="qibla"
      index={2}
      slot={3}
      style={{ overflow: 'hidden', backgroundColor: c.bg }}
      onLayout={(e) => setMeasured({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {focused ? <StatusBar style={isDark ? 'light' : 'dark'} /> : null}
      <View style={[styles.sky, { height: horizon + 40 }]}>
        <GradientBackground />
      </View>

      <View style={[styles.header, { top, height: HEADER_H }]} pointerEvents="box-none">
        <Display size={32} align="center" style={styles.wide}>
          القبلة
        </Display>
        <ConfidencePill confidence={qibla.confidence} />
      </View>

      <View style={[styles.dial, { top: dialTop, height: horizon - dialTop - HINT_H }]} pointerEvents="none">
        <CompassDial values={qibla.values} bearing={qibla.bearing} size={dial} dimmed={cardShowing} />
      </View>

      <View style={[styles.hint, { top: horizon - HINT_H, height: HINT_H }]} pointerEvents="none">
        <TurnHint qibla={qibla} />
      </View>

      <View style={[styles.ground, { top: horizon, backgroundColor: c.bg }]}>
        {cardShowing ? (
          <StatusCard
            confidence={qibla.confidence}
            locating={locating}
            onLocate={() => void locate()}
            onChooseCity={() => router.push('/settings')}
          />
        ) : (
          <View style={styles.place}>
            <Text size={12.5} color={c.ts}>
              {source === 'fix' ? `من موقعك الحالي${label ? ` (${label})` : ''}` : label ? `من مدينة ${label}` : ''}
            </Text>
            <Text size={12.5} color={c.tm}>
              ·
            </Text>
            <PressScale accessibilityRole="button" accessibilityLabel="تحديد موقعي" onPress={() => void locate()} disabled={locating}>
              <Text size={12.5} weight="medium" color={c.accent}>
                {locating ? 'جارٍ التحديد…' : 'تحديد موقعي'}
              </Text>
            </PressScale>
          </View>
        )}
        {qibla.debug ? <DevReadout d={qibla.debug} /> : null}
      </View>
      <LockGlow t={qibla.values.edgeT} />
    </TabScene>
  );
}

/** Development builds only: the raw numbers, to tell in ten seconds whether the conventions hold on a device. */
function DevReadout({ d }: { d: QiblaDebug }) {
  const { c } = useTheme();
  const f = (n: number) => n.toFixed(1);
  return (
    <RNText style={[styles.dev, { color: c.tm }]} selectable>
      {`compass ${f(d.compass)}  fused ${f(d.fused)}  platform ${d.platform}\n|B| ${f(d.fieldUt)} µT  dip ${f(d.dipDeg)}°  pitch ${f(d.pitch)}°${d.flipped ? '  FLIPPED' : ''}`}
    </RNText>
  );
}

const styles = StyleSheet.create({
  sky: { position: 'absolute', left: 0, right: 0, top: 0 },
  dev: { marginTop: 14, fontSize: 11, lineHeight: 16, fontFamily: 'monospace', writingDirection: 'ltr', textAlign: 'left' },
  header: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 6 },
  wide: { alignSelf: 'stretch' },
  dial: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  hint: { position: 'absolute', left: 0, right: 0, justifyContent: 'center' },
  ground: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopStartRadius: 32,
    borderTopEndRadius: 32,
    paddingTop: 16,
    paddingHorizontal: 20,
  },
  place: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
});
