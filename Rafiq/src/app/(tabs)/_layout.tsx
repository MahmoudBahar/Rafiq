import { Tabs } from 'expo-router/js-tabs';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/shared/theme/useTheme';
import { TabBar, useTabBarInset } from '@/shared/ui/TabBar';
import { TAB_ENTER_MS } from '@/shared/ui/TabScene';
import { Toast } from '@/shared/ui/Toast';

const TOAST_MS = 1800;
const HOLD_MS = TAB_ENTER_MS + 60;
const still = () => ({ sceneStyle: {} });

/**
 * The tabbed part of the app. The floating bar belongs to the navigator so its
 * pill can travel between tabs; pages pushed on the root stack (settings, the
 * month table, a prayer, the azkar reader) cover it.
 *
 * The navigator's own scene fade is not used: it puts the alpha on a view of
 * its own, and Android spreads that alpha over each stacked layer of a screen
 * separately, so the azkar sky flashed its day gradient through the night one.
 * Each tab fades itself in instead (see TabScene). The navigator is still given
 * a transition, one that changes nothing, because that is what keeps the tab
 * being left attached underneath while the new one fades in over it. Tabs are
 * mounted up front so the first visit has nothing to wait for.
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
        tabBar={(props) => <TabBar {...props} onComingSoon={showToast} />}
        screenOptions={{
          headerShown: false,
          lazy: false,
          sceneStyle: { backgroundColor: c.bg },
          sceneStyleInterpolator: still,
          transitionSpec: { animation: 'timing', config: { duration: HOLD_MS } },
        }}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="azkar" />
      </Tabs>
      <Toast message="قريبًا في الإصدار القادم إِنْ شَاءَ اللّٰه" visible={toast} bottom={tabInset + 14} />
    </View>
  );
}
