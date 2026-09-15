import { useMemo } from 'react';
import type { Coords, DayTimes } from './engine';
import { moonState } from './engine/moon';
import { sunAltitude } from './engine/sun';
import { skyState, type SkyState } from './sky';

/** The arc is refreshed at this cadence: the Sun moves well under a pixel in it. */
const ARC_TICK_MS = 10_000;

/**
 * Sun / Moon / star state for the header. The Moon's rise, set and phase are
 * recomputed once a minute and the whole sky once every ten seconds, so the
 * arc SVG is not re-rasterised on every countdown tick.
 */
export function useSky(now: Date, day: DayTimes, coords: Coords): SkyState {
  const minute = Math.floor(now.getTime() / 60_000);
  const tick = Math.floor(now.getTime() / ARC_TICK_MS) * ARC_TICK_MS;
  const { latitude, longitude } = coords;
  const moon = useMemo(
    () => moonState({ latitude, longitude }, new Date(minute * 60_000)),
    [latitude, longitude, minute],
  );
  return useMemo(() => {
    const at = new Date(tick);
    return skyState({ now: at, day, moon, sunAlt: sunAltitude({ latitude, longitude }, at) });
  }, [tick, day, moon, latitude, longitude]);
}
