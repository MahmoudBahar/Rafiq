import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { COUNTRY, nearestCity, type Coords } from './engine';

export interface ResolvedLocation extends Coords {
  city: string;
  country: string | null;
}

export type LocationErrorKind = 'denied' | 'unavailable';

export class LocationError extends Error {
  constructor(
    readonly kind: LocationErrorKind,
    readonly canAskAgain = true,
  ) {
    super(kind);
    this.name = 'LocationError';
  }
}

const FIX_TIMEOUT_MS = 10_000;
const GEOCODE_TIMEOUT_MS = 5_000;
const LAST_KNOWN_MAX_AGE_MS = 15 * 60_000;
const UNKNOWN_PLACE = 'موقعي';

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

const hasArabic = (s: string | null | undefined): s is string => !!s && /[\u0600-\u06FF]/.test(s);

async function getFix(): Promise<Coords> {
  const last = await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS }).catch(() => null);
  const current = await withTimeout(
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
    FIX_TIMEOUT_MS,
  ).catch(() => null);
  const pos = current ?? last;
  if (!pos) throw new LocationError('unavailable');
  return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
}

async function geocode(coords: Coords): Promise<Location.LocationGeocodedAddress | null> {
  // Reverse geocoding is native-only and uses the OS locale.
  if (Platform.OS === 'web') return null;
  return withTimeout(Location.reverseGeocodeAsync(coords), GEOCODE_TIMEOUT_MS)
    .then((list) => list[0] ?? null)
    .catch(() => null);
}

/**
 * Foreground permission → device fix → Arabic place label.
 * Label preference: Arabic geocoded name, nearest known city, any geocoded name, "موقعي".
 */
export async function resolveLocation(): Promise<ResolvedLocation> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) throw new LocationError('denied', perm.canAskAgain);
  if (Platform.OS !== 'web' && !(await Location.hasServicesEnabledAsync().catch(() => true))) {
    throw new LocationError('unavailable');
  }

  const coords = await getFix();
  const geo = await geocode(coords);
  const geoCity = geo?.city ?? geo?.subregion ?? geo?.region ?? null;
  const near = nearestCity(coords);

  const city = (hasArabic(geoCity) ? geoCity : null) ?? near?.name ?? geoCity ?? UNKNOWN_PLACE;
  const country = hasArabic(geo?.country) ? geo.country : near ? COUNTRY : null;
  return { city, country, ...coords };
}
