/** How far a rider must drag (points) or how fast (points per ms) for a swipe to fold or open a panel. */
export const SWIPE_DISTANCE = 40;
export const SWIPE_VELOCITY = 0.5;

/** True once a touch has moved enough, mostly up or down, to count as a swipe rather than a tap or scroll sideways. */
export function isVerticalSwipe(dx: number, dy: number): boolean {
  return Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx) * 1.5;
}

/** What letting go after a drag should do: fold on a swipe down, open on a swipe up, otherwise nothing. */
export function swipeResult(open: boolean, dy: number, vy: number): 'fold' | 'open' | null {
  if (open && (dy > SWIPE_DISTANCE || vy > SWIPE_VELOCITY)) return 'fold';
  if (!open && (dy < -SWIPE_DISTANCE || vy < -SWIPE_VELOCITY)) return 'open';
  return null;
}
