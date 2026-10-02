# The Qibla compass (engine v2)

Branch `feature/qibla-engine-v2`, 2026-10-01. This replaces the earlier engine on `feature/qibla-mag-truth` entirely. The code is the reference; this document is the reasoning, with every threshold and where it comes from.

## 1. The idea in one sentence

**Tilt from the platform, turning from the gyroscope, north from the magnetometer.**

- The platform's fused gravity says which way is up.
- The gyroscope, integrated in 3D, carries the phone's orientation through every turn.
- The magnetometer only ever estimates a single, slowly varying angle: where magnetic north lies in the gyroscope's frame.

No platform yaw ever reaches the screen. Platform yaw was the source of two problems on the S24 Ultra: Android's rotation vector sat 145° off on a still desk, and CoreMotion's magnetic-north yaw is pulled by every magnet nearby.

## 2. Why the old engine misbehaved

The native source of expo-sensors 57.0.3 had several problems:

| problem | where | effect |
|---|---|---|
| On Android 12+, every stream registers at `SENSOR_DELAY_NORMAL` (~5 Hz) unless the app declares `HIGH_SAMPLING_RATE_SENSORS` | `SensorSubscription.kt` | every time constant in the old engine was off by ×4–6; a magnetometer reading up to 200 ms stale was paired with a fresh attitude, so the dip and heading were wrong whenever the phone moved |
| The magnetometer's accuracy is dropped | `SensorProxy.onAccuracyChanged = Unit` | no calibration signal on Android |
| DeviceMotion uses `TYPE_ROTATION_VECTOR` | `DeviceMotionModule.kt` | the magnet-coupled yaw that sat 145° off |
| `rotationRate` axes differ (Android alpha = x, iOS alpha = z), and `interval` is ms on Android but seconds on iOS | both modules | platform-specific conventions to pin |
| Two `CMMotionManager`s on iOS | per module | Apple says to create only one |

The "jump" detector compared raw compass steps, so a quick flick of the hand read as interference. That, together with the staleness, is what produced the false "المجال المغناطيسي مضطرب".

## 3. The native module: `modules/rafiq-motion`

A local Expo module, autolinked from `./modules`. It only streams samples; it computes nothing.

- **Delivery**: one `batch` event per frame (~16 ms).
- **Payload**: flat `[t, x, y, z]` arrays for `up`, `gyro` and `mag`, plus `magAccuracy` (0–3), `biasEpoch` and `dropped`.
- **Clock**: `t` is the sensor clock in seconds, one clock shared by all three streams.
- **Frame**: the device frame (X right edge, Y top edge, Z out of the screen).

| | Android | iOS |
|---|---|---|
| up | `TYPE_GRAVITY` (points up: +9.81 on Z face up); `TYPE_ACCELEROMETER` if absent | −`CMDeviceMotion.gravity` |
| gyro | `TYPE_GYROSCOPE`, rad/s, bias-compensated | `rotationRate`, rad/s, bias removed |
| mag | `TYPE_MAGNETIC_FIELD`, µT, calibrated, its own accuracy | `magneticField.field` (frame `xMagneticNorthZVertical`); skipped while `uncalibrated` and deduplicated (CoreMotion repeats it between readings) |
| rates | 100 / 100 / 50 Hz, `maxReportLatencyUs = 0` | 100 Hz device motion, one timestamp for all three |
| recalibration | `TYPE_MAGNETIC_FIELD_UNCALIBRATED` bias moves > 0.5 µT → `biasEpoch++` | not exposed |
| threading | listeners and flush on one `HandlerThread` | one serial `OperationQueue` |

**`HIGH_SAMPLING_RATE_SENSORS` is not needed.** Android 12's 200 Hz cap applies only to the accelerometer, gyroscope and magnetometer, and nothing here asks for more than 100 Hz. The permission only mattered as expo-sensors' switch between its fastest and its normal rate. expo-sensors is removed, and with it its `ACTIVITY_RECOGNITION` permission. `NSMotionUsageDescription` stays, from expo-location's `motionUsagePermission`. `Location.watchHeadingAsync` is no longer used: on Android it re-registered accel+mag at the normal rate, and its accuracy was whichever of the two sensors called back last.

