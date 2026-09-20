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

export const fonts = {
  display: 'ScheherazadeNew_400Regular',
  displayBold: 'ScheherazadeNew_700Bold',
  ui: 'IBMPlexSansArabic_400Regular',
  uiMedium: 'IBMPlexSansArabic_500Medium',
  uiSemi: 'IBMPlexSansArabic_600SemiBold',
  uiBold: 'IBMPlexSansArabic_700Bold',
} as const;

export const radius = { sm: 10, md: 12, lg: 14, xl: 26, pill: 999 } as const;
