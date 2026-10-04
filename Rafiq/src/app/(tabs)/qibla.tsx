import { useIsFocused, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Text as RNText, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocate } from '@/features/prayer/useLocate';
import { StatusCard } from '@/features/qibla/calibration/StatusCard';
import { CompassDial } from '@/features/qibla/dial/CompassDial';
import { ConfidencePill } from '@/features/qibla/dial/ConfidencePill';
import { LockGlow } from '@/features/qibla/dial/LockGlow';
import { TurnHint } from '@/features/qibla/dial/TurnHint';
import { wrap180 } from '@/features/qibla/engine';
import { hintFor } from '@/features/qibla/hint';
import { useQibla, type QiblaDebug } from '@/features/qibla/useQibla';
import { useQiblaAnnouncer } from '@/features/qibla/useQiblaAnnouncer';
import { useQiblaCoords } from '@/features/qibla/useQiblaCoords';
import { useMotion } from '@/shared/lib/motion';
import { useTheme } from '@/shared/theme/useTheme';
import { GradientBackground } from '@/shared/ui/GradientBackground';
import { PressScale } from '@/shared/ui/PressScale';
import { useTabBarInset } from '@/shared/ui/TabBar';
import { TabScene } from '@/shared/ui/TabScene';
import { Display, Text } from '@/shared/ui/Text';

const HEADER_H = 76;
const HINT_H = 62;
/** The place line under the bearing, when no card is showing. */
const PLACE_H = 26;
/** Clear sky kept above the tab bar when nothing floats there. */
const BOTTOM_AIR = 18;
/** The gap between whatever floats above the tab bar and the hint above it. */
const FLOAT_GAP = 16;
const SIDE = 32;
/** How long the dial and hint take to move when a card arrives or leaves. */
const MOVE_MS = 260;

/**
 * The Qibla tab: a prayer mat that turns with the phone and lies straight
 * when the phone faces the Kaaba. The dial is the hero; under it, what to do
 * next and where the bearing is taken from. Nothing else covers the screen:
 * a card floats above the tab bar only while the compass needs the user's
 * hand (calibrate, interference, no location, no compass), and the dial and
 * hint move up to make room for it.
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
  const m = useMotion();
  useQiblaAnnouncer(qibla, focused);

  const window = useWindowDimensions();
  const [measured, setMeasured] = useState<{ w: number; h: number } | null>(null);
  const size = measured ?? { w: window.width, h: window.height };
  const trusted = qibla.confidence === 'good' || qibla.confidence === 'settling';
  const cardShowing = !trusted;
  // What floats above the tab bar (the card, and the dev readout in development builds) is measured,
  // and the dial and hint end just above it.
  const [floatingH, setFloatingH] = useState(0);
  const horizon = size.h - tabInset - (floatingH > 0 ? floatingH + FLOAT_GAP : BOTTOM_AIR);
  const hintH = HINT_H + (cardShowing ? 0 : PLACE_H);
  const top = insets.top + 12;
  const dialTop = top + HEADER_H;
  const dial = Math.max(180, Math.min(size.w - SIDE * 2, horizon - dialTop - hintH - 16));
  const move = m.reduced ? undefined : LinearTransition.duration(MOVE_MS);

  return (
    <TabScene
      name="qibla"
      index={2}
      slot={3}
      style={{ overflow: 'hidden', backgroundColor: c.bg }}
      onLayout={(e) => setMeasured({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {focused ? <StatusBar style={isDark ? 'light' : 'dark'} /> : null}
      <View style={StyleSheet.absoluteFill}>
        <GradientBackground />
      </View>

      <View style={[styles.header, { top, height: HEADER_H }]} pointerEvents="box-none">
        <Display size={32} align="center" style={styles.wide}>
          القبلة
        </Display>
        <ConfidencePill confidence={qibla.confidence} />
      </View>

      <Animated.View
        layout={move}
        style={[styles.dial, { top: dialTop, height: horizon - dialTop - hintH }]}
        pointerEvents="none"
        accessible
        accessibilityRole="image"
        accessibilityLabel={`بوصلة القبلة. ${hintFor(qibla).spoken}`}
      >
        <CompassDial values={qibla.values} bearing={qibla.bearing} size={dial} dimmed={cardShowing} raised={qibla.raised} />
      </Animated.View>

      <Animated.View layout={move} style={[styles.hint, { top: horizon - hintH, height: hintH }]} pointerEvents="box-none">
        <View pointerEvents="none">
          <TurnHint qibla={qibla} />
        </View>
        {/* Where the bearing is taken from, under the bearing itself. */}
        {cardShowing ? null : (
          <Animated.View key="place" entering={m.fadeIn(0, 220)} style={styles.place}>
            <Text size={12} color={c.ts}>
              {source === 'fix' ? `من موقعك الحالي${label ? ` (${label})` : ''}` : label ? `من مدينة ${label}` : ''}
            </Text>
            <Text size={12} color={c.tm}>
              ·
            </Text>
            <PressScale accessibilityRole="button" accessibilityLabel="تحديد موقعي" onPress={() => void locate()} disabled={locating}>
              <Text size={12} weight="medium" color={c.accent}>
                {locating ? 'جارٍ التحديد…' : 'تحديد موقعي'}
              </Text>
            </PressScale>
          </Animated.View>
        )}
      </Animated.View>

      {/* Floats above the tab bar only while there is something to show. */}
      <View
        style={[styles.floating, { bottom: tabInset + 8 }]}
        pointerEvents="box-none"
        onLayout={(e) => setFloatingH(Math.round(e.nativeEvent.layout.height))}
      >
        {cardShowing ? (
          <Animated.View key={qibla.confidence} entering={m.fadeInUp(0, 280)} exiting={m.fadeOut(160)} style={styles.cardShadow}>
            <StatusCard
              confidence={qibla.confidence}
              locating={locating}
              onLocate={() => void locate()}
              onChooseCity={() => router.push('/settings')}
            />
          </Animated.View>
        ) : null}
        {qibla.debug ? (
          <ScrollView style={[styles.devPanel, { backgroundColor: `${c.surface}e6`, borderColor: c.border }]} showsVerticalScrollIndicator>
            <DevReadout d={qibla.debug} />
          </ScrollView>
        ) : null}
      </View>
      <LockGlow t={qibla.values.edgeT} repaint={qibla.values.repaint} />
    </TabScene>
  );
}

