# Rafiq app

This folder is the Expo application for **رَفِيق · Rafiq**. The full project overview, screenshots, and setup instructions are in the [repository README](../README.md).

## Quick start

```bash
npm install
npx expo prebuild --clean   # after cloning or changing app.json
npx expo run:android        # or: npx expo run:ios
```

Then keep `npx expo start` running while you work. The app requires a development build because it uses native modules and forces RTL at build time, so it does not run in Expo Go.

## Scripts

| Command | Purpose |
| --- | --- |
| `npx expo start` | Start Metro for the installed dev build |
| `npx expo run:android` / `run:ios` | Build and install a dev build |
| `npx tsc --noEmit` | Type check |
| `npx expo lint` | Lint |
| `npx expo-doctor` | Check dependencies and config |

## Where things live

- `src/app/` — routes (`_layout`, `onboarding`, `index`, `settings`)
- `src/features/prayer/` — timetable, next-prayer logic, countdown, sun arc
- `src/shared/` — theme tokens, settings storage, Arabic/Hijri helpers, UI kit
- `assets/images/` — app icons and splash images
- `app.json` — Expo config (icons, splash, `expo-localization` RTL plugin)
- `eas.json` — EAS build profiles
