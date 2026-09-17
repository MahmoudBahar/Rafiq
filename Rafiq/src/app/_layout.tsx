import {
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_500Medium,
  IBMPlexSansArabic_600SemiBold,
  IBMPlexSansArabic_700Bold,
} from '@expo-google-fonts/ibm-plex-sans-arabic';
import { ScheherazadeNew_400Regular, ScheherazadeNew_700Bold } from '@expo-google-fonts/scheherazade-new';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { I18nManager, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ReduceMotion, ReducedMotionConfig, useReducedMotion } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DaylightProvider } from '@/features/prayer/DaylightProvider';
import { useMotion, useSystemReducedMotion } from '@/shared/lib/motion';
import { SettingsProvider, useSettings } from '@/shared/storage/settings';
import { useTheme } from '@/shared/theme/useTheme';

// The app is Arabic-only. The expo-localization plugin forces RTL at build
// time; this keeps dev/web sessions consistent before a rebuild.
I18nManager.allowRTL(true);
I18nManager.forceRTL(true);
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.documentElement.setAttribute('dir', 'rtl');
  document.documentElement.setAttribute('lang', 'ar');
}

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    IBMPlexSansArabic_400Regular,
    IBMPlexSansArabic_500Medium,
    IBMPlexSansArabic_600SemiBold,
    IBMPlexSansArabic_700Bold,
    ScheherazadeNew_400Regular,
    ScheherazadeNew_700Bold,
  });
  const ready = loaded || !!error;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SettingsProvider>
          <DaylightProvider>
            <RootStack />
          </DaylightProvider>
        </SettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootStack() {
  const { settings } = useSettings();
  const { c, isDark } = useTheme();
  const { reduced } = useMotion();
  // Reanimated froze the device flag at launch. Its config component logs a
  // dev warning whenever it is mounted, so it is mounted only when our answer
  // (app setting, or the device switch flipped since launch) differs from it.
  const atLaunch = useReducedMotion();
  useSystemReducedMotion();

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(c.bg);
  }, [c.bg]);

  return (
    <>
      {reduced !== atLaunch ? (
        <ReducedMotionConfig mode={reduced ? ReduceMotion.Always : ReduceMotion.Never} />
      ) : null}
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Protected guard={settings.onboarded}>
          <Stack.Screen name="index" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="month" options={{ animation: 'fade' }} />
          {/* The page morphs from the pressed row itself; the stack only fades. It is
              a transparent modal so the home stays rendered beneath it: on the way
              back the page dissolves while the card travels and lands on its row. */}
          <Stack.Screen
            name="prayer/[key]"
            options={{
              presentation: 'transparentModal',
              animation: 'fade',
              animationDuration: 180,
              contentStyle: { backgroundColor: 'transparent' },
            }}
          />
        </Stack.Protected>
        <Stack.Protected guard={!settings.onboarded}>
          <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}
