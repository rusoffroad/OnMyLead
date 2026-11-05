/**
 * The two round controls in the top corners of every riding map (2.1, build 10): Map Settings on the left
 * and the compass on the right, level with each other. While a screen's top bar is showing they
 * sit just under it; in Full Map they move up to the top of the screen. Screens say where the
 * corner row is (`top`, in screen points from the top of the screen), and this works out the
 * native compass's margins from it.
 */

/** The Map Settings button's size. The compass (about 40 points) is centred on the same line. */
export const CORNER_BUTTON = 46;
/** How far the compass's top sits below the button's top, so their centres line up. */
export const COMPASS_DROP = 3;
/** The gap from the screen's side to the corner controls. */
export const CORNER_GAP = 12;

export type CompassSpot = { top: number; right?: number };
export type Insets = { top: number; right: number };

/**
 * The compass's margins for Mapbox's `compassPosition`. iPhone and iPad measure the ornament from
 * the safe area (mapbox-maps-ios OrnamentsManager pins it to the superview's safeAreaLayoutGuide);
 * Android measures from the map's own edges, so the status bar and notch are added there. `spot`
 * is in screen points and assumes the map fills the screen from its top-left corner.
 */
export function compassMargins(spot: CompassSpot | null, insets: Insets, os: string): { top: number; right: number } {
  if (!spot) return { top: 8, right: 8 };
  const right = (spot.right ?? CORNER_GAP) + COMPASS_DROP;
  const top = spot.top + COMPASS_DROP;
  if (os === 'ios') return { top: Math.max(0, Math.round(top - insets.top)), right: Math.round(right) };
  return { top: Math.round(top), right: Math.round(right + insets.right) };
}
