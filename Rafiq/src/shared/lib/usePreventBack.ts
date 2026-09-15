// expo-router does not re-export `usePreventRemove` from its bundled
// react-navigation fork; this is the only file allowed to deep-import it.
// Fallback if the path ever breaks on upgrade: `useNavigation().addListener('beforeRemove', …)`
// with `e.preventDefault()` plus `BackHandler.addEventListener('hardwareBackPress', …)`
// (that combination cannot stop the iOS edge-swipe pop, this hook can).
import { usePreventRemove } from 'expo-router/build/react-navigation/core/usePreventRemove';

/**
 * While `active`, the hardware/system back (Android) and the edge-swipe pop
 * (iOS) call `onBack` instead of popping the current screen.
 */
export function usePreventBack(active: boolean, onBack: () => void): void {
  usePreventRemove(active, onBack);
}
