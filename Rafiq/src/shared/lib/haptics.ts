import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * The app's haptic vocabulary: three physical events (a key going down, a
 * wheel row passing, a hard stop) plus the rare outcomes. Fire-and-forget,
 * React-free and safe to call from `scheduleOnRN`. On Android the system
 * `performHapticFeedback` constants are used: expo's impact styles there are
 * 40–60 ms waveforms that read as a buzz rather than a click.
 */

const native = Platform.OS === 'ios' || Platform.OS === 'android';
const android = Platform.OS === 'android';

const swallow = () => {};
const run = (p: Promise<void>) => p.catch(swallow);

function androidOr(type: Haptics.AndroidHaptics, ios: () => Promise<void>) {
  if (!native) return;
  run(android ? Haptics.performAndroidHapticsAsync(type) : ios());
}

const impact = (style: Haptics.ImpactFeedbackStyle) => () => Haptics.impactAsync(style);

/** A key going down: any button, card, chip, segment, row or stepper. */
export function click() {
  androidOr(Haptics.AndroidHaptics.Virtual_Key, impact(Haptics.ImpactFeedbackStyle.Light));
}

const DETENT_GAP_MS = 30;
let lastDetent = 0;

/** A wheel row passing the lens, or a page locking into place. Throttled for fast flicks. */
export function detent() {
  const t = Date.now();
  if (t - lastDetent < DETENT_GAP_MS) return;
  lastDetent = t;
  androidOr(Haptics.AndroidHaptics.Keyboard_Tap, impact(Haptics.ImpactFeedbackStyle.Rigid));
}

/** A hard end: the wheel pushed past its last row, a stepper at its limit. */
export function stop() {
  androidOr(Haptics.AndroidHaptics.Long_Press, impact(Haptics.ImpactFeedbackStyle.Heavy));
}

export function success() {
  if (!native) return;
  run(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

export function error() {
  if (!native) return;
  run(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}

/** The prayer time arrived while the app is open: two beats and a heavier third. */
export function adhan() {
  if (!native) return;
  run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
  setTimeout(() => run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)), 140);
  setTimeout(() => run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)), 300);
}
