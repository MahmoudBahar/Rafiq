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
- A sample stamped more than 1 s ahead of every other stream **and** of its own stream's last sample is a glitched timestamp and is dropped. Taken, it would hold its stream's clock in the future, and every later sample would be rejected as a reversal, freezing the compass for the session. A stream resuming after a silence still passes. The engine's clock comes from the samples the merger accepted.
- At equal timestamps the order is gyro → up → mag: turn, then level, then measure.

### 4.2 `orientation.ts`: the gyro-carried attitude
- **Turning**: q ← q · exp(ω̄ dt / 2) per gyro sample, with ω̄ the trapezoid mean of the interval's two rates.
- **Levelling**: each up sample pulls the tilt toward the measured up, with τ = 0.1 s for the platform's fused gravity. The correction is the shortest rotation between predicted and measured up; its axis is horizontal, so it **cannot turn the heading**.
- **Raw accelerometer** (a phone with a gyroscope but no fused gravity): τ = 1.5 s, so the gyroscope carries the tilt through the hand's motion. A sideways sway of 2.5 m/s² barely changes |a|, so no reject rule sees it, yet with τ = 0.1 s it turned the heading by 22° in the simulator; with 1.5 s it stays under 4°. Readings off 1 g by more than 1 m/s² are also rejected. For the first second after start-up the tilt is pulled in fast whatever the source (initial alignment), so a first reading taken mid-shove washes out at once.
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
| τ | 2 s (measured: 63 % of a 5° change in ~2.4 s, under test) | tuning choice: long enough to average out magnetometer wander, short enough to pull a drifting gyro reference back well within a reading |
| q | σ_sys² · 0.1 s / τ² = 0.225 °²/s | follows from the two rows above |
| gyro scale error | 2 %, added as k²((Ψ+Δψ)² − Ψ²) over the turn Ψ since the last accepted update | systematic: a 360° spin is off by up to 7° in one direction, not 2 % per step independently |
| floor | reported σ ≥ 1° | never claim better. Only the *reported* σ is floored: flooring the filter's own variance made τ ~1.2 s instead of 2 s |
| magnetometer latency | 10 ms, as (|ω|·δ / cos dip)² added to R | a reading paired with the attitude at its timestamp while turning at ω points about ω·δ off; a fast spin no longer pulls north (after a 400°/s spin with readings 20 ms late: 3° → 0.8°) |
| gate | \|ν\| ≤ 3√(P+R) | outlier rejection |
| seed | circular mean of the first 0.3 s of readings that look like Earth's field (implied error ≤ 30°); after 3 s without such readings, whatever there is | start-up and after a gap; a phone once reported a few readings dipping −43° (upside down) just after its sensors restarted |

Measurement variance R = σ_sys² + (0.5°·tan dip)² + (0.5 µT / H)² + R_shape. The tilt and noise terms grow where the horizontal field is weak.

**Disagreement.** A rejected reading means the field changed while, per the gyroscope, the phone did not turn. θ̂ is held: the gyroscope's north is kept. It is let go, re-acquired from the disagreeing readings, when any of these holds:
- the new field is healthier than the one north came from by ≥ 3° of implied error, held for 0.5 s;
- the platform recalibrated (a sudden bias jump of ≥ 2 µT between consecutive estimates on Android, or its accuracy rising from 0–1 to 2–3), **and** the disagreement began at that recalibration (−0.1 to +0.2 s), **and** it held still for 0.3 s within 3° (a step, not something building up), **and** the step is no larger than a recalibration plausibly makes (≤ 20°), **and** the new field is no less healthy. Samsung's calibrator re-estimates while a nearby magnet is being absorbed: in the simulator, an unbounded hand-over locked in a 25° error with no warning, and a ramped disturbance slipped past the 20° bound;
- the disagreement has lasted 8 s. By then it is the new surroundings, not a passing object.

A disagreement whose readings scatter more than max(6°, 2√R) is something moving nearby; its clock restarts.

**Provisional north**: north learned from readings the platform did not vouch for (its accuracy 0–1, not overridden) is provisional. It is reported at least ±25° unsure, so it is never "steady", the dial stays faint and the lamp stays off. The first fully vouched 100 ms bin replaces it outright, however far it moves: a calibration can move north by more than any gate lets through. Without this, north learned before a figure-eight survived it, and showed a 38° error as steady.