## 4. The engine: `src/features/qibla/engine/` (pure TypeScript, React-free, tested with vitest)

### 4.1 `stream.ts`: one ordered sequence
Android's three sensors arrive as separate streams with their own small delays.

- Samples are merged by timestamp and released only up to a **watermark**: the slowest live stream's newest time, minus 20 ms.
- A stream silent for 250 ms stops holding the others back.
- Duplicates, reversals and non-finite samples are dropped.
- At equal timestamps the order is gyro → up → mag: turn, then level, then measure.

### 4.2 `orientation.ts`: the gyro-carried attitude
- **Turning**: q ← q · exp(ω̄ dt / 2) per gyro sample, with ω̄ the trapezoid mean of the interval's two rates.
- **Levelling**: each up sample pulls the tilt toward the measured up, with τ = 0.1 s. The correction is the shortest rotation between predicted and measured up; its axis is horizontal, so it **cannot turn the heading**.
- **No Euler angles**: nothing is singular upright or face down.
- **Gap**: a gyro silence > 0.1 s is a gap. What the phone turned meanwhile is unknown, and north is found again.
- **Display look-ahead**: the attitude shown is carried through gyro samples that have arrived but are still held back by the watermark (`ahead()`). The display has no merge latency: at 400°/s, 30 ms of lag would be 12°.
- **Diagnostic**: `tiltResidual` is the mean angle between predicted and measured up. It stays near 0 only if the gyroscope's axes and signs are right, which makes it a device check that no magnet can fake.

### 4.3 `northFilter.ts`: one Kalman state, θ
- **Measurement**: the field rotated into the gyro frame at its own timestamp; θ = atan2(m_x, m_y).
- **Display**: heading = azimuth(axis) − θ̂ + declination.

| parameter | value | basis |
|---|---|---|
| σ_sys | 3° | residual calibration error, correlated over seconds and dependent on tilt: what averaging cannot remove |
| update rate | 10 Hz (100 ms bins, circular mean) | correlated readings are not independent; feeding 50 Hz as independent would make the filter overconfident |
| τ | 2 s | tuning choice: long enough to average out magnetometer wander, short enough to pull a drifting gyro reference back well within a reading |
| q | σ_sys² · 0.1 s / τ² = 0.225 °²/s | follows from the two rows above |
| gyro scale error | 2 %, added as k²((Ψ+Δψ)² − Ψ²) over the turn Ψ since the last accepted update | systematic: a 360° spin is off by up to 7° in one direction, not 2 % per step independently |
| floor | √P ≥ 1° | never claim better |
| gate | \|ν\| ≤ 3√(P+R) | outlier rejection |
| seed | circular mean of the first 0.3 s, ungated | start-up and after a gap |

Measurement variance R = σ_sys² + (0.5°·tan dip)² + (0.5 µT / H)² + R_shape. The tilt and noise terms grow where the horizontal field is weak.

**Disagreement.** A rejected reading means the field changed while, per the gyroscope, the phone did not turn. θ̂ is held: the gyroscope's north is kept. It is let go, re-acquired from the disagreeing readings, when any of these holds:
- the new field is healthier than the one north came from by ≥ 3° of implied error, held for 0.5 s;
- the platform recalibrated within the last 2 s;
- the disagreement has lasted 8 s. By then it is the new surroundings, not a passing object.

A disagreement whose readings scatter more than max(6°, 2√R) is something moving nearby; its clock restarts.

### 4.3b Posture: north is learned where it is used
A phone magnetometer's leftover calibration error turns the measured field a few degrees differently in every posture. In the simulator, an ordinary leftover (3 µT, 3 % soft iron) reads about 3° differently upright, and a large one (8 µT) about 7°. Learned upright and used flat, north would carry that error over; past the gate, it read as "the field changed while the phone did not turn", which is the false interference seen with the phone held vertically.

