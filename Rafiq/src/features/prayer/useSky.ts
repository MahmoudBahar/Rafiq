import { useMemo } from 'react';
import type { Coords, DayTimes } from './engine';
import { moonState } from './engine/moon';
import { skyState, type SkyState } from './sky';

/**
 * Sun / Moon / star state for the header. The Moon's rise, set and phase are
 * recomputed once a minute; everything else follows `now` directly.
 */
export function useSky(now: Date, day: DayTimes, coords: Coords): SkyState {
  const minute = Math.floor(now.getTime() / 60_000);
  const { latitude, longitude } = coords;
  const moon = useMemo(
    () => moonState({ latitude, longitude }, new Date(minute * 60_000)),
    [latitude, longitude, minute],
  );
  return skyState({ now, day, moon });
}
