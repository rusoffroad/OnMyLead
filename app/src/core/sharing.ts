/**
 * Location sharing sessions. Sharing is always explicit, scoped (a ride or named people),
 * time-limited and revocable. These pure functions decide whether a session is live.
 */

export type ShareScope = 'ride' | 'personal';

/** Duration choices offered in the UI. `null` means "until I leave the ride" (ride scope) or "until I turn it off" (personal). */
export const RIDE_SHARE_OPTIONS_MIN: (number | null)[] = [120, 240, 480, null];
export const PERSONAL_SHARE_OPTIONS_MIN: (number | null)[] = [15, 60, 240, 480, null];

/** Personal "until I turn it off" shares are still capped so a forgotten share ends. */
export const PERSONAL_OPEN_ENDED_CAP_MIN = 24 * 60;

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
  if (scope === 'personal' && expiresAt == null) {
    expiresAt = now + PERSONAL_OPEN_ENDED_CAP_MIN * 60_000;
  }
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
  if (!isShareActive(s, now, ride) || s.expiresAt == null) return false;
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

export function formatRemaining(ms: number | null): string {
  if (ms == null) return 'until you leave the ride';
  const totalMin = Math.ceil(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min left`;
  return m === 0 ? `${h} hr left` : `${h} hr ${m} min left`;
}
