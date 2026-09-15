import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * The app's haptic vocabulary. Every helper is fire-and-forget, React-free and
 * safe to call from `scheduleOnRN`. On Android the crisp system constants
 * (`performHapticFeedback`) are used where they exist; expo's impact styles
 * there are 40–60 ms waveforms that read as a buzz, so they are kept for the
 * heavier moments only.
 */

let enabled = true;
/** Mirrored from `settings.haptics` by the settings provider. */
export function setHapticsEnabled(on: boolean) {
  enabled = on;
}

const native = Platform.OS === 'ios' || Platform.OS === 'android';
const android = Platform.OS === 'android';

const swallow = () => {};
const run = (p: Promise<void>) => p.catch(swallow);

function androidOr(type: Haptics.AndroidHaptics, ios: () => Promise<void>) {
  if (!enabled || !native) return;
  run(android ? Haptics.performAndroidHapticsAsync(type) : ios());
}

const impact = (style: Haptics.ImpactFeedbackStyle) => () => Haptics.impactAsync(style);

const TICK_GAP_MS = 25;
let lastTick = 0;

/** Wheel detent crossing. Throttled so a fast flick does not queue a burst. */
export function tick() {
  const t = Date.now();
  if (t - lastTick < TICK_GAP_MS) return;
  lastTick = t;
  androidOr(Haptics.AndroidHaptics.Clock_Tick, Haptics.selectionAsync);
}

/** A value changed: segment, radio, chip, stepper. */
export function select() {
  androidOr(Haptics.AndroidHaptics.Segment_Tick, Haptics.selectionAsync);
}

/** Press-in on something that opens or navigates. */
export function tap() {
  androidOr(Haptics.AndroidHaptics.Virtual_Key, impact(Haptics.ImpactFeedbackStyle.Light));
}

/** Primary action confirmed. */
export function press() {
  androidOr(Haptics.AndroidHaptics.Confirm, impact(Haptics.ImpactFeedbackStyle.Medium));
}

/** Something locked into place: the wheel landing, a day page committing. */
export function settle() {
  if (!enabled || !native) return;
  run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid));
}

/** Hit a hard edge: end of the wheel, a stepper at its limit. */
export function bump() {
  androidOr(Haptics.AndroidHaptics.Reject, impact(Haptics.ImpactFeedbackStyle.Heavy));
}

/** Quiet nudge for transient UI (coming-soon toast, tip bubble). */
export function soft() {
  androidOr(Haptics.AndroidHaptics.Context_Click, impact(Haptics.ImpactFeedbackStyle.Soft));
}

export function success() {
  if (!enabled || !native) return;
  run(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

export function error() {
  if (!enabled || !native) return;
  run(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}

/** The prayer time arrived while the app is open: two beats and a heavier third. */
export function adhan() {
  if (!enabled || !native) return;
  run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
  setTimeout(() => run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)), 140);
  setTimeout(() => run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)), 300);
}

export type HapticKind = 'tap' | 'press' | 'select' | 'none';

export function fire(kind: HapticKind) {
  if (kind === 'tap') tap();
  else if (kind === 'press') press();
  else if (kind === 'select') select();
}
