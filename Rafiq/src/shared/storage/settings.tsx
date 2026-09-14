import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { kv } from './kv';

export type ThemeMode = 'light' | 'dark' | 'system';
export type Madhab = 'shafii' | 'hanafi';
export type Method =
  | 'egypt'
  | 'mwl'
  | 'ummalqura'
  | 'karachi'
  | 'isna'
  | 'moonsighting'
  | 'dubai'
  | 'kuwait'
  | 'qatar'
  | 'turkey'
  | 'singapore'
  | 'tehran'
  | 'jafari';
export type LocationMode = 'auto' | 'manual';

export interface Coords {
  latitude: number;
  longitude: number;
}

export interface Settings {
  onboarded: boolean;
  /** Display label for the current place, in both location modes. */
  city: string | null;
  /** Geocoded country in auto mode; null when unknown. */
  country: string | null;
  /** Last device fix in auto mode. */
  coords: Coords | null;
  locationMode: LocationMode;
  method: Method;
  madhab: Madhab;
  theme: ThemeMode;
}

export const DEFAULTS: Settings = {
  onboarded: false,
  city: null,
  country: null,
  coords: null,
  locationMode: 'auto',
  method: 'egypt',
  madhab: 'shafii',
  theme: 'system',
};

const KEY = 'rafiq.settings.v1';

function load(): Settings {
  try {
    const raw = kv.get(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

interface SettingsContextValue {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  // Synchronous hydration: the very first render already knows theme + onboarded.
  const [settings, setSettings] = useState<Settings>(load);

  useEffect(() => {
    try {
      kv.set(KEY, JSON.stringify(settings));
    } catch {
      // persistence is best-effort
    }
  }, [settings]);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const value = useMemo(() => ({ settings, update }), [settings, update]);
  return <SettingsContext value={value}>{children}</SettingsContext>;
}

export function useSettings(): SettingsContextValue {
  const ctx = use(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>');
  return ctx;
}
