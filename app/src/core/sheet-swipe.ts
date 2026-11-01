/**
 * Swipe down to close a sheet (a menu or form that slides up over the map or a page).
 * The numbers are in points and points per second, the units the gesture reports.
 */

/** A drag at least this far down closes the sheet when the finger lifts. */
export const SHEET_CLOSE_DISTANCE = 90;
/** A flick down this fast closes it too, once it has moved a little. */
export const SHEET_CLOSE_VELOCITY = 700;
const FLICK_MIN_DISTANCE = 16;

/**
 * How far down the sheet should sit while the finger drags. `origin` is how far the finger had
 * already moved when the sheet's list got back to its top: before that the drag scrolls the list,
 * after it the drag pulls the sheet. Never above where it opened.
 */
export function sheetDrag(translationY: number, origin: number): number {
  return Math.max(0, translationY - origin);
}

/** What letting go should do: close on a long enough or fast enough pull down, otherwise spring back. */
export function sheetRelease(drag: number, velocityY: number): 'close' | 'stay' {
  if (drag >= SHEET_CLOSE_DISTANCE) return 'close';
  if (drag >= FLICK_MIN_DISTANCE && velocityY >= SHEET_CLOSE_VELOCITY) return 'close';
  return 'stay';
}

/**
 * Whether a pull down should move the sheet right now: never while the keyboard is up (that drag
 * puts the keyboard away first), and inside the sheet's list only once the list is at its top.
 */
export function sheetCanPull({ keyboardUp, inList, listY }: { keyboardUp: boolean; inList: boolean; listY: number }): boolean {
  if (keyboardUp) return false;
  return !inList || listY <= 0;
}
