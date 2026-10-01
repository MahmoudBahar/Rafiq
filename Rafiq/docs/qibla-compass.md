# The Qibla compass: how it works

Branch `feature/qibla-engine-v2`, 2026-10-01. Engine in `src/features/qibla/engine/`, hook in `src/features/qibla/useQibla.ts`. Every number below has its reason next to it; every platform convention was read from expo's native code (expo-sensors 57.0.3, expo-location 57.0.20), file and line given.

## 1. The idea in one sentence

**The calibrated magnetometer, tilt-corrected by the platform's fused gravity, says where north is; the gyroscope turns that estimate between readings so the dial follows the hand; the platform's own headings are cross-checks shown in development, never the compass.**

What this replaces, and why. The previous engine took "down" from the fused sensor's Euler angles with per-platform sign conventions pinned by hand, gated the fused sensor's yaw steps with a dt that was in milliseconds on Android and seconds on iOS, and called a 15° leap in three samples "interference". On Android 12+ all of that ran at 5 Hz, because expo registers every sensor at `SENSOR_DELAY_NORMAL` unless the app declares `HIGH_SAMPLING_RATE_SENSORS` (`SensorSubscription.kt:21-26`). At 5 Hz the old fuser's 0.05 gain per sample took ~10 s to settle on the floor, and an ordinary turn looked like a jump. The new engine uses no Euler angles, no per-sample gates, no step detectors, and declares the permission.

## 2. The sensors and the APIs

Device frame everywhere: X to the right of the screen, Y toward the top edge, Z out of the screen toward the user.

| API | What the phone puts behind it | What we get | Rate asked | Used for |
|---|---|---|---|---|
| `Magnetometer.addListener` (expo-sensors) | Android `TYPE_MAGNETIC_FIELD`, calibrated (`MagnetometerModule.kt:15`); iOS `CMDeviceMotion.magneticField.field`, calibrated (`MagnetometerModule.swift:32`) | `{x, y, z}` µT, device frame, `timestamp` seconds | 20 ms | **where north is**; the field's size and dip |
| `DeviceMotion.addListener` → `accelerationIncludingGravity`, `acceleration` | Android accelerometer − 2·`TYPE_GRAVITY` and `TYPE_LINEAR_ACCELERATION` (`DeviceMotionModule.kt:217-231`); iOS `(user + gravity)·G` and `user·G` from one `CMDeviceMotion` (`DeviceMotionModule.swift:89-99`) | their difference is **gravity pointing down**, exact on both platforms (z ≈ −9.81 face up) | 16 ms Android, 20 ms iOS | which way is down, free of the hand's own acceleration |
| `DeviceMotion.addListener` → `rotationRate` | gyroscope, deg/s, bias-compensated by the platform | the turn rate; **Android: alpha/beta/gamma about X/Y/Z** (`.kt:239-241`); **iOS: about Z/Y/X** (`.swift:108-110`) | same | turning the field estimate between magnetometer readings; stillness; telling a turn from a moved magnet |
| `DeviceMotion.addListener` → `rotation.alpha` | Android `TYPE_ROTATION_VECTOR` → −azimuth (`.kt:252`); iOS CoreMotion yaw in the x-magnetic-north frame (`SensorsUtils.swift:5-8`) | the platform's fused heading: Android `−alpha`, iOS `270° − yaw` (yaw 0 has the right edge on north). Flat phone only | same | the dev readout, nothing else |
| `Accelerometer.addListener` | g units on both (`AccelerometerModule.kt:18-20`); **Android points up (face up z = +1), iOS points down (z = −1)** | gravity, when there is no `DeviceMotion` (a phone without a gyroscope or gravity sensor: `DeviceMotionModule.kt:130-139` needs all five sensors) | 20 ms | the fallback tier's "down", low-passed τ = 0.3 s |
| `Location.watchHeadingAsync` | iOS `CLHeading`: Apple's heading and `headingAccuracy` mapped to 0–3 (`LocationUtils.swift:9-19`); Android expo-location's own raw accelerometer + magnetometer `getOrientation` at 5 Hz, ≥2° change, top edge only, silent without location permission (`LocationModule.kt:591-688`) | `magHeading`, `trueHeading` (−1 without a fix), `accuracy` 0–3 | event | the accuracy flag (0–1 → "calibrate"); the readout |
| `geomagnetism` `model(date).point([lat, lon])` | WMM2025, offline | `decl`, `f` (nT), `incl` | per location | declination (the source of record); the expected field |
| `adhan` `Qibla(coords)` | a formula | the great-circle bearing, true | per location | the target |

