import { tc } from './i18n';

/**
 * A request that never got an answer: no signal, or iOS cancelled it (the app was sent to the
 * background mid-request, or the network changed: "fetch failed: UnexpectedException: cancelled"),
 * or Android's OkHttp cancelled it ("java.io.IOException: Canceled"), or React Native's fetch timed it out ("Network request timed out"). Worth one quiet retry, and
 * never worth showing as it is. "cancelled" and "timed out" count only as the fetch layer words
 * them (either spelling), so a server message about a cancelled ride or a statement timeout is shown as itself.
 */
export function isTransientError(message: string | null | undefined): boolean {
  // postgrest-js words a dropped fetch as "<name>: <message>" (TypeError, FetchError, AbortError).
  const m = (message ?? '').replace(/^[A-Za-z]*Error: /, '');
  return /network request (failed|timed out)|failed to fetch|fetch failed|network ?error|^load failed|UnexpectedException: cancell?ed|IOException: cancell?ed|^(the )?(request )?(cancell?ed|timed out)\b/i
    .test(m);
}

/**
 * Text for an alert after a Ride Mode action failed, for a rider on the trail: no signal says so,
 * and a raw error from the phone ("TypeError: ...", "UnexpectedException ... Promise.swift:56")
 * becomes a plain try-again. A message the server wrote for riders is shown as it is.
 */
export function rideActionError(message: string | null | undefined): string {
  const m = message ?? '';
  if (isTransientError(m)) return tc('No service. Try again when you have signal.');
  if (!m.trim() || /\b\w*(Error|Exception)\b|\(at |\.(swift|kt|java|m|mm|js):\d|undefined|\[object /.test(m)) return tc('Something went wrong. Try again.');
  return m;
}