**Doubt grows with time even when unobserved**: process noise is added on every gyro sample, not only when the magnetometer is read. Out of posture σ therefore rises honestly instead of staying at its last value.

### 4.3b Posture: north is learned where it is used
A phone magnetometer's leftover calibration error turns the measured field a few degrees differently in every posture. In the simulator, an ordinary leftover (3 µT, 3 % soft iron) reads about 3° differently upright, and a large one (8 µT) about 7°. Learned upright and used flat, north would carry that error over; past the gate, it read as "the field changed while the phone did not turn", which is the false interference seen with the phone held vertically.

- **Gate**: the magnetometer is followed and judged only in the posture the heading is used in. In flat mode that means the screen within 35° of facing up, **in any direction** (raised, tipped toward the user, on its side, face down); it leaves at 45°. The dial asks to lay the phone down by the very same measure (`EngineOutput.tiltDeg`) and thresholds (`POSTURE`), so it asks exactly when the compass stops being corrected. An earlier version asked only when the top edge was raised: held on its side, the compass silently drifted on the gyroscope. Camera mode is the mirror image (in beyond 40°, out below 30°). Out of posture, the gyroscope carries the heading and north is not learned; a disagreement in progress is set aside and judged afresh once the phone is back. The field's **shape** is still judged in every posture: it describes the room, not the heading, so walking away from a laptop with the phone held up clears the warning as it would flat. Opened upright, there is no heading until the phone lies flat.
- **Weight**: inside the posture, each reading carries 0.15° of extra doubt per degree of tilt from the operating posture, so passing through the half-raised postures barely moves north.
- **Measured in the simulator** (raised to 85° for 11 s, then laid flat): the heading comes back within 0.4° with an ordinary leftover. With a large one it comes back within 2.3°, settling under 1° within 3 s.

### 4.4 `fieldCheck.ts`: the shape of the field vs the WMM
A disturbance that tilts the field out of the model's dip by Δ, if its direction is otherwise random, turns it within the horizontal plane by about **Δ / cos(dip)**. A disturbance that only scales the field turns nothing. So:

- **implied heading error** e = max(0, |dip − dip_model| − 5°) / cos(dip_model). The 5° allows for tilt and calibration error in the dip itself.
- **size doubt** s: 30° per unit of |ln ratio| beyond ×1.25 (or below ÷1.25), added to R.
- **field doubt** = e + s. The two signs are added: each can sit under its own limit while together they say the field is not Earth's.

| measured in Cairo (WMM: 44 µT, dip 45°) | e | s | verdict |
|---|---|---|---|
| desk + charging cable, 65 µT / 43° (heading was right) | 0° | 5° | flagged by its size (×1.48) |
| laptop corner, 78 µT / 61° (heading was wrong) | 15.6° | 10° | flagged |
| weak spot by a desk, 31.8 µT / 35° (heading ~150° off) | 7.1° | 3.2° | flagged (doubt 10.2°, and 72 % strength) |

The **interference** rules:
- Enter when e + s > 10° for 1 s, or the strength is outside 75–130 % of the model for 1 s.
- Leave after 1.5 s of e + s < 7° with the strength in 80–125 %.
- The strength band was 40–200 % until 2026-10-03, when the weak spot above (heading 150° off) and the laptop corner both read "steady". A field a quarter off Earth's means something nearby adds a field of that size, which can turn the heading by tens of degrees; the desk with the cable, whose heading happened to be right, is reported too, since no measurement tells the two apart.
- Always in the WMM blackout zone (H < 2 µT).

### 4.5 `calibration.ts`
"Calibrate" is the platform's own verdict, the same rule on both platforms. The verdict is Android's `TYPE_MAGNETIC_FIELD` accuracy, or CoreMotion's calibration state. Both come from the platform's running hard-iron fit, and both rise while the phone is waved in a figure-eight.

- Accuracy 0–1 held for 1 s → `calibrate`.
- Accuracy 2–3 (or unknown) → clear at once. Nothing latches.
- A phone stuck reporting low accuracy is not believed once the measured field has matched the WMM for 10 s: dip within the 5° allowance, strength within ×1.25. While the field is bent, it is believed.
- A **rise** in accuracy from 0–1 to 2–3 retakes north from the corrected field (provisional north, §4.3), instead of the step reading as interference. A **fall**, or a flap between 2 and 3, hands nothing over: that is the platform noticing a disturbance.
- iOS sends no field at all while CoreMotion is uncalibrated. The engine still reports `calibrate` without a heading (`ready: false`), so the card appears instead of a frozen dial.

