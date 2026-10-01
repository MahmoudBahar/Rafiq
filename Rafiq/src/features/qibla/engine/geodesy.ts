import { DEG, RAD, normalizeDeg } from './angles';
import type { Coords } from './types';

/** The Kaaba (WGS84). */
export const KAABA: Coords = { latitude: 21.4225241, longitude: 39.8261818 };

// WGS84 ellipsoid.
const A = 6378137;
const F = 1 / 298.257223563;
const B = A * (1 - F);
const MEAN_RADIUS_M = 6371008.8;

export interface Geodesic {
  /** Initial azimuth from the start toward the end, degrees clockwise from true north, [0, 360). */
  azimuthDeg: number;
  distanceKm: number;
  /** The ellipsoidal solution did not converge (near-antipodal points); a spherical one stands in. */
  spherical: boolean;
}

/**
 * The geodesic (shortest path on the WGS84 ellipsoid) from `from` to `to`,
 * by Vincenty's inverse formula. A great circle on a sphere differs from it
 * by up to ~0.3° in azimuth over Qibla distances; the ellipsoid is the
 * Earth's actual shape. Near the antipode the iteration does not converge
 * (every direction is nearly as short), and the spherical answer is used.
 */
export function geodesic(from: Coords, to: Coords): Geodesic {
  const L = (to.longitude - from.longitude) * DEG;
  const U1 = Math.atan((1 - F) * Math.tan(from.latitude * DEG));
  const U2 = Math.atan((1 - F) * Math.tan(to.latitude * DEG));
  const sinU1 = Math.sin(U1);
  const cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2);
  const cosU2 = Math.cos(U2);

  let lambda = L;
  let sinSigma = 0;
  let cosSigma = 0;
  let sigma = 0;
  let cosSqAlpha = 0;
  let cos2SigmaM = 0;
  let sinLambda = 0;
  let cosLambda = 0;
  let converged = false;
  for (let i = 0; i < 200; i++) {
    sinLambda = Math.sin(lambda);
    cosLambda = Math.cos(lambda);
    const t1 = cosU2 * sinLambda;
    const t2 = cosU1 * sinU2 - sinU1 * cosU2 * cosLambda;
    sinSigma = Math.sqrt(t1 * t1 + t2 * t2);
    if (sinSigma === 0) {
      // Coincident points: no direction at all.
      return { azimuthDeg: 0, distanceKm: 0, spherical: false };
    }
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
    cosSqAlpha = 1 - sinAlpha * sinAlpha;
    // On the equator line cos²α is 0 and cos 2σm is undefined; it is 0 there.
    cos2SigmaM = cosSqAlpha !== 0 ? cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha : 0;
    const C = (F / 16) * cosSqAlpha * (4 + F * (4 - 3 * cosSqAlpha));
    const prev = lambda;
    lambda =
      L +
      (1 - C) * F * sinAlpha * (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
    if (Math.abs(lambda) > Math.PI) break; // Antipodal: Vincenty diverges.
    if (Math.abs(lambda - prev) < 1e-12) {
      converged = true;
      break;
    }
  }
  if (!converged) return spherical(from, to);

  const uSq = (cosSqAlpha * (A * A - B * B)) / (B * B);
  const bigA = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const bigB = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const deltaSigma =
    bigB *
    sinSigma *
    (cos2SigmaM +
      (bigB / 4) *
        (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
          (bigB / 6) * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));
  const s = B * bigA * (sigma - deltaSigma);
  const alpha1 = Math.atan2(cosU2 * sinLambda, cosU1 * sinU2 - sinU1 * cosU2 * cosLambda);
  return { azimuthDeg: normalizeDeg(alpha1 * RAD), distanceKm: s / 1000, spherical: false };
}

/** The great circle on a sphere of the Earth's mean radius: the fallback, and a cross-check. */
export function spherical(from: Coords, to: Coords): Geodesic {
  const p1 = from.latitude * DEG;
  const p2 = to.latitude * DEG;
  const dl = (to.longitude - from.longitude) * DEG;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  const distance = 2 * MEAN_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
  return { azimuthDeg: normalizeDeg(Math.atan2(y, x) * RAD), distanceKm: distance / 1000, spherical: true };
}

export interface QiblaBearing {
  /** Degrees clockwise from true north, [0, 360). */
  bearing: number;
  distanceKm: number;
  /**
   * How far the bearing can swing if the coordinates are off by
   * `positionErrorKm`: atan(error / distance). Small anywhere but near Mecca,
   * where a city-level position says little about the direction.
   */
  uncertaintyDeg: number;
}

/** The Qibla from `coords`: the initial direction of the geodesic to the Kaaba. */
export function qiblaBearing(coords: Coords, positionErrorKm = 0): QiblaBearing {
  const g = geodesic(coords, KAABA);
  const uncertaintyDeg = g.distanceKm > 0 ? Math.atan2(positionErrorKm, g.distanceKm) * RAD : 180;
  return { bearing: g.azimuthDeg, distanceKm: g.distanceKm, uncertaintyDeg };
}
