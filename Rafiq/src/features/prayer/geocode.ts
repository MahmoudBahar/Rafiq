import type { Coords } from './engine';

/**
 * Arabic place names for a fix, from OpenStreetMap's Nominatim. The device
 * geocoder follows the OS locale (often Latin script), so this is the primary
 * source for the header label; callers fall back when it is unavailable.
 * Usage policy: one request per fix, identified User-Agent, no bulk lookups.
 */
export interface ArabicPlace {
  /** Neighbourhood / suburb level, e.g. المعادي الجديدة. */
  district: string | null;
  /** City or town, e.g. القاهرة الجديدة. */
  city: string | null;
  /** Governorate / state, e.g. القاهرة. */
  region: string | null;
  country: string | null;
}

const ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = 'Rafiq/1.0 (Expo prayer-times app)';
const TIMEOUT_MS = 5_000;

interface NominatimAddress {
  neighbourhood?: string;
  suburb?: string;
  quarter?: string;
  city_district?: string;
  city?: string;
  town?: string;
  village?: string;
  state_district?: string;
  state?: string;
  country?: string;
}

const first = (...values: (string | undefined)[]): string | null => values.find((v) => !!v?.trim()) ?? null;

export async function reverseGeocodeArabic({ latitude, longitude }: Coords): Promise<ArabicPlace | null> {
  const url = `${ENDPOINT}?format=jsonv2&zoom=16&accept-language=ar&lat=${latitude}&lon=${longitude}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { address?: NominatimAddress };
    const a = json.address;
    if (!a) return null;
    return {
      district: first(a.neighbourhood, a.suburb, a.quarter, a.city_district),
      city: first(a.city, a.town, a.village, a.state_district),
      region: first(a.state),
      country: first(a.country),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
