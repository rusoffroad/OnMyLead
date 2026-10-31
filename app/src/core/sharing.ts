/**
 * Location sharing sessions. Sharing is always explicit, scoped (a ride or named people),
 * time-limited and revocable. These pure functions decide whether a session is live.
 */

export type ShareScope = 'ride' | 'personal';

/**
 * Duration choices offered in the UI. `null` means "until I turn it off": a ride share then still
 * ends when the rider leaves or the ride ends; a personal share runs until the rider stops it.
 */
export const RIDE_SHARE_OPTIONS_MIN: (number | null)[] = [120, 240, 480, null];
export const PERSONAL_SHARE_OPTIONS_MIN: (number | null)[] = [15, 60, 240, 480, null];

/**
 * A personal "until I turn it off" share is stored with this far-off end time. The database requires
 * every personal share to have an end (app 1.0 and 1.0.1 rely on that), so this keeps one table, one
 * set of privacy rules and every app build working, with no server change. Stopping it revokes it.
 * Before 1.0.2, "until I turn it off" was capped at 24 hours.
 */
export const UNTIL_TURNED_OFF_AT = Date.UTC(9999, 11, 31);
/** Anything ending after this is an "until I turn it off" share. */
const UNTIL_TURNED_OFF_FROM = Date.UTC(9000, 0, 1);

/** Whether a share's end (epoch ms) means "until I turn it off". Null (a ride share) counts too. */
export function isUntilTurnedOff(expiresAt: number | null | undefined): boolean {
  return expiresAt == null || expiresAt >= UNTIL_TURNED_OFF_FROM;
}

/** A share picked on the calendar can end at most a year out. */
export const MAX_SHARE_END_DAYS = 366;
/** ...and at least this far ahead, so it isn't over before it starts. */
export const MIN_SHARE_END_MIN = 5;

/** Why a chosen end time (epoch ms) can't be used, or null when it's fine. */
export function shareEndProblem(endAt: number | null, now: number): string | null {
  if (endAt == null || !Number.isFinite(endAt)) return 'Pick a day and a time.';
  if (endAt < now + MIN_SHARE_END_MIN * 60_000) return 'Pick a time later than now.';
  if (endAt > now + MAX_SHARE_END_DAYS * 86_400_000) return 'Pick a day within the next year.';
  return null;
}

/** Minutes from now until `endAt`, for starting a share that ends then. */
export function minutesUntil(endAt: number, now: number): number {
  return Math.max(1, Math.round((endAt - now) / 60_000));
}

/** Riders get one prompt to extend this long before expiry. */
export const EXTEND_PROMPT_LEAD_MIN = 10;

export type ShareSession = {
  scope: ShareScope;
  startedAt: number; // epoch ms
  /** Expiry chosen by the rider, epoch ms, or null for open-ended. */
  expiresAt: number | null;
  revokedAt?: number | null;
};

export type RideContext = {
  /** Set when the organizer ends the ride. */
  endedAt?: number | null;
  /** Set when this rider leaves the ride. */
  leftAt?: number | null;
};

export function startShare(scope: ShareScope, now: number, durationMin: number | null): ShareSession {
  let expiresAt = durationMin == null ? null : now + durationMin * 60_000;
  if (scope === 'personal' && expiresAt == null) expiresAt = UNTIL_TURNED_OFF_AT;
  return { scope, startedAt: now, expiresAt, revokedAt: null };
}

/** The moment sharing stops: earliest of expiry, revoke, ride end, or leaving the ride. */
export function effectiveEnd(s: ShareSession, ride?: RideContext): number | null {
  const candidates = [s.expiresAt, s.revokedAt ?? null];
  if (s.scope === 'ride') candidates.push(ride?.endedAt ?? null, ride?.leftAt ?? null);
  const set = candidates.filter((t): t is number => t != null);
  return set.length ? Math.min(...set) : null;
}

export function isShareActive(s: ShareSession, now: number, ride?: RideContext): boolean {
  if (now < s.startedAt) return false;
  const end = effectiveEnd(s, ride);
  return end == null || now < end;
}

export function remainingMs(s: ShareSession, now: number, ride?: RideContext): number | null {
  const end = effectiveEnd(s, ride);
  return end == null ? null : Math.max(0, end - now);
}

/** True during the window where the rider should see the single "extend?" prompt. */
export function shouldPromptExtend(s: ShareSession, now: number, ride?: RideContext): boolean {
  if (!isShareActive(s, now, ride) || isUntilTurnedOff(s.expiresAt)) return false;
  const end = effectiveEnd(s, ride)!;
  // Only prompt when the rider's own timer is what ends it, not a ride ending.
  if (end !== s.expiresAt) return false;
  return s.expiresAt - now <= EXTEND_PROMPT_LEAD_MIN * 60_000;
}

export function extendShare(s: ShareSession, now: number, addMin: number): ShareSession {
  const base = Math.max(now, s.expiresAt ?? now);
  return { ...s, expiresAt: base + addMin * 60_000 };
}

export function revokeShare(s: ShareSession, now: number): ShareSession {
  return { ...s, revokedAt: now };
}

/** Whether time left (ms) is really an "until I turn it off" share. */
const openEnded = (ms: number | null) => ms == null || ms >= 1000 * 365 * 86_400_000;

export function formatRemaining(ms: number | null): string {
  if (openEnded(ms)) return 'until you turn it off';
  const totalMin = Math.ceil(ms! / 60_000);
  if (totalMin >= 48 * 60) return `${Math.floor(totalMin / (24 * 60))} days left`;
  if (totalMin >= 24 * 60) {
    const h = Math.floor((totalMin - 24 * 60) / 60);
    return h === 0 ? '1 day left' : `1 day ${h} hr left`;
  }
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min left`;
  return m === 0 ? `${h} hr left` : `${h} hr ${m} min left`;
}

/** The tiny version for the folded sharing pill in Ride Mode: "1h 20m", "45m", or "On" with no timer. */
export function formatRemainingShort(ms: number | null): string {
  if (openEnded(ms)) return 'On';
  const totalMin = Math.max(1, Math.ceil(ms! / 60_000));
  if (totalMin >= 24 * 60) return `${Math.floor(totalMin / (24 * 60))}d`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * When sharing ends, in words for the share card and messages: "until you turn it off", "until
 * 6:00 PM" (today), or "until Sat, Nov 14, 6:00 PM".
 */
export function shareEndText(expiresAt: number | null, now: number): string {
  if (isUntilTurnedOff(expiresAt)) return 'until you turn it off';
  const end = new Date(expiresAt!);
  const time = end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const n = new Date(now);
  if (end.toDateString() === n.toDateString()) return `until ${time}`;
  const day = end.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', ...(end.getFullYear() === n.getFullYear() ? {} : { year: 'numeric' }),
  });
  return `until ${day}, ${time}`;
}
