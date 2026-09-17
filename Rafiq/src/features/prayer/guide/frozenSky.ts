import { computeDay, type DayTimes, type PrayerConfig, type PrayerKey } from '../engine';
import { moonState } from '../engine/moon';
import { sunAltitude } from '../engine/sun';
import { skyState, type SkyState } from '../sky';

const MIN_MS = 60_000;
/** Duha window opens this long after sunrise. */
export const DUHA_AFTER_SUNRISE_MIN = 15;
/** Maghrib's snapshot is taken with the disc still crossing the horizon. */
const MAGHRIB_LEAD_MS = 90_000;

export interface FrozenSky {
  day: DayTimes;
  sky: SkyState;
  /** The instant drawn. */
  at: Date;
}

/**
 * The home sky arc as it stands at one prayer's moment on a given day: the
 * same maths as `useSky`, evaluated once instead of on a ticking clock.
 */
export function frozenSky(cfg: PrayerConfig, date: Date, key: PrayerKey): FrozenSky {
  const day = computeDay(cfg, date);
  const at =
    key === 'sunrise'
      ? new Date(day.byKey.sunrise.getTime() + DUHA_AFTER_SUNRISE_MIN * MIN_MS)
      : key === 'maghrib'
        ? new Date(day.sunset.getTime() - MAGHRIB_LEAD_MS)
        : day.byKey[key];
  const moon = moonState(cfg.coords, at);
  const sunAlt = sunAltitude(cfg.coords, at);
  return { day, sky: skyState({ now: at, day, moon, sunAlt }), at };
}
