/**
 * The route builder's time estimate: the rider types the average speed they expect to hold and
 * the builder shows how long the route takes at that speed. Moving time only: it knows nothing
 * about the terrain, stops, regroups, fuel or the slowest rig, so the screen says so beside it.
 *
 * Pure, so it is tested without a phone.
 */
import { formatDuration } from './summary';

/** Slowest and fastest average speed the box takes, in mph. */
export const ETA_MIN_MPH = 1;
export const ETA_MAX_MPH = 99;
/** Meters per second in one mph. */
const MPS_PER_MPH = 0.44704;

/**
 * What the rider typed, as mph, or null when it isn't a speed the estimate can use yet (empty,
 * 0, not a number, or past ETA_MAX_MPH). A comma counts as a decimal point.
 */
export function parseSpeed(text: string | null | undefined): number | null {
  const s = (text ?? '').trim().replace(',', '.');
  if (!/^\d{1,3}(\.\d*)?$|^\.\d+$/.test(s)) return null;
  const mph = Number(s);
  if (!Number.isFinite(mph) || mph < ETA_MIN_MPH || mph > ETA_MAX_MPH) return null;
  return mph;
}

/** Keeps only what a speed box should hold: digits and one decimal point, at most 4 characters. */
export function cleanSpeedText(text: string): string {
  let seen = false;
  let out = '';
  for (const ch of text.replace(',', '.')) {
    if (ch >= '0' && ch <= '9') out += ch;
    else if (ch === '.' && !seen) {
      seen = true;
      out += ch;
    }
  }
  return out.slice(0, 4);
}

/** Seconds to cover lengthM at mph, or null without a route or a usable speed. */
export function etaSeconds(lengthM: number | null | undefined, mph: number | null): number | null {
  if (!mph || !lengthM || !Number.isFinite(lengthM) || lengthM <= 0) return null;
  return lengthM / (mph * MPS_PER_MPH);
}

/** "2 h 05 min", "45 min"; anything under a minute shows as "1 min", not "0 min". Null with nothing to show. */
export function formatEta(lengthM: number | null | undefined, mph: number | null): string | null {
  const sec = etaSeconds(lengthM, mph);
  if (sec == null) return null;
  return formatDuration(Math.max(60, sec));
}

/** Room kept above the route panel for the bar with the ride's name, under the status bar. */
export const PANEL_TOP_ROOM = 64;

/**
 * How far the route builder's panel rides up while the speed box has the keyboard open: enough to
 * clear the keyboard, but never so far that the panel's top goes past the bar with the ride's name
 * and the status bar (a tall panel on a phone would otherwise slide under the clock). If the panel
 * can't clear the keyboard, the keyboard covers its bottom (the buttons under the speed box).
 *
 * bottomGap is the panel's own distance from the screen's bottom edge (12 for the tablet's floating
 * card, 0 on a phone), and bottomInset the safe area the phone panel already pads for.
 */
export function panelLift(o: { keyboard: number; panelH: number; windowH: number; topInset: number; bottomInset: number; bottomGap: number }): number {
  if (o.keyboard <= 0) return 0;
  const wanted = Math.max(0, o.keyboard - (o.bottomGap ? 0 : o.bottomInset));
  if (!o.panelH) return wanted;
  const room = o.windowH - o.panelH - o.bottomGap - (o.topInset + PANEL_TOP_ROOM);
  return Math.max(0, Math.min(wanted, room));
}
