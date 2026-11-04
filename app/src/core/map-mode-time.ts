import { tc } from './i18n';

/**
 * Map Mode time on Free (2.0): a number of free hours each UTC month, counted only while Map Mode
 * is on screen and the rider isn't on a group ride (Ride Mode and following the leader are always
 * unlimited). The server keeps the total (my_map_mode_time / log_map_mode_time in migration
 * 20261104000000_pro_tiers.sql); these are the rules the screen shares. Pure, so it's unit tested.
 */

/** The server's answer. allowanceSeconds null = unlimited (Pro, or the server has no limit). */
export type MapModeTime = { usedSeconds: number; allowanceSeconds: number | null; resetsAt: string | null };

/** No server answer yet, or an older server: nothing is limited. */
export const UNLIMITED_MAP_TIME: MapModeTime = { usedSeconds: 0, allowanceSeconds: null, resetsAt: null };

/** How often the screen reports time in Map Mode, in seconds (the server accepts up to 120 a call). */
export const MAP_TIME_TICK_S = 60;

export function parseMapModeTime(raw: unknown): MapModeTime {
  if (!raw || typeof raw !== 'object') return UNLIMITED_MAP_TIME;
  const r = raw as Record<string, unknown>;
  const used = typeof r.used_seconds === 'number' && Number.isFinite(r.used_seconds) ? Math.max(0, r.used_seconds) : 0;
  const allowance = typeof r.allowance_seconds === 'number' && Number.isFinite(r.allowance_seconds) ? Math.max(0, r.allowance_seconds) : null;
  return { usedSeconds: used, allowanceSeconds: allowance, resetsAt: typeof r.resets_at === 'string' ? r.resets_at : null };
}

/** Seconds left this month, or null when unlimited. `extra` is time counted on the phone since the last answer. */
export function mapSecondsLeft(t: MapModeTime, extra = 0): number | null {
  if (t.allowanceSeconds == null) return null;
  return Math.max(0, t.allowanceSeconds - t.usedSeconds - Math.max(0, extra));
}

/** True when a Free rider has used this month's Map Mode time. */
export const mapTimeUsedUp = (t: MapModeTime, extra = 0) => mapSecondsLeft(t, extra) === 0;

/** Whether the clock runs right now: Map Mode on screen, the app in front, and not on a group ride. */
export const mapClockRuns = (s: { onScreen: boolean; appActive: boolean; onGroupRide: boolean }) =>
  s.onScreen && s.appActive && !s.onGroupRide;

/** "5 h 20 m Left This Month", "45 m Left This Month", "No Time Left This Month", or null when unlimited. */
export function mapTimeLeftText(left: number | null): string | null {
  if (left == null) return null;
  if (left <= 0) return tc('No Map Mode Time Left This Month');
  const mins = Math.ceil(left / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const parts = [h ? `${h} h` : null, m || !h ? `${m} m` : null].filter(Boolean).join(' ');
  return tc('{parts} Left This Month', { parts });
}
