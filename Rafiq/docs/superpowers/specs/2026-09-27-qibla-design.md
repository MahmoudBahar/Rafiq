# Qibla — design

Approved 2026-09-27. Prototype used for the dial pick: https://claude.ai/artifact/18PcG4J5PM2SQEdzrvR8Ur

## Goal

Make the "القبلة" tab real: guide the user clearly to the Qibla with motion, a visible "locked" state, and honest confidence and calibration feedback.

## Modes and layout

- **Compass** is the tab. Hero: **السجادة (prayer mat)** — a top-down mat that turns with the heading, its niche end pointing at the Qibla. When it lies straight on the screen the user faces the Qibla: the lamp in the niche lights and the mat settles (slight scale up).
- **Globe** is the mat's flip side (tap to flip): an offline orthographic globe centred on the great circle from the user to Mecca, the arc drawing itself in, a light resting on Mecca, caption with bearing and distance.
- **Camera** (AR) is a page that rises from a small round icon by the title (never a button on the ground band: it clashed with the floating nav bar). `transparentModal` on the root stack like `prayer/[key]`; the camera runs only while the page is mounted. Bearing strip at the top, Kaaba beacon placed by camera heading and pitch, edge arrow when off-screen, posture hints.
- Sun/shadow method: out. Map tiles / API keys: out.

## Behaviour

- States from `|delta|` (delta = shortest signed bearing − heading): **far**, **near** ≤ 10°, **locked** ≤ 3° (leave at 4°).
- Turn hint: "أدر يمينًا ١٢°" / "أدر يسارًا …" the shorter way; "أنت في اتجاه القبلة" when locked.
- Haptics: **one `lock()` cue on entering lock, nothing else** (10° detents dropped). Visual flash only at lock.
- Confidence pill: "دقة عالية / متوسطة / يحتاج معايرة". Cards on the ground band: calibration (figure-8 loop) and interference ("ابتعد عن المعادن أو المغناطيس"). `unavailable` → text bearing only; `no-location` → prompt to set the city.
- Posture: dial page says "ضع الهاتف مستويًا" when pitch > 60°; camera page says "ارفع الهاتف أمامك" when pitch < 30°.
- Not mirrored under RTL. Reduced motion: no loops, cross-fade flip, needle without spring.
- Coordinates: `settings.coords` (exact fix) else the chosen city; caption says which; "تحديد موقعي" reuses `useLocate()`.

## Direction and confidence

- Attitude from `expo-sensors` DeviceMotion (magnetic-north referenced on both platforms) → rotation matrix → `flatHeading` (+Y), `cameraHeading` (−Z), `pitch`. Android's `expo-location` heading is flat-only (no coordinate remap) and throttled, so it is not the direction source.
- `expo-location` `watchHeadingAsync` provides the accuracy flag (0–3) and declination (`trueHeading − magHeading` when `trueHeading ≥ 0`); `geomagnetism` WMM2025 is the offline fallback.
- Magnetometer field strength outside 25–65 µT, or a > 15° jump while still → `interference`.
- Confidence order: no-location → unavailable → interference → calibrate (accuracy ≤ 1) → good.
- Smoothing: shortest-path unwrap + low-pass on the UI thread; stillness = range of the last ~1 s < 4°.

## Structure

`src/features/qibla/{engine,data,dial,globe,camera,calibration}`, `useQibla.ts`, `useQiblaCoords.ts`; pages `src/app/(tabs)/qibla.tsx`, `src/app/qibla/camera.tsx`. `TabScene` takes a numeric `index`. `vitest` covers `src/**/engine/**`. Delivery: branch `feature/qibla`, three PRs (compass, globe, camera).
