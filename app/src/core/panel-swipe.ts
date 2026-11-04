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

/** True once a touch has moved enough, mostly left or right, to count as a swipe on a side panel. */
export function isHorizontalSwipe(dx: number, dy: number): boolean {
  return Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.5;
}

/**
 * Which way a panel folds: down (a sheet at the bottom of the screen), up (a panel hanging from
 * the top, beside the map on a tablet) or left (a sidebar on the left edge).
 */
export type FoldDirection = 'down' | 'up' | 'left';

/** swipeResult for a panel that folds in `direction`: the drag is measured along the way it folds. */
export function swipeResultToward(direction: FoldDirection, open: boolean, dx: number, dy: number, vx: number, vy: number) {
  if (direction === 'left') return swipeResult(open, -dx, -vx);
  if (direction === 'up') return swipeResult(open, -dy, -vy);
  return swipeResult(open, dy, vy);
}

/** A swipe this long (points) or fast (points per ms) the way a panel folds goes straight to Full Map. */
export const FULL_SWIPE_DISTANCE = 150;
export const FULL_SWIPE_VELOCITY = 1.6;

/**
 * What letting go does on a panel that can also enter Full Map (core/full-map): an ordinary swipe
 * the way it folds folds it, a long or fast one (or any such swipe on a panel already folded)
 * hides everything for the full-screen map, leaving the small Full Map bar to swipe back up.
 * Sidebars (folding left) never enter Full Map.
 */
export function swipeAction(direction: FoldDirection, open: boolean, dx: number, dy: number, vx: number, vy: number): 'fold' | 'open' | 'full' | null {
  const result = swipeResultToward(direction, open, dx, dy, vx, vy);
  if (direction === 'left') return result;
  const along = direction === 'up' ? -dy : dy;
  const speed = direction === 'up' ? -vy : vy;
  if (open && (along > FULL_SWIPE_DISTANCE || speed > FULL_SWIPE_VELOCITY)) return 'full';
  if (!open && swipeResultToward(direction, true, dx, dy, vx, vy) === 'fold') return 'full';
  return result;
}
