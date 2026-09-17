import { useMemo } from 'react';
import { useSettings } from '@/shared/storage/settings';
import { cityByName, nearestCity, type Adjustments, type IqamaOffsets, type PrayerConfig } from './engine';

/**
 * Coordinates + method + madhab + manual offsets from settings. Auto mode
 * computes with the nearest listed city (the one the header names), so the
 * minutes match that city's official table; the raw fix is used only when no
 * listed city is within range. Manual mode (or auto with no fix yet) uses the
 * chosen / default city. Memoized on primitives so the identity is stable for
 * downstream memos (the adjustments and iqama objects are keyed by their JSON form).
 */
export function usePrayerConfig(): PrayerConfig {
  const { settings } = useSettings();
  const source =
    settings.locationMode === 'auto' && settings.coords
      ? (nearestCity(settings.coords)?.city ?? settings.coords)
      : cityByName(settings.city);
  const { latitude, longitude } = source;
  const { method, madhab } = settings;
  const tuneKey = JSON.stringify([settings.adjustments, settings.iqama]);
  return useMemo(() => {
    const [adjustments, iqama] = JSON.parse(tuneKey) as [Adjustments, IqamaOffsets];
    return { coords: { latitude, longitude }, method, madhab, adjustments, iqama };
  }, [latitude, longitude, method, madhab, tuneKey]);
}