Never used: `DeviceMotion.interval`, which is milliseconds on Android (`.kt:259`) and seconds on iOS (`.swift:114`). Every sample carries a `timestamp` in seconds on both; the engine subtracts timestamps within one stream only.

Reference, Cairo (30.0444, 31.2357) on 2026-10-01: declination +4.77°, dip 44.98°, F 44.03 µT, H 31.14 µT. Qibla 136.14° true, 131.37° magnetic. A horizontal disturbance of 2 / 5 / 10 µT at right angles to north moves the heading 3.7° / 9.1° / 17.8°: small distortions are invisible to any phone; only gross ones can be caught.

## 3. The flow

```
 Magnetometer (50 Hz) ──▶ filter.correct(m, t)  ─┐        ┌─ fieldShape(m, down) ──▶ fieldWatch vs WMM ──▶ fieldAnomaly
                                                 │        └─ disagree.pushMeasured(m, down) ────────────▶ disagreement
 DeviceMotion (50–60 Hz)
   gravity = includingGravity − acceleration ──▶ down
   ω = gyroVector(rotationRate, platform) ─────▶ filter.rotate(ω, t) ; gyroStill ; disagree.pushGyro
   rotation.alpha ─────────────────────────────▶ attitudeHeading (readout)
                                                 ▼
                 earthFrame(filter.value(), down) ──▶ headingsFromFrame ──▶ flat / camera heading, pitch
                                                 ▼
                 + WMM declination ──▶ unwrap ──▶ target (shared value)       … every motion sample
 Location.watchHeadingAsync ──▶ accuracy ; platform mag/true (readout)
 adhan Qibla(coords) ──▶ bearing (shared value)

 UI thread, every frame:  heading += (target − heading) · pull ;  delta = shortestDelta(bearing, heading)
                          band (far / near / locked, hysteresis) ──▶ lockT, edgeT, haptic lock(), hint
 Confidence tick (4 Hz):  confidence(coords, sensors, interference, fieldUsable, accuracy, stillForS) ──▶ pill + cards
```

Everything from the sensors to `target` runs on the JS thread in `useQibla`; from `target` on it runs on the UI thread (Reanimated), so the mat never waits for React.

## 4. The engine (`src/features/qibla/engine/`, pure, vitest)

### 4.1 `vec.ts`
`Vec3`, `dot`, `cross`, `norm`, `unit` (null below 1e-9), `scale`, `add`, `sub`, and `rotate(v, k, θ)`: Rodrigues' rotation about a unit axis, exact for any angle.

### 4.2 `field.ts`: the frame
`earthFrame(mag, down)`: up = −down̂; north = the field with its vertical part removed, normalised; east = north × up. With the top edge on north, east is the device's +X. Null when |mag| < 5 µT (no place on Earth; a dead sensor), |down| < 0.1 (empty gravity, in g or m/s²), or the field's horizontal part is under 5% of it (dip past ~87°, the magnetic poles: a compass has nothing to point with).