- **Gate**: the magnetometer is followed and judged only in the posture the heading is used in. In flat mode that means the screen within 35° of facing up; it leaves at 45°, the same thresholds at which the dial asks to lay the phone down (one constant, `POSTURE`). Camera mode is the mirror image (in beyond 40°, out below 30°). Out of posture, the gyroscope carries the heading and nothing is learned or flagged. Opened upright, there is no heading until the phone lies flat.
- **Weight**: inside the posture, each reading carries 0.15° of extra doubt per degree of tilt from the operating posture, so passing through the half-raised postures barely moves north.
- **Measured in the simulator** (raised to 85° for 11 s, then laid flat): the heading comes back within 0.4° with an ordinary leftover. With a large one it comes back within 2.3°, settling under 1° within 3 s.

### 4.4 `fieldCheck.ts`: the shape of the field vs the WMM
A disturbance that tilts the field out of the model's dip by Δ, if its direction is otherwise random, turns it within the horizontal plane by about **Δ / cos(dip)**. A disturbance that only scales the field turns nothing. So:

- **implied heading error** e = max(0, |dip − dip_model| − 5°) / cos(dip_model). The 5° allows for tilt and calibration error in the dip itself.
- **magnitude** only costs doubt beyond ×1.25: 30° per unit of |ln ratio| beyond that, added to R, never a warning on its own.

| measured in Cairo (WMM: 44 µT, dip 45°) | e | verdict |
|---|---|---|
| desk + charging cable, 65 µT / 43° (heading was right) | 0° | not flagged |
| laptop corner, 78 µT / 61° (heading was wrong) | 15.6° | flagged |

The **interference** rules:
- Enter when e > 10° for 1 s, or the ratio is < 0.4 or > 2.0 for 1 s.
- Leave after 1.5 s of e < 7° with the ratio in 0.45–1.8.
- Always in the WMM blackout zone (H < 2 µT).

### 4.5 `calibration.ts`
"Calibrate" is the platform's own verdict, the same rule on both platforms. The verdict is Android's `TYPE_MAGNETIC_FIELD` accuracy, or CoreMotion's calibration state. Both come from the platform's running hard-iron fit, and both rise while the phone is waved in a figure-eight.

