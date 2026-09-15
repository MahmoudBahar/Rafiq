import { useMemo } from 'react';
import { useSettings } from '@/shared/storage/settings';
import { cityByName, nearestCity, type Adjustments, type PrayerConfig } from './engine';

/**
 * Coordinates + method + madhab + manual offsets from settings. Auto mode
 * computes with the nearest listed city (the one the header names), so the
 * minutes match that city's official table; the raw fix is used only when no
 * listed city is within range. Manual mode (or auto with no fix yet) uses the
 * chosen / default city. Memoized on primitives so the identity is stable for
 * downstream memos (the adjustments object is keyed by its JSON form).
 */
export function usePrayerConfig(): PrayerConfig {
  const { settings } = useSettings();
  const source =
    settings.locationMode === 'auto' && settings.coords
      ? (nearestCity(settings.coords)?.city ?? settings.coords)
      : cityByName(settings.city);
  const { latitude, longitude } = source;
  const { method, madhab } = settings;
  const adjKey = JSON.stringify(settings.adjustments);
  return useMemo(
    () => ({
      coords: { latitude, longitude },
      method,
      madhab,
      adjustments: JSON.parse(adjKey) as Adjustments,
    }),
    [latitude, longitude, method, madhab, adjKey],
  );
}
