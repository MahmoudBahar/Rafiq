import { usePreventRemove } from 'expo-router';

/**
 * While `active`, the hardware/system back (Android) and the edge-swipe pop
 * (iOS) call `onBack` instead of popping the current screen.
 */
export function usePreventBack(active: boolean, onBack: () => void): void {
  usePreventRemove(active, () => onBack());
}
