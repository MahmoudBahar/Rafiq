/**
 * Minimal typings for the astronomia modules Rafiq uses (the package ships
 * none). Angles are radians; longitudes are measured positively WESTWARD.
 */
declare module 'astronomia/base' {
  const base: {
    illuminated(phaseAngle: number): number;
    pmod(x: number, y: number): number;
    sincos(x: number): [number, number];
  };
  export function illuminated(phaseAngle: number): number;
  export function sincos(x: number): [number, number];
  export default base;
}

declare module 'astronomia/julian' {
  export class Calendar {
    constructor(year?: number | Date, month?: number, day?: number);
    fromDate(date: Date): this;
    fromJD(jd: number): this;
    fromJDE(jde: number): this;
    toJD(): number;
    toJDE(): number;
    toYear(): number;
    toDate(): Date;
    midnight(): this;
  }
}

declare module 'astronomia/moonposition' {
  export function position(jde: number): { lon: number; lat: number; range: number };
  export function parallax(distanceKm: number): number;
}

declare module 'astronomia/coord' {
  export class Equatorial {
    constructor(ra?: number, dec?: number);
    ra: number;
    dec: number;
  }
  export class Ecliptic {
    constructor(lon?: number, lat?: number);
    lon: number;
    lat: number;
    toEquatorial(obliquity: number): Equatorial;
  }
}

declare module 'astronomia/nutation' {
  export function nutation(jde: number): [number, number];
  export function meanObliquity(jde: number): number;
}

declare module 'astronomia/sidereal' {
  /** Apparent sidereal time at Greenwich, seconds of day. */
  export function apparent(jd: number): number;
  export function apparent0UT(jd: number): number;
}

declare module 'astronomia/deltat' {
  export function deltaT(decimalYear: number): number;
}

declare module 'astronomia/rise' {
  export interface RiseObj {
    rise: number;
    transit: number;
    set: number;
  }
  export const meanRefraction: number;
  export function stdh0Lunar(parallax: number, refraction?: number): number;
  export function times(
    observer: { lat: number; lon: number },
    deltaT: number,
    h0: number,
    th0: number,
    ra3: number[],
    dec3: number[],
  ): RiseObj;
}

declare module 'astronomia/moonillum' {
  export function phaseAngle3(jde: number): number;
}
