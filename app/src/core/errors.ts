/**
 * A request that never got an answer: no signal, or iOS cancelled it (the app was sent to the
 * background mid-request, or the network changed: "fetch failed: UnexpectedException: cancelled"),
 * or React Native's fetch timed it out ("Network request timed out"). Worth one quiet retry, and
 * never worth showing as it is. "cancelled" and "timed out" count only as the fetch layer words
 * them (either spelling), so a server message about a cancelled ride or a statement timeout is shown as itself.
 */
export function isTransientError(message: string | null | undefined): boolean {
  // postgrest-js words a dropped fetch as "<name>: <message>" (TypeError, FetchError, AbortError).
  const m = (message ?? '').replace(/^[A-Za-z]*Error: /, '');
  return /network request (failed|timed out)|failed to fetch|fetch failed|network ?error|^load failed|UnexpectedException: cancell?ed|^(the )?(request )?(cancell?ed|timed out)\b/i
    .test(m);
}
