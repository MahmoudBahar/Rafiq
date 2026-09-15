import { I18nManager, type ViewStyle } from 'react-native';

/**
 * Absolute horizontal position by PHYSICAL left edge. React Native swaps
 * `left`/`right` under RTL (doLeftAndRightSwapInRTL), so maths done in
 * screen coordinates must be written as `right` when the layout is RTL.
 */
export const physicalLeft = (px: number): Pick<ViewStyle, 'left' | 'right'> =>
  I18nManager.isRTL ? { right: px } : { left: px };
