import { Tabs, type BottomTabNavigationOptions } from 'expo-router/js-tabs';
import { useEffect, useRef, useState } from 'react';
import { I18nManager, View } from 'react-native';
import { useMotion } from '@/shared/lib/motion';
import { useTheme } from '@/shared/theme/useTheme';
import { TabBar, useTabBarInset } from '@/shared/ui/TabBar';
import { Toast } from '@/shared/ui/Toast';

const TOAST_MS = 1800;
const SHIFT = 36;
// The navigator slides later tabs in from the right. Under forced RTL the
// second tab sits to the left of the first, so the slide is mirrored here.
const DIR = I18nManager.isRTL ? -1 : 1;

const shift: NonNullable<BottomTabNavigationOptions['sceneStyleInterpolator']> = ({ current }) => ({
  sceneStyle: {
    opacity: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] }),
    transform: [
      {
        translateX: current.progress.interpolate({
          inputRange: [-1, 0, 1],
          outputRange: [-SHIFT * DIR, 0, SHIFT * DIR],
        }),
      },
    ],
  },
});

/**
 * The tabbed part of the app. The floating bar belongs to the navigator so its
 * pill can travel between tabs; pages pushed on the root stack (settings, the
 * month table, a prayer, the azkar reader) cover it.
 */
export default function TabsLayout() {
  const { c } = useTheme();
  const { reduced } = useMotion();
  const tabInset = useTabBarInset();

  const [toast, setToast] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = () => {
    setToast(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(false), TOAST_MS);
  };
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Tabs
        backBehavior="firstRoute"
        tabBar={(props) => <TabBar {...props} onComingSoon={showToast} />}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: c.bg },
          sceneStyleInterpolator: shift,
          transitionSpec: { animation: 'timing', config: { duration: reduced ? 0 : 240 } },
        }}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="azkar" />
      </Tabs>
      <Toast message="قريبًا في الإصدار القادم إِنْ شَاءَ اللّٰه" visible={toast} bottom={tabInset + 14} />
    </View>
  );
}
