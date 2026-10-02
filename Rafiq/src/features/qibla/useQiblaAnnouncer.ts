import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { hintFor } from './hint';
import type { Qibla } from './useQibla';

/** A new state is spoken once it has held this long, so a flicker at a threshold is never read out. */
const SETTLE_MS = 400;
/** While turning, the remaining angle is refreshed at most this often… */
const TURN_EVERY_MS = 2500;
/** …and only once it has changed by this much, or the side has flipped. */
const TURN_STEP_DEG = 10;

/** Whether a screen reader (TalkBack, VoiceOver) is running, kept live. */
function useScreenReader(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isScreenReaderEnabled().then(
      (v) => alive && setOn(v),
      () => {},
    );
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setOn);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return on;
}

/**
 * The Qibla for someone who cannot see the dial. With a screen reader on, the
 * hint is spoken when the state changes (a card appears, the phone is raised,
 * the lock is reached: «أنت في اتجاه القبلة»), and while turning the angle left
 * is refreshed every few seconds rather than at every degree.
 */
export function useQiblaAnnouncer(qibla: Qibla, active: boolean) {
  const reader = useScreenReader();
  const hint = hintFor(qibla);
  const state = `${qibla.confidence}|${qibla.raised}|${qibla.ready}|${hint.locked}|${qibla.band === 'locked'}`;
  const spoken = useRef({ state: '', at: 0, deg: -1, right: true });

  // A change of state: spoken once it has held.
  useEffect(() => {
    if (!reader || !active || state === spoken.current.state) return;
    const timer = setTimeout(() => {
      AccessibilityInfo.announceForAccessibility(hint.spoken);
      spoken.current = { state, at: Date.now(), deg: qibla.turnDeg, right: qibla.turnRight };
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [reader, active, state, hint.spoken, qibla.turnDeg, qibla.turnRight]);

  // Turning within a state: the angle left, now and then.
  useEffect(() => {
    if (!reader || !active || state !== spoken.current.state || hint.locked || !qibla.ready) return;
    const last = spoken.current;
    if (Math.abs(qibla.turnDeg - last.deg) < TURN_STEP_DEG && qibla.turnRight === last.right) return;
    const wait = Math.max(0, last.at + TURN_EVERY_MS - Date.now());
    const timer = setTimeout(() => {
      AccessibilityInfo.announceForAccessibility(hint.spoken);
      spoken.current = { state, at: Date.now(), deg: qibla.turnDeg, right: qibla.turnRight };
    }, wait);
    return () => clearTimeout(timer);
  }, [reader, active, state, hint.spoken, hint.locked, qibla.ready, qibla.turnDeg, qibla.turnRight]);
}
