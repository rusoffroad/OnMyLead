/**
 * App usage counts for the owner's Admin Dashboard (migration 20261115100000_rider_usage): how
 * often a rider opens the app and how long it is in front, and the same for Map Mode and Ride
 * Mode. Counts and seconds only, never a location. Pure rules here; lib/usage.ts runs them.
 *
 * A clock runs while its screen (or, for `app`, the app) is in front. Coming back within
 * NEW_SESSION_GAP_MS continues the same session, so a quick look at a text isn't a second open.
 */

export type UsageKind = 'app' | 'map_mode' | 'ride_mode';
export const USAGE_KINDS: UsageKind[] = ['app', 'map_mode', 'ride_mode'];
export type UsageDevice = 'iphone' | 'ipad' | 'android' | 'web' | 'other';

/** How often a running clock reports, in seconds. */
export const USAGE_TICK_S = 60;
/** Back within this long counts as the same session. */
export const NEW_SESSION_GAP_MS = 5 * 60_000;
/** The server takes at most this much per call (log_app_usage). */
export const MAX_SEND_SECONDS = 300;
export const MAX_SEND_SESSIONS = 5;
/**
 * One stretch between ticks never counts more than this: if the phone froze the app without saying
 * it went to the background, the gap isn't counted as use.
 */
export const MAX_STRETCH_MS = 3 * USAGE_TICK_S * 1000;

export type UsageClock = {
  /** When the current stretch started (ms), or null while stopped. */
  since: number | null;
  /** When the clock last stopped (ms), or null if it never ran. */
  lastStop: number | null;
  pendingSessions: number;
  pendingSeconds: number;
  /** Milliseconds under a whole second, kept for the next stretch. */
  carryMs: number;
};

export type UsageBatch = { sessions: number; seconds: number };

export const newUsageClock = (): UsageClock => ({ since: null, lastStop: null, pendingSessions: 0, pendingSeconds: 0, carryMs: 0 });

function addStretch(c: UsageClock, now: number): UsageClock {
  if (c.since == null) return c;
  const ms = Math.min(Math.max(0, now - c.since), MAX_STRETCH_MS) + c.carryMs;
  return { ...c, since: now, pendingSeconds: c.pendingSeconds + Math.floor(ms / 1000), carryMs: ms % 1000 };
}

/** The screen came to the front. A new session unless it was away for less than the gap. */
export function startUsage(c: UsageClock, now: number): UsageClock {
  if (c.since != null) return c;
  const fresh = c.lastStop == null || now - c.lastStop >= NEW_SESSION_GAP_MS;
  return { ...c, since: now, pendingSessions: c.pendingSessions + (fresh ? 1 : 0) };
}

/** The screen closed or the app went to the background. */
export function stopUsage(c: UsageClock, now: number): UsageClock {
  if (c.since == null) return c;
  return { ...addStretch(c, now), since: null, lastStop: now };
}

/** A tick while running: counts the time so far. */
export function tickUsage(c: UsageClock, now: number): UsageClock {
  return addStretch(c, now);
}

/** What to send now (null if nothing), and the clock with that taken out. */
export function takeUsageBatch(c: UsageClock): { batch: UsageBatch | null; clock: UsageClock } {
  const sessions = Math.min(c.pendingSessions, MAX_SEND_SESSIONS);
  const seconds = Math.min(c.pendingSeconds, MAX_SEND_SECONDS);
  if (sessions === 0 && seconds === 0) return { batch: null, clock: c };
  return { batch: { sessions, seconds }, clock: { ...c, pendingSessions: c.pendingSessions - sessions, pendingSeconds: c.pendingSeconds - seconds } };
}

/** A send that didn't reach the server goes back, to try again on the next tick. */
export function returnUsageBatch(c: UsageClock, b: UsageBatch): UsageClock {
  return { ...c, pendingSessions: c.pendingSessions + b.sessions, pendingSeconds: c.pendingSeconds + b.seconds };
}

/** Which device category the counts are filed under. */
export function usageDevice(os: string, isPad = false): UsageDevice {
  if (os === 'ios') return isPad ? 'ipad' : 'iphone';
  if (os === 'android') return 'android';
  if (os === 'web') return 'web';
  return 'other';
}

/** Admin wording for a stretch of seconds: "45 sec", "12 min", "3 hr 5 min". */
export function usageDuration(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return `${s} sec`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} hr ${rest} min` : `${h} hr`;
}

/** Admin wording for the devices a rider used. */
export const USAGE_DEVICE_LABEL: Record<UsageDevice, string> = {
  iphone: 'iPhone', ipad: 'iPad', android: 'Android', web: 'Website', other: 'Other',
};