An earlier version guessed calibration from |B| varying with orientation, and it was removed after device testing. It could not tell an offset on the phone from the phone being moved past furniture (the field changes with place). It could only clear during slow in-place turns, never during the figure-eight it asked for, so it stuck on.

### 4.6 `confidence.ts`
First match wins:
1. `no-location`
2. `unavailable` (no magnetometer or no up)
3. `calibrate`
4. `interference` (shape, or a disagreement held ≥ 2 s, cleared 1 s after agreement returns)
5. `settling`: north not found (at start, or being found again after a gyro gap, whatever trust was earned before), or σ > 5° until trust is earned once
6. `good`

### 4.7 Elsewhere in the engine
- `geodesy.ts`: the Qibla is the initial azimuth of the **geodesic on WGS84** (Vincenty). It differs from the spherical tables by up to ~0.3°. It falls back to the great circle near the Kaaba's antipode, where Vincenty does not converge. `uncertaintyDeg` = atan(position error / distance) says how little a city-level fix means inside Mecca. The screen does not use it yet.
- `geomag.ts`: WMM2025 (valid Nov 2024 – Nov 2029; flagged outside). Zones per the WMM report: blackout H < 2 µT, caution H < 6 µT.
- `pose.ts`: the top-edge heading hands over to the camera's as the top's horizontal reach falls from sin 20° to sin 10°, and the camera's hands over to the top's the same way. Blended, so there is no step.
- **Lock haptic**: the actuator is a magnet, so the magnetometer is ignored for 250 ms after the lock cue (`noteActuator`).
- **No gyroscope**: a tilt-compensated compass on the accelerometer.
  - The accelerometer is smoothed with τ = 0.2 s, and readings off 1 g by > 1 m/s² are rejected.
  - The heading is smoothed with τ = 0.3 s.