`axisHeading(frame, axis)` = atan2(east·axis, north·axis): where any device axis points. `headingsFromFrame` reads the top edge (+Y) for the dial and the back camera (−Z) for the camera page, with the top edge handed over to the camera as its horizontal reach drops from 0.25 to 0.15 (pitch ≈ 75°–81°), blended, so raising the phone has no step. `pitch` = asin(up · Y). `fieldShape` gives |B| and the dip (asin of the field's component along down), signed.

Tested with synthetic physics (`testing/synthetic.ts`): the device-frame field and gravity for a given heading, pitch and roll in Cairo's field; the engine recovers the heading of the right axis to 1e-6 at eight postures × six headings, the dip at every posture, and the handover stays under 4° per half-degree of pitch.

### 4.3 `fieldFilter.ts`: the gyroscope between readings
The estimate is the field **vector** in the device frame, not an angle. The Earth's field is fixed; the phone moves; the gyroscope says how. `rotate(ω, t)` turns the estimate by −ω·dt (Rodrigues), `correct(m, t)` pulls it toward the reading by min(dt, τ)/τ. Every heading, for any axis and posture, is read from the vector afterwards, so there is no heading-rate formula, no unwrap inside the filter, and no reset when the page switches between the dial and the camera.

| Constant | Value | Reason |
|---|---|---|
| `FILTER_TAU_S` | 0.5 s | The platform-compensated gyroscope bias is under 1°/s, so the estimate can lag the truth by at most bias × τ = 0.5°. Magnetometer grain of 1–2° RMS at 50 Hz is cut by √(dt / 2τ) ≈ 7×. |
| `MAX_DT_S` | 0.25 s | A longer gap would integrate a stale rate; the turn is left to the magnetometer. |
| `GAP_RESET_S` | 1 s | Past this the estimate is stale and the next reading restarts it. |

Without a gyroscope (the accelerometer tier) the same filter is a plain low-pass of the field, τ = 0.25 s.

### 4.4 `health.ts`: what can be known
- **Stillness from the gyroscope** (`createGyroStillness`): |ω| < 3°/s held 1 s. The gyroscope's grain is ~0.1°/s RMS, so this is >10σ, while a hand sweeping a few degrees a second (what the platform's 2° deadband would notice) is not still. A magnet cannot fool it. The fallback tier uses the heading's range over 1 s ≤ 4° instead.
- **The field's shape against the model** (`createFieldWatch`), hysteresis and persistence: enters when |B| is outside [0.65 F, 1.5 F] or the dip is off by more than 20°, for 2 s; clears when |B| is inside [0.75 F, 1.35 F] and the dip within 15°, for 1 s. From real readings on an S24 Ultra: a desk with a charging cable read 65 µT at 43° with the heading right (+48%: must pass); the same desk by a laptop read 78 µT at 61° with the heading wrong (+77%: must fail). A calibrated phone in a clean room reads within ±15% of the model; Android's own idea of an Earth field is 30–60 µT. The dip gate is provisional (the laptop case is caught by size alone, its dip being 16° off); tighten to 15/10 after a clean-field session if the dip spread is under 5°.
- **The gyroscope against the magnetometer** (`createDisagreementWatch`): a magnet brought near turns the measured field, and so does turning the phone; the magnetometer cannot tell them apart, the gyroscope can. A second copy of the field is dead-reckoned from the gyroscope alone and pulled onto the measurement only slowly (τ = 3 s, so a 1°/s bias costs 3° at most). When the measurement's horizontal direction differs from the copy's by more than 20° for 0.25 s, the field moved, not the phone. Sensor lag on an ordinary turn (≤ 50 ms × 180°/s = 9°) stays well under 20°; above 180°/s (a flick) the comparison is suspended for 0.2 s.

### 4.5 `confidence.ts`
First match wins: no coordinates → `no-location`; no magnetometer → `unavailable`; field anomaly or disagreement, held 2 s → `interference`; no usable frame on the latest sample → `settling` (never `good`); platform accuracy 0–1 → `calibrate`, 2–3 → `good`; no accuracy: still for 2 s → `good`, else `settling`. The state set is unchanged, so the pill and the cards are untouched.

### 4.6 Unchanged
`bearing.ts` (adhan, Cairo → 136.14°), `declination.ts` (WMM; `magneticToTrue`), `band.ts` (lock at 3°, leave at 4°, near at 10°), `smooth.ts` (`normalizeDeg`, `shortestDelta`, `blendHeadings`, `flatBlendWeight`, `unwrap`).

### 4.7 `conventions.ts`
Everything that differs per platform, in one file: `gravityFromMotion`, `downFromAccelerometer`, `gyroVector`, `attitudeHeading`, and the accelerometer low-pass.

## 5. The hook (`useQibla.ts`)

Subscribes while the tab is focused and the app in front. On start it asks what is available and picks a tier: `fused` (DeviceMotion + Magnetometer), `accel` (Accelerometer + Magnetometer), or `none`. Mode (dial or camera) and the coordinates' model (declination, expected field, field watch) are read through refs, so neither tears the sensors down.

- Magnetometer sample: `filter.correct`; `fieldShape` → the field watch; the disagreement watch. (Accel tier: also publish, and the heading-range stillness.)
- DeviceMotion sample: gravity from the two accelerations; ω → gyro stillness, `filter.rotate`, the disagreement watch; `rotation.alpha` → readout; then **publish**: frame from the filtered field and gravity → the mode's heading → + WMM declination → unwrapped against the last target → `target` and `pitch` shared values. The first sample seeds `heading` so the dial does not sweep in from zero.
- `watchHeadingAsync`: the accuracy flag; the platform's headings for the readout. Declination is always the WMM's; the platform's (true − magnetic) is shown beside it.
- Tick (250 ms): a magnetometer silent for 1 s marks the field unusable; fold confidence; measure the sample rates; publish the readout.

