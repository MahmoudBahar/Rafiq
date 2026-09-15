import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * The app's haptic vocabulary, kept deliberately small: the wheel's detents
 * and end stops, the day pager locking into place, the nav bar tabs, and the
 * fine-tune steppers.
 * Fire-and-forget, React-free and safe to call from `scheduleOnRN`. On
 * Android the system `performHapticFeedback` constants are used: expo's
 * impact styles there are 40–60 ms waveforms that read as a buzz.
 */

const native = Platform.OS === 'ios' || Platform.OS === 'android';
const android = Platform.OS === 'android';

const swallow = () => {};

function androidOr(type: Haptics.AndroidHaptics, ios: () => Promise<void>) {
  if (!native) return;
  (android ? Haptics.performAndroidHapticsAsync(type) : ios()).catch(swallow);
}

const impact = (style: Haptics.ImpactFeedbackStyle) => () => Haptics.impactAsync(style);

/** A nav bar tab or a fine-tune stepper pressed. */
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
