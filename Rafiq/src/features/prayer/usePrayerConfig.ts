import { useMemo } from 'react';
import { useSettings } from '@/shared/storage/settings';
import { cityByName, type PrayerConfig } from './engine';

/**
 * Coordinates + method + madhab from settings. Auto mode uses the last device
 * fix; manual mode (or auto with no fix yet) uses the chosen / default city.
 * Memoized on primitives so the identity is stable for downstream memos.
 */
export function usePrayerConfig(): PrayerConfig {
  const { settings } = useSettings();
  const source = settings.locationMode === 'auto' && settings.coords ? settings.coords : cityByName(settings.city);
  const { latitude, longitude } = source;
  const { method, madhab } = settings;
  return useMemo(
    () => ({ coords: { latitude, longitude }, method, madhab }),
    [latitude, longitude, method, madhab],
  );
}
