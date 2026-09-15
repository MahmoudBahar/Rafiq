import { useColorScheme } from 'react-native';
import { useSettings } from '@/shared/storage/settings';
import { useDaylight } from './daylight';
import { dark, fonts, light, type Palette } from './tokens';

export type Scheme = 'light' | 'dark';

export function useTheme() {
  const { settings } = useSettings();
  const system = useColorScheme();
  const daylight = useDaylight();
  const scheme: Scheme =
    settings.theme === 'daylight'
      ? daylight
        ? 'light'
        : 'dark'
      : settings.theme === 'system'
        ? system === 'dark'
          ? 'dark'
          : 'light'
        : settings.theme;
  const c: Palette = scheme === 'dark' ? dark : light;
  return { c, scheme, isDark: scheme === 'dark', fonts };
}