Return shape for the UI, unchanged: `bearing, band, turnDeg, turnRight, confidence, raised, values{heading, delta, pitch, lockT, edgeT}, debug`.

### The dev readout (development builds)
```
ours 131.4m 136.2t  os 130.9  plat 132/137 acc 3  decl 4.8/4.9
|B| 45.1/44.0 µT  dip 44.2/45.0°  pitch 1.2°  ω 0.3°/s
still · usable · field ok · gyro=mag  fused 48/60 Hz
```
Line 1: our heading (magnetic, true) against the platform's fused attitude and its own compass with accuracy, and the two declinations. Line 2: the field against the model, the posture, the turn rate. Line 3: the health flags, the tier, the measured rates.

## 6. Checking it on a device

The permission `android.permission.HIGH_SAMPLING_RATE_SENSORS` is in `app.json`; it needs `npx expo prebuild --platform android` and a rebuilt dev client. Confirm with `adb shell dumpsys package com.rafiqelmuslim.Rafiq | grep HIGH_SAMPLING`.

1. **Rates**: line 3 shows ≥ 30 Hz for both streams and `fused`. 5/5 Hz means the permission did not land.
2. **Flat and still** (the floor): `ours …m` equals `plat` within ~3°: it is the same maths as Android's `getOrientation` on the same magnetometer, so a mismatch means our frame is wrong, not the phone. `ours …t` reads ≈ 136 with the top edge on the Qibla, what the other compass apps call 137. |B| within ±15% of the model, dip 40–50°, ω < 1°/s, `still` after a second. `os` is noted, not trusted: it is the sensor that sat 145° off before.
3. **Turn** 90° clockwise by eye: the magnetic heading rises by 90, follows the hand at once, no overshoot, `gyro=mag` throughout. Walk about: no interference.
4. **Raise** to upright facing a wall: pitch → 90, the heading continuous through the handover.
5. **Magnet or speaker** within 10 cm while still: `GYRO≠MAG` at once, the card within 2 s, `FIELD OFF` after 2 s if the field is gross; take it away: clears in a second or two.
6. **Figure-8** once the platform reports accuracy ≤ 1: the calibration card shows, then clears.
7. **iPhone** (TestFlight): the same, plus dip +45° (the gravity sign), `os` ≈ `ours` flat (270 − yaw), a clockwise turn raising the heading (the gyroscope mapping).

## 7. What we know, what we don't

- Verified on the S24 Ultra: the recorded desk sample (field (−20.6, 18.4, −30.0) flat → 46–50° magnetic, the platform read 48°), the cable and laptop field readings, Android's attitude sign (alpha −159.3° with the compass on 162°).
- Not yet verified on a device with this engine: the rates after the permission lands; the floor heading against the other apps; iOS's gravity and gyroscope signs as expo exposes them (pinned from the native source; the readout's dip sign and a clockwise turn confirm them in ten seconds).
- In manual-city mode Android's `watchHeadingAsync` is silent (no location permission), so the calibration card can only come from the platform on iOS or in auto mode; the state then rests on two seconds of stillness.
- iOS runs two `CMMotionManager`s (one per expo module); if that costs delivery rate, line 3 will say so.
- Android's gravity mixes three sensor events with slightly different timestamps: a transient tilt error of ~3° during a jerk, zero at rest.
- Cannot be fixed in software: a room whose steel merely rotates the field. At a sunlit window every method, ours, the platform's, Samsung's, agreed on a heading 40° from the Sun's. The sun is the only reference there.

## 8. Tests

`npm test` runs vitest over `src/**/engine/**`: the synthetic-posture suite and hand-written readings for the frame; the per-platform conventions (gravity, accelerometer sign, gyroscope axes, attitude heading, low-pass); the filter (turn sign, seam, τ, a 90°/s turn tracked within 2°, a 1°/s bias under 0.6°, dt clamp, gaps); health (stillness, the field watch with the recorded samples and hysteresis, the disagreement watch on a turn, a magnet, a nudge, a flick, a field that stays swung); confidence; bearing, declination, band, smoothing.
