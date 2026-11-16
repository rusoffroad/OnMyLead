/**
 * How long a Supabase sign-in or database request may wait for an answer.
 *
 * supabase-js runs every request behind one session lock: if a token refresh hangs (no service,
 * a dead cell connection that never errors), every later request waits behind it and the app
 * looks frozen. Capping auth and REST calls means a hung request fails as "Network request timed
 * out", which the offline outbox already treats as no answer and retries later.
 *
 * Uploads (storage) and edge functions can legitimately take longer, so they are not capped, and a
 * caller that passes its own AbortSignal keeps its own deadline.
 */
export const REQUEST_TIMEOUT_MS = 20_000;

export function requestTimeoutMs(url: string, hasOwnSignal: boolean): number | null {
  if (hasOwnSignal) return null;
  return /\/(auth|rest)\/v1\//.test(url) ? REQUEST_TIMEOUT_MS : null;
}
