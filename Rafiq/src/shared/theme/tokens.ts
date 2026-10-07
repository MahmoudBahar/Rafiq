export const light = {
  bg: '#fbf8f1',
  surface: '#ffffff',
  border: '#eee6d6',
  tp: '#0e3c35',
  ts: '#5c5647',
  tm: '#a68a5b',
  accent: '#c97b5a',
  selbg: '#f3ede0',
  selbr: '#e0d8c4',
  hero: '#0e3c35',
  herotext: '#f4ead8',
  skytop: '#f7f1e0',
  skybot: '#e2d3ad',
  arcdim: '#d8caa8',
  moon: '#a68a5b',
  starop: 0,
  tabbg: '#0e3c35',
  tabicon: '#8fafa5',
  tabactive: '#c97b5a',
  shadow: 'rgba(14,60,53,0.22)',
};

export type Palette = typeof light;

export const dark: Palette = {
  bg: '#0a2b26',
  surface: '#0e3c35',
  border: '#1d4a42',
  tp: '#f4ead8',
  ts: '#c9bfa4',
  tm: '#8fafa5',
  accent: '#c97b5a',
  selbg: '#14453d',
  selbr: '#2f5a51',
  hero: '#e8dcc3',
  herotext: '#0e3c35',
  skytop: '#041a16',
  skybot: '#11463d',
  arcdim: '#3d6a60',
  moon: '#e8dcc3',
  starop: 0.5,
  tabbg: '#0e3c35',
  tabicon: '#8fafa5',
  tabactive: '#c97b5a',
  shadow: 'rgba(0,0,0,0.4)',
};

/**
 * The azkar dial paints its own sky: morning is always the light sky and
 * evening the night sky, whatever the app theme, because there the sky is the
 * subject rather than the chrome. Text that sits on it takes its colours here.
 */
export const dialSky = {
  morning: { top: light.skytop, bot: light.skybot, text: light.tp, sub: light.ts, muted: light.tm },
  evening: { top: dark.skytop, bot: dark.skybot, text: dark.tp, sub: dark.ts, muted: dark.tm },
  dusk: light.accent,
  moon: dark.hero,
} as const;

export interface Sky {
  top: string;
  bot: string;
  text: string;
  sub: string;
  muted: string;
  /** Light text on a dark sky: the status bar goes light too. */
  dark: boolean;
}

/** A sky's colour at some opacity, for the band's track and chip borders. */
export function skyAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

const night: Sky = { ...dialSky.evening, dark: true };
const day: Sky = { ...dialSky.morning, dark: false };

/**
 * The reader's sky per set, and per prayer for the after-prayer set: the hour
 * the azkar belong to, painted whatever the app theme, like the dial's. The
 * band's track and chip borders are drawn in each sky's own text colour, which
 * is already chosen to read on it; the progress itself is the accent, as the beads are.
 */
export const readerSky = {
  morning: day,
  evening: night,
  waking: { top: '#071d22', bot: '#2b5f58', text: dark.tp, sub: dark.ts, muted: dark.tm, dark: true } as Sky,
  // Deep night, lifting into a cool moonlit teal above the sheet: its old foot was the dark theme's own bg.
  sleep: { top: '#02100e', bot: '#1c434a', text: dark.tp, sub: dark.ts, muted: dark.tm, dark: true } as Sky,
  prayer: {
    fajr: { top: '#1d4a4f', bot: '#c99f74', text: dark.tp, sub: light.skytop, muted: dark.ts, dark: true } as Sky,
    dhuhr: { top: '#f3e9d3', bot: '#dcbf93', text: light.tp, sub: light.ts, muted: light.tm, dark: false } as Sky,
    // Late afternoon: the same daylight, warmer and lower.
    asr: { top: '#e8cc9d', bot: '#cf9462', text: light.tp, sub: light.ts, muted: '#8a6a3f', dark: false } as Sky,
    maghrib: { top: '#3b4a4a', bot: '#c97b5a', text: dark.tp, sub: light.skytop, muted: light.skybot, dark: true } as Sky,
    // The hour after dusk: the evening's night above, the horizon only slightly warmed and greyed to ash.
    isha: { top: '#041a16', bot: '#3f4a44', text: dark.tp, sub: dark.ts, muted: dark.tm, dark: true } as Sky,
  },
} as const;

export const fonts = {
  display: 'ScheherazadeNew_400Regular',
  displayBold: 'ScheherazadeNew_700Bold',
  ui: 'IBMPlexSansArabic_400Regular',
  uiMedium: 'IBMPlexSansArabic_500Medium',
  uiSemi: 'IBMPlexSansArabic_600SemiBold',
  uiBold: 'IBMPlexSansArabic_700Bold',
} as const;

export const radius = { sm: 10, md: 12, lg: 14, xl: 26, pill: 999 } as const;
