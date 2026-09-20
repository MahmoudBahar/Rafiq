import { Tabs } from 'expo-router/js-tabs';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/shared/theme/useTheme';
import { TabBar, useTabBarInset } from '@/shared/ui/TabBar';
import { tabTravelMs } from '@/shared/ui/tabMotion';
import { Toast } from '@/shared/ui/Toast';

const TOAST_MS = 1800;
const still = () => ({ sceneStyle: {} });

/**
 * The tabbed part of the app. The floating bar belongs to the navigator so its
 * pill can travel between tabs; pages pushed on the root stack (settings, the
 * month table, a prayer, the azkar reader) cover it.
 *
 * The navigator does not animate between tabs: the pages slide themselves, in
 * step with the pill (see TabScene). For that both pages must simply be there,
 * side by side, so they are mounted up front and never detached. With
 * detaching on, the native screen container re-attaches the later tab whenever
 * the earlier one comes back, which blanked it for the first frames of the
 * slide. The navigator is still handed a transition, one that changes
 * nothing: without one it sets the tab being left to `display: none` on the
 * spot, and the page would vanish instead of sliding out. A tab that is not
 * chosen is parked off-screen by its TabScene.
 */
export default function TabsLayout() {
  const { c } = useTheme();
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
        detachInactiveScreens={false}
        tabBar={(props) => <TabBar {...props} onComingSoon={showToast} />}
        screenOptions={{
          headerShown: false,
          lazy: false,
          // Each page paints its own ground and slides with it. The navigator's scene wrapper stays
          // put, so an opaque one would hide the neighbouring page for the whole slide.
          sceneStyle: { backgroundColor: 'transparent' },
          sceneStyleInterpolator: still,
          transitionSpec: { animation: 'timing', config: { duration: tabTravelMs(1) } },
        }}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="azkar" />
      </Tabs>
      <Toast message="قريبًا في الإصدار القادم إِنْ شَاءَ اللّٰه" visible={toast} bottom={tabInset + 14} />
    </View>
  );
}
