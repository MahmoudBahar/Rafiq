/**
 * A value an animated style reads so it can be made to push its props again.
 *
 * Reanimated 4.5 copies settled animated values back into React every 500 ms
 * (FORCE_REACT_RENDER_FOR_SETTLED_ANIMATIONS, on by default). Sent to the
 * background in the middle of an animation, a view could come back drawn from
 * a stale copy while its shared value had long moved on (the lamp stayed lit at
 * 0; nothing redrew it, as the value never changed again). Rebuilding the
 * views on each trip fixed that but left Reanimated updating the deleted views
 * for about a second: ~650 exceptions and frames of ~0.9 s.
 *
 * Instead, `repaint` is nudged for a few frames when the sensors start, and each
 * style that can go stale adds a millionth of it to its values: the values
 * really change, so fresh props reach the same views, and the offset is far
 * below anything drawn.
 */
export function repainted(value: number, repaint: number): number {
  'worklet';
  return value + repaint * 1e-6;
}
