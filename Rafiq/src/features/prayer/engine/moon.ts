import { illuminated, sincos } from 'astronomia/base';
import { Ecliptic } from 'astronomia/coord';
import { deltaT } from 'astronomia/deltat';
import { Calendar } from 'astronomia/julian';
import { phaseAngle3 } from 'astronomia/moonillum';
import { parallax, position as moonPosition } from 'astronomia/moonposition';
import { meanObliquity, nutation } from 'astronomia/nutation';
import { stdh0Lunar, times as riseTimes } from 'astronomia/rise';
import { apparent as siderealApparent, apparent0UT } from 'astronomia/sidereal';
import type { Coords } from './types';

/**
 * Moon rise/set cycle and phase for an observer (Meeus via astronomia).
 * React-free. Longitudes here are east-positive; astronomia wants west-positive.
 */
export interface MoonState {
  /** Above the horizon now. */
  up: boolean;
  /** Start of the current above-horizon interval (when up). */
  rise: Date | null;
  /** End of that interval (when up). */
  set: Date | null;
  /** 0..1 progress rise → set (when up). */
  t: number;
  /** Next moonrise after `now` (when not up). */
  nextRise: Date | null;
  /** 0 new → 0.25 first quarter → 0.5 full → 0.75 last quarter → 1. */
  phase: number;
  /** Illuminated fraction 0..1. */
  fraction: number;
}

const DAY_MS = 86_400_000;
const D2R = Math.PI / 180;
const TWO_PI = 2 * Math.PI;
/** Events closer than this are the same event reported by two adjacent UT days. */
const DEDUPE_MS = 10 * 60_000;

interface Equatorial {
  ra: number;
  dec: number;
  range: number;
}

interface MoonEvent {
  kind: 'rise' | 'set';
  at: number;
}

/** Apparent equatorial coordinates of the Moon at a Julian ephemeris day. */
function equatorial(jde: number): Equatorial {
  const pos = moonPosition(jde);
  const [dpsi, deps] = nutation(jde);
  const eq = new Ecliptic(pos.lon + dpsi, pos.lat).toEquatorial(meanObliquity(jde) + deps);
  return { ra: eq.ra, dec: eq.dec, range: pos.range };
}

const utDayStart = (ms: number): number => Math.floor(ms / DAY_MS) * DAY_MS;

function julianDay(ms: number): { jd: number; jde: number; dT: number } {
  const cal = new Calendar().fromDate(new Date(ms));
  const jd = cal.toJD();
  const dT = deltaT(cal.toYear());
  return { jd, jde: jd + dT / 86_400, dT };
}

/** Rise / set events of the Moon on one UT day (ms epoch); empty when circumpolar. */
function dayEvents(coords: Coords, dayStartMs: number): MoonEvent[] {
  const { jd, jde, dT } = julianDay(dayStartMs);
  const body = [-1, 0, 1].map((k) => equatorial(jde + k));
  // Unwrap right ascension so the three-point interpolation never crosses 0 / 2π.
  const ra = body.map((b) => b.ra);
  for (let i = 1; i < ra.length; i++) {
    while (ra[i] - ra[i - 1] > Math.PI) ra[i] -= TWO_PI;
    while (ra[i] - ra[i - 1] < -Math.PI) ra[i] += TWO_PI;
  }
  const dec = body.map((b) => b.dec);
  const h0 = stdh0Lunar(parallax(body[1].range));
  const observer = { lat: coords.latitude * D2R, lon: -coords.longitude * D2R };
  try {
    const rs = riseTimes(observer, dT, h0, apparent0UT(jd), ra, dec);
    return [
      { kind: 'rise', at: dayStartMs + rs.rise * 1000 },
      { kind: 'set', at: dayStartMs + rs.set * 1000 },
    ];
  } catch {
    return []; // always above or below the horizon that day
  }
}

/** Altitude of the Moon's centre above the horizon, radians (no refraction). */
function altitude(coords: Coords, ms: number): number {
  const { jd, jde } = julianDay(ms);
  const { ra, dec } = equatorial(jde);
  const theta = (siderealApparent(jd) / 86_400) * TWO_PI; // Greenwich apparent sidereal time
  const hourAngle = theta + coords.longitude * D2R - ra;
  const [sLat, cLat] = sincos(coords.latitude * D2R);
  const [sDec, cDec] = sincos(dec);
  return Math.asin(sLat * sDec + cLat * cDec * Math.cos(hourAngle));
}

function events(coords: Coords, nowMs: number): MoonEvent[] {
  const start = utDayStart(nowMs);
  const raw = [-1, 0, 1].flatMap((k) => dayEvents(coords, start + k * DAY_MS)).sort((a, b) => a.at - b.at);
  const out: MoonEvent[] = [];
  for (const e of raw) {
    const last = out[out.length - 1];
    if (last && last.kind === e.kind && e.at - last.at < DEDUPE_MS) continue;
    out.push(e);
  }
  return out;
}

export function moonState(coords: Coords, now: Date): MoonState {
  const nowMs = now.getTime();
  const { jde } = julianDay(nowMs);

  // Phase: phase angle → illuminated fraction; waxing while the fraction grows.
  const i = phaseAngle3(jde);
  const fraction = illuminated(i);
  const waxing = illuminated(phaseAngle3(jde + 0.02)) > fraction;
  const k = i / Math.PI; // 1 at new moon, 0 at full
  const phase = waxing ? (1 - k) / 2 : (1 + k) / 2;

  const h0 = stdh0Lunar(parallax(moonPosition(jde).range));
  const up = altitude(coords, nowMs) > h0;

  const evs = events(coords, nowMs);
  const lastRise = [...evs].reverse().find((e) => e.kind === 'rise' && e.at <= nowMs) ?? null;
  const nextSet = evs.find((e) => e.kind === 'set' && e.at > nowMs) ?? null;
  const nextRise = evs.find((e) => e.kind === 'rise' && e.at > nowMs) ?? null;

  if (up && lastRise && nextSet && (!nextRise || nextRise.at > nextSet.at)) {
    const t = (nowMs - lastRise.at) / (nextSet.at - lastRise.at);
    return {
      up,
      rise: new Date(lastRise.at),
      set: new Date(nextSet.at),
      t: Math.min(1, Math.max(0, t)),
      nextRise: null,
      phase,
      fraction,
    };
  }
  return {
    up,
    rise: null,
    set: null,
    t: up ? 0.5 : 0, // circumpolar fallback: park it at the apex
    nextRise: up ? null : nextRise ? new Date(nextRise.at) : null,
    phase,
    fraction,
  };
}