- Accuracy 0–1 held for 1 s → `calibrate`.
- Accuracy 2–3 (or unknown) → clear at once. Nothing latches.
- A phone stuck reporting low accuracy is not believed once the measured field has matched the WMM for 10 s: dip within the 5° allowance, strength within ×1.25. While the field is bent, it is believed.
- A **rise** in accuracy (and, on Android, a step of the platform's bias estimate) counts as a recalibration. North is re-taken at once from the corrected field instead of the step reading as interference. A **fall** hands nothing over: that is the platform noticing a disturbance.
- iOS sends no field at all while CoreMotion is uncalibrated. The engine still reports `calibrate` without a heading (`ready: false`), so the card appears instead of a frozen dial.

An earlier version guessed calibration from |B| varying with orientation, and it was removed after device testing. It could not tell an offset on the phone from the phone being moved past furniture (the field changes with place). It could only clear during slow in-place turns, never during the figure-eight it asked for, so it stuck on.

### 4.6 `confidence.ts`
First match wins:
1. `no-location`
2. `unavailable` (no magnetometer or no up)
3. `calibrate`
4. `interference` (shape, or a disagreement held ≥ 2 s, cleared 1 s after agreement returns)
5. `settling` (not seeded or σ > 5°, until trust is earned once)
6. `good`

### 4.7 Elsewhere in the engine
- `geodesy.ts`: the Qibla is the initial azimuth of the **geodesic on WGS84** (Vincenty). It differs from the spherical tables by up to ~0.3°. It falls back to the great circle near the Kaaba's antipode, where Vincenty does not converge. `uncertaintyDeg` = atan(position error / distance) says how little a city-level fix means inside Mecca.
- `geomag.ts`: WMM2025 (valid Nov 2024 – Nov 2029; flagged outside). Zones per the WMM report: blackout H < 2 µT, caution H < 6 µT.
- `pose.ts`: the top-edge heading hands over to the camera's as the top's horizontal reach falls from sin 20° to sin 10°, and the camera's hands over to the top's the same way. Blended, so there is no step.
- **Lock haptic**: the actuator is a magnet, so the magnetometer is ignored for 250 ms after the lock cue (`noteActuator`).
- **No gyroscope**: a tilt-compensated compass on the accelerometer.
  - The accelerometer is smoothed with τ = 0.2 s, and readings off 1 g by > 1 m/s² are rejected.
  - The heading is smoothed with τ = 0.3 s.

## 5. The hook: `useQibla.ts`
- Subscribes only while the tab is focused and the app is in front.
- Each batch goes to the engine on the JS thread. The heading goes to a shared value, eased on the UI thread over 40 ms (15 ms with reduced motion) only to hide the per-frame batches.
- A coordinates change swaps the field model without restarting the sensors. A restart creates a new engine, because the gyro frame is new.
- The lock cue is armed 0.5 s after the first `good`, so an opening never rings it.
- **Raised** (pitch above 45°, flat again below 35°): `raisedT` springs 0→1, critically damped. The dial rolls the mat up from its tassels toward the niche (`PrayerMat`, a clip plus a gradient roll), dims and draws back the ring, and shows `LayFlatCoach`: a ghost phone lying down on a floor line. The words «ضع الهاتف مستويًا» are the hint line's. Laid flat, it unrolls. No lock cue or edge bloom fires while raised.
- **Before the first heading** the dial stays at 30 % and the hint says «جارٍ تحديد الاتجاه…» (`ready`, `readyT`); with the first heading it fades in already pointing the right way.
- **The lamp, the halo and the lock cue** need the compass to be `good`. Within 3° of the Qibla on a disturbed or uncalibrated compass, nothing lights up.
- **Changes of state are eased**: the card rises in, the dial dims over 250 ms, and the pill blends its dot, fades in its words and eases its width. All of it is off under reduced motion.
- **Screen readers**: the dial and the hint carry spoken labels (`hint.ts`, with Arabic number agreement: «٣ درجات», «١٢ درجة»). `useQiblaAnnouncer` speaks a new state once it has held for 400 ms, including the lock «أنت في اتجاه القبلة». While turning, it refreshes the angle left at most every 2.5 s and only after a 10° change.
- The UI's types (`Qibla`, `QiblaValues`, `Confidence`) are unchanged apart from `Qibla.ready` and `QiblaValues.raisedT` / `readyT`. `QiblaDebug` is now the engine's diagnostics, shown on the ground band in development builds.

## 6. Tests
`npm test` runs the vitest suite: 69 tests. The engine scenarios use `engine/testing/sim.ts`, a physics simulator. It models:
- the WMM field at real coordinates;
- scripted rotations;
- a gyroscope with bias, scale error and noise;
- a magnetometer with noise and soft-iron residue;
- Android-style separate jittered streams and iOS-style shared timestamps;
- gaps, and disturbances that are world-fixed, phone-fixed or passing.

Each scenario carries a time bound: start-up, a 630° spin at 400°/s, sweeps through north, upright and face down, a minute of gyro drift, gyro gaps, the laptop corner, the desk-and-cable field, a magnet swept past, a bent floor, the blackout zone, London / Oslo / Sydney, calibration (a figure-eight clears it, a magnet that leaves never latches it, walking past furniture never triggers it, a stuck-low accuracy is overridden, an uncalibrated iPhone still gets the card), platform recalibration, the haptic spike, and the no-gyroscope fallback. Mutation runs (gyro sign flipped, shape check off, gate off, scale term off) each fail the suite.

## 7. Verify on a device (dev readout)
1. Hz: gyro ≈ 100, up ≈ 100, mag ≈ 50; 0 dropped.
2. `tilt±` stays near 0° while tilting and turning. A large value means the gyroscope convention is wrong.
3. Flat N/E/S/W against a reference: a known street line, or the sun's azimuth.
4. A fast flick in open space: no warning.
5. Laptop corner: a warning within about a second, which clears after walking away. Desk with a charging cable: no warning.

## 8. What no phone can fix
A room whose steel turns the field without changing its strength or dip is invisible to every method: ours, the platform's, Samsung's. At a sunlit window every method agreed on a heading 40° from the Sun's. The engine holds the gyroscope's north for up to 8 s when the field changes under it. It shows the warning after 2 s, then accepts the new surroundings. The sun/shadow method is the only reference there.
