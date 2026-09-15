import { createContext, use } from 'react';

/**
 * Whether the sun is currently up (between sunrise and Maghrib). Provided by
 * `DaylightProvider` in the prayer feature; the theme hook reads it for the
 * "daylight" theme mode. Defaults to day so the tree renders before the
 * provider mounts.
 */
export const DaylightContext = createContext<boolean>(true);

export const useDaylight = (): boolean => use(DaylightContext);
