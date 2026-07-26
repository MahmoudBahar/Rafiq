import { DEFAULT_CITY } from './cities';

export interface ResolvedLocation {
  city: string;
}

/**
 * Simulated device location, matching the prototype's behaviour.
 * TODO(location): request foreground permission with `expo-location`,
 * read `getLastKnownPositionAsync` / `getCurrentPositionAsync`, and map the
 * coordinates to a city + calculation defaults.
 */
export function resolveLocation(): Promise<ResolvedLocation> {
  return new Promise((resolve) => {
    setTimeout(() => resolve({ city: DEFAULT_CITY }), 1600);
  });
}
