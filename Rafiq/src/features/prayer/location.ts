import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { COUNTRY, UNKNOWN_PLACE, judgeFix, nearestCity, type Coords, type Fix } from './engine';

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
const QUICK_TIMEOUT_MS = 5_000;
/** The quiet refresh takes nothing older: iOS may answer a request with a position it already had. */
const FRESH_FIX_MAX_AGE_MS = 60_000;

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

/**
 * The tapped flow takes the system's cached position when a fresh fix will not
 * come: the user is waiting and can see the answer. The quiet one does not: a
 * cached position can be a quarter of an hour and a train ride old, and nobody
 * would be looking when it replaced the saved place. `quiet` also keeps
 * Android from raising its "turn on location accuracy" dialog, which it does
 * by default when the network provider is off.
 */
async function getFix(quiet = false): Promise<Fix> {
  const last = quiet
    ? null
    : await withTimeout(Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS }), QUICK_TIMEOUT_MS).catch(
        () => null,
      );
  const current = await withTimeout(
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, mayShowUserSettingsDialog: !quiet }),
    FIX_TIMEOUT_MS,
  ).catch(() => null);
  const pos = current ?? last;
  if (!pos || (quiet && Math.abs(Date.now() - pos.timestamp) > FRESH_FIX_MAX_AGE_MS)) {
    throw new LocationError('unavailable');
  }
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracyKm: (pos.coords.accuracy ?? 0) / 1000,
  };
}

async function geocode(coords: Coords): Promise<Location.LocationGeocodedAddress | null> {
  // Reverse geocoding is native-only and uses the OS locale.
  if (Platform.OS === 'web') return null;
  return withTimeout(Location.reverseGeocodeAsync(coords), GEOCODE_TIMEOUT_MS)
    .then((list) => list[0] ?? null)
    .catch(() => null);
}

const servicesOn = async () => Platform.OS === 'web' || (await Location.hasServicesEnabledAsync().catch(() => true));

/**
 * Arabic place label for a fix. The fix itself is what the engine calculates
 * with; the label is the nearest listed city so the name matches the official
 * table the times sit closest to.
 * Label preference: nearest listed city, Arabic geocoded name, any geocoded name, "موقعي".
 */
async function label(coords: Coords): Promise<ResolvedLocation> {
  const geo = await geocode(coords);
  const geoCity = geo?.city ?? geo?.subregion ?? geo?.region ?? null;
  const near = nearestCity(coords);

  const city = near?.city.name ?? (hasArabic(geoCity) ? geoCity : null) ?? geoCity ?? UNKNOWN_PLACE;
  const country = hasArabic(geo?.country) ? geo.country : near ? COUNTRY : null;
  return { city, country, ...coords };
}

// Wall-clock time on purpose: the monotonic clock stops while the phone sleeps,
// and a phone asleep in a pocket for the length of a trip is the case this is for.
let answeredAt = -Infinity;

/** Milliseconds since the device last gave a usable answer, by a tap or by the quiet refresh. */
export const sinceLastAnswer = () => {
  const elapsed = Date.now() - answeredAt;
  // A clock set backwards must not hold the refresh off.
  return elapsed < 0 ? Infinity : elapsed;
};

/** Foreground permission (asking if needed) → device fix → place label. Throws a `LocationError`. */
export async function resolveLocation(): Promise<ResolvedLocation> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) throw new LocationError('denied', perm.canAskAgain);
  if (!(await servicesOn())) throw new LocationError('unavailable');
  const { latitude, longitude } = await getFix();
  const place = await label({ latitude, longitude });
  answeredAt = Date.now();
  return place;
}

/**
 * Whether the app holds the location permission right now, without asking.
 * Null when that cannot be told, which includes location services being off:
 * iOS then reports every app as denied.
 */
export async function locationAllowed(): Promise<boolean | null> {
  try {
    if (!(await withTimeout(servicesOn(), QUICK_TIMEOUT_MS))) return null;
    return (await withTimeout(Location.getForegroundPermissionsAsync(), QUICK_TIMEOUT_MS)).granted;
  } catch {
    return null;
  }
}

export interface SavedPlace {
  coords: Coords | null;
  city: string | null;
  country: string | null;
}

/**
 * The quiet version, for when nobody asked: it never prompts and never throws.
 * `denied` = no permission; `unavailable` = services off or no fresh fix;
 * `unmoved` = the saved place still stands, so nothing is geocoded.
 * A place comes back when the device has moved, or when it has not but the
 * saved name needed mending.
 */
export async function refreshLocation(
  saved: SavedPlace,
): Promise<ResolvedLocation | 'unmoved' | 'unavailable' | 'denied'> {
  try {
    const allowed = await locationAllowed();
    if (allowed === null) return 'unavailable';
    if (!allowed) return 'denied';
    const { accuracyKm, ...coords } = await getFix(true);
    const verdict = judgeFix(saved, { ...coords, accuracyKm });
    answeredAt = Date.now();
    if (verdict === 'unmoved') return 'unmoved';
    if (verdict === 'moved' || !saved.coords) return await label(coords);
    // Same place, better name: the saved fix stays as it is.
    const place = await label(saved.coords);
    return place.city === saved.city && place.country === saved.country ? 'unmoved' : place;
  } catch {
    return 'unavailable';
  }
}
