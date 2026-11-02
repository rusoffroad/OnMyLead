import { swipeResult } from './panel-swipe';

/**
 * Full Map: every map screen (Ride Mode, Navigate, the route builder, waypoints, Find a Ride)
 * can tuck its bars and panels away so the map fills the screen. One small bar stays at the
 * bottom with the one button that brings everything back, plus whatever must never hide on that
 * screen (Emergency in Ride Mode, Center on Me, the route's miles and Undo while drawing).
 */

/** The words on the bring-back button. Every screen says the same thing, so riders learn it once. */
export const RESTORE_LABEL = 'Controls';

/** What a screen reader says for the bring-back button; `waiting` counts alerts tucked away behind it. */
export function restoreA11yLabel(waiting = 0): string {
  if (waiting > 0) return `Show the controls and ${waiting} ${waiting === 1 ? 'alert' : 'alerts'} waiting`;
  return 'Show the controls';
}

/** A swipe up on the Full Map bar brings the controls back, like opening a folded panel. */
export function swipeRestores(dy: number, vy: number): boolean {
  return swipeResult(false, dy, vy) === 'open';
}

/**
 * Room to keep clear when the map frames a route or a group in Full Map, in points: just the
 * safe areas and the bar at the bottom. [top, right, bottom, left], like the map components take.
 */
export function fullMapPadding(insetTop: number, insetBottom: number, barH = FULL_MAP_BAR_H): [number, number, number, number] {
  return [insetTop + 24, 24, insetBottom + barH + 24, 24];
}

/** How tall the Full Map bar is, without the bottom safe area. */
export const FULL_MAP_BAR_H = 56;

/** On the website (and a tablet with a keyboard), Esc leaves Full Map and F enters it. */
export function fullMapKey(key: string, full: boolean, typing: boolean): 'enter' | 'exit' | null {
  if (typing) return null;
  if (key === 'Escape' && full) return 'exit';
  if ((key === 'f' || key === 'F') && !full) return 'enter';
  return null;
}
