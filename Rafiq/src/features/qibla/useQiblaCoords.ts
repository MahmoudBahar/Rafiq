import { useMemo } from 'react';
import { cityByName } from '@/features/prayer/engine';
import { useSettings } from '@/shared/storage/settings';
import type { Coords } from './engine';

export type CoordsSource = 'fix' | 'city' | 'none';

export interface QiblaCoords {
  coords: Coords | null;
  /** The place the bearing is taken from, for the caption under the dial. */
  label: string | null;
  source: CoordsSource;
}

/**
 * Where the Qibla is taken from. The exact device fix when there is one (the
 * bearing barely moves across a city, so no snapping to a listed city as the
 * prayer times do), else the chosen city. Nothing at all only when the user
 * has neither, which onboarding does not allow but a cleared setting could.
 */
export function useQiblaCoords(): QiblaCoords {
  const { settings } = useSettings();
  const fix = settings.locationMode === 'auto' ? settings.coords : null;
  const cityName = settings.city;
  const latitude = fix?.latitude;
  const longitude = fix?.longitude;
  return useMemo(() => {
    if (latitude !== undefined && longitude !== undefined) {
      return { coords: { latitude, longitude }, label: cityName, source: 'fix' };
    }
    if (cityName) {
      const city = cityByName(cityName);
      return { coords: { latitude: city.latitude, longitude: city.longitude }, label: city.name, source: 'city' };
    }
    return { coords: null, label: null, source: 'none' };
  }, [latitude, longitude, cityName]);
}
