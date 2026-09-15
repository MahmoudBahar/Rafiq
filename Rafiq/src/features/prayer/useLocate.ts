import { useCallback, useState } from 'react';
import { useSettings, type Settings } from '@/shared/storage/settings';
import { LocationError, resolveLocation } from './location';

const MESSAGES: Record<LocationError['kind'], string> = {
  denied: 'لم يُسمح بالوصول إلى موقعك. يمكنك اختيار مدينتك يدوياً.',
  unavailable: 'تعذّر تحديد موقعك حالياً. اختر مدينتك يدوياً.',
};

export interface Locate {
  locating: boolean;
  error: string | null;
  /** Permission was denied permanently; the user must enable it in the OS settings. */
  cannotAskAgain: boolean;
  /** Resolves to true on success. `extra` is merged into the same settings update. */
  locate: (extra?: Partial<Settings>) => Promise<boolean>;
}

/** Runs the device-location flow and writes the result to settings in a single update. */
export function useLocate(): Locate {
  const { update } = useSettings();
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cannotAskAgain, setCannotAskAgain] = useState(false);

  const locate = useCallback(
    async (extra?: Partial<Settings>) => {
      if (locating) return false;
      setLocating(true);
      setError(null);
      try {
        const { city, region, country, latitude, longitude } = await resolveLocation();
        update({ locationMode: 'auto', city, region, country, coords: { latitude, longitude }, ...extra });
        return true;
      } catch (e) {
        const kind = e instanceof LocationError ? e.kind : 'unavailable';
        setCannotAskAgain(e instanceof LocationError && e.kind === 'denied' && !e.canAskAgain);
        setError(MESSAGES[kind]);
        return false;
      } finally {
        setLocating(false);
      }
    },
    [locating, update],
  );

  return { locating, error, cannotAskAgain, locate };
}
