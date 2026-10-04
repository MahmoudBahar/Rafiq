import { Coordinates, Qibla } from 'adhan';
import { describe, expect, it } from 'vitest';
import { KAABA, geodesic, qiblaBearing, spherical } from './geodesy';

const dms = (d: number, m: number, s: number) => Math.sign(d) * (Math.abs(d) + m / 60 + s / 3600);

describe('geodesic (Vincenty on WGS84)', () => {
  it("reproduces Geoscience Australia's worked example, Flinders Peak to Buninyong", () => {
    const g = geodesic(
      { latitude: -dms(37, 57, 3.7203), longitude: dms(144, 25, 29.5244) },
      { latitude: -dms(37, 39, 10.1561), longitude: dms(143, 55, 35.3839) },
    );
    expect(g.spherical).toBe(false);
    expect(g.distanceKm).toBeCloseTo(54.972271, 5);
    expect(g.azimuthDeg).toBeCloseTo(dms(306, 52, 5.37), 4);
  });

  it('falls back to the great circle at the Kaaba’s antipode, where Vincenty does not converge', () => {
    const g = geodesic({ latitude: -KAABA.latitude, longitude: KAABA.longitude - 180 + 0.3 }, KAABA);
    expect(Number.isFinite(g.azimuthDeg)).toBe(true);
    expect(g.distanceKm).toBeGreaterThan(19900);
  });

  it('gives no direction at the Kaaba itself', () => {
    expect(geodesic(KAABA, KAABA)).toEqual({ azimuthDeg: 0, distanceKm: 0, spherical: false });
  });
});

describe('qiblaBearing', () => {
  // Published great-circle Qibla directions (adhan's, the spherical formula in every Qibla table).
  const places = [
    ['Cairo', 30.0444, 31.2357],
    ['London', 51.5074, -0.1278],
    ['New York', 40.7128, -74.006],
    ['Jakarta', -6.2088, 106.8456],
    ['Sydney', -33.8688, 151.2093],
    ['Anchorage', 61.2181, -149.9003],
    ['Lima', -12.0464, -77.0428],
  ] as const;
  for (const [name, lat, lon] of places) {
    it(`agrees with the spherical tables within the ellipsoid's ~0.3° (${name})`, () => {
      const ours = qiblaBearing({ latitude: lat, longitude: lon }).bearing;
      const table = Qibla(new Coordinates(lat, lon));
      const diff = Math.abs(((ours - table + 540) % 360) - 180);
      expect(diff).toBeLessThan(0.5);
    });
  }

  it('Cairo: 136.1°, about 1,290 km', () => {
    const q = qiblaBearing({ latitude: 30.0444, longitude: 31.2357 });
    expect(q.bearing).toBeCloseTo(136.1, 0);
    expect(q.distanceKm).toBeGreaterThan(1250);
    expect(q.distanceKm).toBeLessThan(1330);
  });

  it('the bearing is uncertain near Mecca when the position is only city-level', () => {
    const inMecca = qiblaBearing({ latitude: 21.389, longitude: 39.857 }, 10);
    expect(inMecca.uncertaintyDeg).toBeGreaterThan(45);
    const cairo = qiblaBearing({ latitude: 30.0444, longitude: 31.2357 }, 10);
    expect(cairo.uncertaintyDeg).toBeLessThan(0.5);
  });

  it('the spherical fallback agrees with adhan', () => {
    const s = spherical({ latitude: 30.0444, longitude: 31.2357 }, KAABA);
    expect(s.azimuthDeg).toBeCloseTo(Qibla(new Coordinates(30.0444, 31.2357)), 6);
  });
});
