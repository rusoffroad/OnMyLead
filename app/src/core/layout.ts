/**
 * Phone and tablet layouts, decided by the size of the app's window (not the device model), so
 * iPad Split View, Slide Over, Stage Manager, Android split screen, freeform windows and foldables
 * all get the layout that fits. The breakpoints are Android's window size classes; iPad uses the
 * same ones so the two tablets behave alike (docs/development-standards.md, section 2).
 */

/** At this window width and up, a screen gets two panes where they help. */
export const MEDIUM_MIN = 600;
/** At this window width and up, maps fill the screen with panels beside them, and lists sit beside their detail. */
export const EXPANDED_MIN = 840;

export type WidthClass = 'compact' | 'medium' | 'expanded';

/** Compact (phones, Slide Over), Medium (small tablets in portrait, split view) or Expanded (tablets in landscape, big iPads). */
export function widthClass(width: number): WidthClass {
  if (width >= EXPANDED_MIN) return 'expanded';
  if (width >= MEDIUM_MIN) return 'medium';
  return 'compact';
}

/**
 * A tablet-sized screen (its shorter side is at least 600), whatever the window is doing right now.
 * Phones stay upright; tablets turn either way.
 */
export function isTabletScreen(screenWidth: number, screenHeight: number): boolean {
  return Math.min(screenWidth, screenHeight) >= MEDIUM_MIN;
}

/** Forms and reading text never stretch past this; wider screens center them or use two columns. */
export const READABLE_WIDTH = 640;

/** How wide a panel over a map is beside the map (Ride Mode controls, route tools): never more than 44% of the window. */
export function mapPanelWidth(width: number): number {
  return Math.floor(Math.min(width >= EXPANDED_MIN ? 420 : 380, width * 0.44));
}

/**
 * How wide the riders sidebar in Ride Mode is. On a Medium window it shares the screen with the
 * controls panel, so it is narrower; together they always leave at least a fifth of the map clear.
 */
export function sidebarWidth(width: number): number {
  const wanted = width >= EXPANDED_MIN ? 320 : 280;
  const room = width - mapPanelWidth(width) - width * 0.2;
  return Math.round(Math.max(200, Math.min(wanted, room)));
}

/** How wide the side column of a two-pane screen (ride details, Find a Ride's list) is. */
export function sideColumnWidth(width: number): number {
  return Math.round(Math.max(340, Math.min(460, width * 0.4)));
}
