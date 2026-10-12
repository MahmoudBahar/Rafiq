import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { sanitizeAdjustments, type Adjustments } from '@/shared/lib/adjustments';
import { sanitizeIqama, type IqamaOffsets, IQAMA_DEFAULTS } from '@/shared/lib/iqama';
import { PRAYER_AZKAR_DEFAULT, sanitizePrayerAzkar } from '@/shared/lib/prayerAzkar';
import { kv } from './kv';

export {
  ADJUST_LIMIT,
  FARD_KEYS,
  clampAdjust,
  type Adjustments,
  type FardKey,
  type PrayerKey,
} from '@/shared/lib/adjustments';
export { IQAMA_DEFAULTS, IQAMA_LIMIT, clampIqama, isDefaultIqama, type IqamaOffsets } from '@/shared/lib/iqama';

/** `daylight`: light between sunrise and Maghrib, dark otherwise. */
export type ThemeMode = 'light' | 'dark' | 'system' | 'daylight';
export type Madhab = 'shafii' | 'hanafi';
const METHOD_IDS = [
  'egypt',
  'mwl',
  'ummalqura',
  'karachi',
  'isna',
  'moonsighting',
  'dubai',
  'kuwait',
  'qatar',
  'turkey',
  'singapore',
] as const;
export type Method = (typeof METHOD_IDS)[number];
export type LocationMode = 'auto' | 'manual';
/** `system` follows the device's reduce-motion setting; the others override it. */
export type MotionMode = 'system' | 'full' | 'reduced';
const MOTION_MODES: readonly MotionMode[] = ['system', 'full', 'reduced'];

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
  adjustments: Adjustments;
  /** Minutes from adhan to iqama per prayer; 0 = no iqama for that prayer. */
  iqama: IqamaOffsets;
  theme: ThemeMode;
  motion: MotionMode;
  /** How many launches showed the "swipe to browse days" nudge; 3 = never again. */
  swipeHintShown: number;
  /** How many launches showed the "tap the date" tip; 3 = never again. */
  dateHintShown: number;
  /** Minutes after each adhan during which the after-prayer azkar lead the azkar page. */
  prayerAzkarMinutes: number;
  /** The azkar drawer has been opened at least once: its handle stops breathing. */
  azkarDrawerOpened: boolean;
  /** The calendar day (ISO) the azkar drawer last nudged on; it nudges once a day. */
  azkarNudgeDay: string;
}

export const DEFAULTS: Settings = {
  onboarded: false,
  city: null,
  country: null,
  coords: null,
  locationMode: 'auto',
  method: 'egypt',
  madhab: 'shafii',
  adjustments: {},
  iqama: IQAMA_DEFAULTS,
  theme: 'system',
  motion: 'system',
  swipeHintShown: 0,
  dateHintShown: 0,
  prayerAzkarMinutes: PRAYER_AZKAR_DEFAULT,
  azkarDrawerOpened: false,
  azkarNudgeDay: '',
};

const KEY = 'rafiq.settings.v1';

function load(): Settings {
  try {
    const raw = kv.get(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      ...DEFAULTS,
      ...parsed,
      adjustments: sanitizeAdjustments(parsed.adjustments),
      iqama: sanitizeIqama(parsed.iqama),
      // A method that has since left the list (Tehran, Jafari) falls back to the default.
      method: METHOD_IDS.includes(parsed.method as Method) ? (parsed.method as Method) : DEFAULTS.method,
      motion: MOTION_MODES.includes(parsed.motion as MotionMode) ? (parsed.motion as MotionMode) : 'system',
      prayerAzkarMinutes: sanitizePrayerAzkar(parsed.prayerAzkarMinutes),
      azkarDrawerOpened: parsed.azkarDrawerOpened === true,
      azkarNudgeDay: typeof parsed.azkarNudgeDay === 'string' ? parsed.azkarNudgeDay : '',
    };
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
