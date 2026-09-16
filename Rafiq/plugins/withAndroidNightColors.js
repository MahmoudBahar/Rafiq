const { AndroidConfig, withAndroidColorsNight } = require('@expo/config-plugins');

/**
 * Dark-mode window background for Android.
 * Prebuild writes `activityBackground` (from `backgroundColor`) into values/colors.xml
 * only, so in dark mode the window flashes the light color between the dark splash
 * and the first React frame. This adds the values-night counterpart.
 */
const DARK_BG = '#0a2b26'; // = dark.bg in src/shared/theme/tokens.ts

module.exports = function withAndroidNightColors(config) {
  return withAndroidColorsNight(config, (config) => {
    config.modResults = AndroidConfig.Colors.assignColorValue(config.modResults, {
      name: 'activityBackground',
      value: DARK_BG,
    });
    return config;
  });
};