/**
 * Development builds only: the engine's numbers, to tell in ten seconds on a
 * device whether the streams run at rate, the gyroscope's conventions hold
 * (tilt residual near 0), how the field compares with the model, and
 * what the platform says about its magnetometer calibration (acc 0–3).
 */
function DevReadout({ d }: { d: QiblaDebug }) {
  const { c } = useTheme();
  const f = (n: number, digits = 1) => (Number.isFinite(n) ? n.toFixed(digits) : '—');
  return (
    <RNText style={[styles.dev, { color: c.tm }]} selectable>
      {`hdg ${f(d.heading)}  raw ${f(d.rawDeg)}  grav ${f(d.gravDeg)}  (true north)\n` +
        `raw−hdg ${f(wrap180(d.rawDeg, d.heading))}  grav−raw ${f(wrap180(d.gravDeg, d.rawDeg))}\n` +
        `θ ${f(d.thetaDeg)}  σ ${f(d.sigmaDeg)}  ν ${f(d.innovationDeg)}  √R ${f(d.measSigmaDeg)}\n` +
        `|B| ${f(d.fieldUt)}/${f(d.modelFieldUt)} µT  dip ${f(d.dipDeg)}/${f(d.modelDipDeg)}°  bent ${f(d.impliedDeg)}°  acc ${d.magAccuracy}  epoch ${d.biasEpoch}\n` +
        `Hz g ${f(d.hz.gyro, 0)} u ${f(d.hz.up, 0)} m ${f(d.hz.mag, 0)}  tilt± ${f(d.tiltResidualDeg, 2)}°  drop ${d.dropped} rej ${d.rejected} gap ${d.gaps}\n` +
        `disagree ${f(d.disagreementS)}s  reacq ${d.reacquisitions}  acc ignored ${d.calOverridden ? 'yes' : 'no'}  tilt ${f(d.tiltDeg, 0)}° ${d.inPosture ? 'listening' : 'held'}${d.outOfModel ? '  WMM OUT OF RANGE' : ''}`}
    </RNText>
  );
}

const styles = StyleSheet.create({
  dev: { fontSize: 10.5, lineHeight: 15, fontFamily: 'monospace', writingDirection: 'ltr', textAlign: 'left' },
  header: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 6 },
  wide: { alignSelf: 'stretch' },
  dial: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  hint: { position: 'absolute', left: 0, right: 0, justifyContent: 'center' },
  place: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 6 },
  floating: { position: 'absolute', left: 16, right: 16, gap: 8 },
  cardShadow: { borderRadius: 14, boxShadow: '0 8px 24px rgba(0,0,0,0.22)' },
  devPanel: { maxHeight: 112, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 },
});