## 5. The hook: `useQibla.ts`
- Subscribes only while the tab is focused and the app is in front.
- Each batch goes to the engine on the JS thread. The heading goes to a shared value, eased on the UI thread over 40 ms (15 ms with reduced motion) only to hide the per-frame batches.
- A coordinates change swaps the field model without restarting the sensors, and keeps what the field watches have seen: a warning on screen does not blink off with each location update. Only a change of WMM zone starts the shape watch over. A restart creates a new engine, because the gyro frame is new.
- **Watchdog**: if no batch arrives for 1 s while the sensors should be running (the developer "Sensors off" tile, a sensor service restarting, CoreMotion stopping), the heading is dropped: faint dial, «جارٍ الضبط», band reset. The sensors are restarted at most every 5 s. When samples return, the engine sees a gyro gap and finds north again.
- The sensors stop only when the tab loses focus or the app goes to the background. iOS's brief "inactive" (notification shade, app switcher, the location prompt) keeps them running.
- **Fresh props after the background**: Reanimated 4.5 copies settled animated values back into React every 500 ms. Backgrounded mid-animation, a view could come back drawn from a stale copy: the lamp stayed lit with its value at 0, and the pill kept the previous state's width. Each time the sensors start, a `repaint` value is nudged for a few frames (`repaint.ts`). Every style a background trip can leave stale (lamp, halo, edge glow, mat roll, dial dimming, the lay-flat ghost's fade) adds a millionth of it, so its values really change and fresh props reach the same views. An earlier version rebuilt the views instead: device logs showed Reanimated updating the deleted views for about a second after each trip to the background (~650 exceptions, frames of ~0.9 s). The pill also keeps its state while the sensors are off, and clips its words while its width animates.
- The lock cue is armed 0.5 s after the first `good`, so an opening never rings it.
- **Raised** (the screen tilted more than 45° in any direction, flat again below 35°; reported from the first reading, before north is known): `raisedT` springs 0→1, critically damped. The dial rolls the mat up from its tassels toward the niche (`PrayerMat`, a clip plus a gradient roll), dims and draws back the ring, and shows `LayFlatCoach`: a ghost phone lying down on a floor line. The scene is turned upright in the room (the app is portrait-locked, so held sideways the whole screen is turned) and the ghost stands the way the phone is held: upright, on its long edge, or upside down when tipped toward the user (`EngineOutput.edgeUpDeg`). Like a phone's screen rotation it snaps to those four positions (`snapQuarter`): it holds still through the hand's wobble and turns, once and by a quarter in 0.3 s, only when the phone is more than 20° past the halfway point into another position. Face down has no demonstration, since the screen cannot be seen. The words «ضع الهاتف مستويًا» are the hint line's. Laid flat, it unrolls. No lock cue or edge bloom fires while raised.
- **Before the first heading** the hint says «جارٍ تحديد الاتجاه…» (`ready`). The dial stays at 30 % until north is known to within ±20° (`readyT`), then fades in already pointing the right way. When north has to be found again after a gyro gap, both go back: the last heading is not shown as current.
- **The lamp, the halo and the lock cue** need the compass to be `good`. Within 3° of the Qibla on a disturbed or uncalibrated compass, nothing lights up.
- **Layout**: no ground band. The location line («من موقعك الحالي … · تحديد موقعي») sits under the bearing as a third line of the hint. A card (calibrate, interference, no location, no compass) floats above the tab bar only while it is needed, and the dial and hint move up to make room (measured, eased over 260 ms). The dev readout floats in a small panel in the same place, in development builds only. Chosen from a five-option prototype (https://claude.ai/artifact/7z6LPZgmBnZzWQDvLadX5d): the band had covered ~30% of the screen to hold one line.
- **Changes of state are eased**: the card rises in, the dial dims over 250 ms, and the pill blends its dot, fades in its words and eases its width. All of it is off under reduced motion.
- **Screen readers**: the dial and the hint carry spoken labels (`hint.ts`, with Arabic number agreement: «٣ درجات», «١٢ درجة»). `useQiblaAnnouncer` speaks a new state once it has held for 400 ms, including the lock «أنت في اتجاه القبلة». While turning, it refreshes the angle left at most every 2.5 s and only after a 10° change.
- The UI's types (`Qibla`, `QiblaValues`, `Confidence`) are unchanged apart from `Qibla.ready` and `QiblaValues.raisedT` / `readyT`. `QiblaDebug` is now the engine's diagnostics, shown on the ground band in development builds.

## 6. Tests
`npm test` runs the vitest suite: 98 tests. The engine scenarios use `engine/testing/sim.ts`, a physics simulator. It models:
- the WMM field at real coordinates;
- scripted rotations;
- a gyroscope with bias, scale error and noise;
- a magnetometer with noise and soft-iron residue;
- Android-style separate jittered streams and iOS-style shared timestamps;
- gaps, and disturbances that are world-fixed, phone-fixed or passing.

Each scenario carries a time bound: start-up, a 630° spin at 400°/s, sweeps through north, upright and face down, a minute of gyro drift, gyro gaps, the laptop corner, the desk-and-cable field, a magnet swept past, a bent floor, the blackout zone, London / Oslo / Sydney, calibration (a figure-eight clears it, a stuck-low accuracy is overridden, an uncalibrated iPhone still gets the card), platform recalibration, a recalibration or a flapping accuracy during a bent field (nothing handed over), a location update during a warning, confidence while north is found again after a gap, an upside-down field at start-up, posture in any direction (on its side, face down) with σ growing while unobserved, hand acceleration on a raw accelerometer, the haptic spike, and the no-gyroscope fallback. Mutation runs (gyro sign flipped, shape check off, gate off, scale term off, the seeding check off, and each fix of the architecture review undone) each fail the suite.

## 7. Verify on a device (dev readout)
1. Hz: gyro ≈ 100, up ≈ 100, mag ≈ 50; 0 dropped.
2. `tilt±` stays near 0° while tilting and turning. A large value means the gyroscope convention is wrong.
3. Flat N/E/S/W against a reference: a known street line, or the sun's azimuth.
4. A fast flick in open space: no warning.
5. Laptop corner: a warning within about a second, which clears after walking away. Desk with a charging cable: no warning.

## 8. What no phone can fix
A room whose steel turns the field without changing its strength or dip is invisible to every method: ours, the platform's, Samsung's. At a sunlit window every method agreed on a heading 40° from the Sun's. The engine holds the gyroscope's north for up to 8 s when the field changes under it. It shows the warning after 2 s, then accepts the new surroundings. The sun/shadow method is the only reference there.
