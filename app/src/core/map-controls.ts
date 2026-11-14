/**
 * The floating controls over the Ride Mode map on a phone (3.1): one grid above the bottom panel
 * instead of buttons at odd heights. Every control is CONTROL_H tall, rows are CONTROL_GAP apart,
 * and each control keeps the same spot whatever else is showing:
 *
 *   row 3 (right)            Music
 *   row 2 (left / right)     Tilt          Follow Me  Center on Me
 *   row 1 (two equal halves) Directions | Add Waypoint
 *   ───────────────────────  the panel
 *
 * A row shows only when it fits under the top bar and banners; the rows above it then drop down.
 * All numbers are in screen points measured from the bottom of the screen.
 */

/** Height of every floating map control (pills and round buttons alike). */
export const CONTROL_H = 48;
/** Space between rows, between neighbours in a row, and between row 1 and the panel. */
export const CONTROL_GAP = 8;
/** Space between the screen's sides and the controls. */
export const CONTROL_SIDE = 12;
/**
 * Below this screen width, Tilt and a labelled Follow Me don't both fit beside Center on Me, so
 * Follow Me shows its icon alone (the blue outline still says Paused).
 */
export const FOLLOW_LABEL_MIN_WIDTH = 400;

export type PhoneControlsInput = {
  /** Screen height. */
  screenH: number;
  /** Screen width. */
  screenW: number;
  /** Where the panel's top edge is, from the bottom of the screen. */
  panelTop: number;
  /** The lowest point the controls may reach up to, from the top of the screen (under the banners). */
  ceiling: number;
  /** Directions and/or Add Waypoint have something to show. */
  actions: boolean;
  /** Center on Me (and Follow Me) can work on this device. */
  locate: boolean;
  /** The Tilt tile is turned on. */
  tilt: boolean;
  /** Music controls are turned on. */
  music: boolean;
};

export type PhoneControls = {
  /** Bottom of row 1 (Directions, Add Waypoint), or null when hidden. */
  actionsBottom: number | null;
  /** Bottom of row 2 (Center on Me, Follow Me), or null when hidden. */
  locateBottom: number | null;
  /** Bottom of the Tilt tile (row 2, left), or null when hidden. */
  tiltBottom: number | null;
  /** Bottom of Music (row 3, right), or null when hidden. */
  musicBottom: number | null;
  /** Follow Me shows its icon only. */
  followCompact: boolean;
};

/** Where each floating control goes on a phone. */
export function phoneControls(i: PhoneControlsInput): PhoneControls {
  const fits = (bottom: number) => i.screenH - bottom - CONTROL_H >= i.ceiling;
  let next = i.panelTop + CONTROL_GAP;
  const take = (wanted: boolean) => {
    if (!wanted || !fits(next)) return null;
    const at = next;
    next += CONTROL_H + CONTROL_GAP;
    return at;
  };
  const actionsBottom = take(i.actions);
  const row2 = take(i.locate || i.tilt);
  const locateBottom = i.locate ? row2 : null;
  const tiltBottom = i.tilt ? row2 : null;
  // Music sits over Center on Me, so it needs that column.
  const musicBottom = row2 != null && i.locate ? take(i.music) : null;
  return {
    actionsBottom,
    locateBottom,
    tiltBottom,
    musicBottom,
    followCompact: tiltBottom != null && i.screenW < FOLLOW_LABEL_MIN_WIDTH,
  };
}

/** The width of each half of row 1 when both Directions and Add Waypoint show. */
export function actionHalfWidth(screenW: number): number {
  return Math.floor((screenW - 2 * CONTROL_SIDE - CONTROL_GAP) / 2);
}
