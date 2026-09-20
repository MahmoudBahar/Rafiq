/**
 * Timing shared by the tab bar's pill and the tab pages, so the page slides
 * for exactly as long as the pill travels.
 */
const TAB_BASE_MS = 340;
const TAB_PER_TAB_MS = 50;

/** How long the pill takes to travel `distance` tabs. Also called from the bar's UI-thread code. */
export function tabTravelMs(distance: number): number {
  'worklet';
  return TAB_BASE_MS + TAB_PER_TAB_MS * Math.max(1, distance);
}
