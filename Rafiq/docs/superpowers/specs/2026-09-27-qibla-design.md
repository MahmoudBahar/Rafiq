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

- North: the calibrated magnetometer tilt-corrected by the platform's fused gravity (`DeviceMotion` `accelerationIncludingGravity − acceleration`, exact on both platforms) → earth frame in device coordinates → `flatHeading` (+Y), `cameraHeading` (−Z, blended in as the top edge loses horizontal reach), `pitch`. No Euler angles anywhere in the heading path. Without a gyroscope the bare accelerometer, low-passed, stands in for gravity.
- The gyroscope turns the field estimate between magnetometer readings (vector complementary filter, τ = 0.5 s), so the dial follows the hand and settles on the magnetometer. Per-platform gyroscope axes and accelerometer signs live in `engine/conventions.ts`.
- `interference` = the field's size or dip far from the WMM for 2 s (hysteresis) **or** the field swinging while the gyroscope sees no turn. `calibrate` = the platform's accuracy ≤ 1 (`watchHeadingAsync`). Stillness from the gyroscope (< 3°/s for 1 s); `good` after 2 s still when the platform gives no accuracy.
- Declination from the WMM (`geomagnetism`), always; the platform's true − magnetic is shown beside it in the dev readout. The platform's fused attitude and its own compass are readout cross-checks, never the compass.
- Confidence order: no-location → unavailable → interference → settling (no usable frame) → calibrate → good.
- Android 12+ needs `HIGH_SAMPLING_RATE_SENSORS` (declared) or expo runs every sensor at 5 Hz.
- Smoothing: shortest-path unwrap + low-pass on the UI thread.

## Structure

`src/features/qibla/{engine,data,dial,globe,camera,calibration}`, `useQibla.ts`, `useQiblaCoords.ts`; pages `src/app/(tabs)/qibla.tsx`, `src/app/qibla/camera.tsx`. `TabScene` takes a numeric `index`. `vitest` covers `src/**/engine/**`. Delivery: branch `feature/qibla`, three PRs (compass, globe, camera).
