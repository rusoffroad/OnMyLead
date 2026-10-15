/**
 * The app's own short activity log, attached to bug reports so the team can see what just happened:
 * screens visited, errors and requests that failed. Phones don't let an app read the system log, so
 * the app keeps this itself, in memory only, and it is gone when the app closes.
 *
 * Privacy: nothing here is ever a location, a message or anything a rider typed. Every line goes
 * through scrub(), which drops coordinates, emails, tokens, query strings and long numbers.
 */
export type LogKind = 'screen' | 'app' | 'error' | 'warn' | 'request';
export type LogEntry = { at: number; kind: LogKind; text: string };

export const LOG_KEEP = 200;
export const LOG_LINE_MAX = 300;

/** Adds one entry, keeping the newest `keep`. The same line twice in a row counts up instead. */
export function addEntry(log: LogEntry[], entry: LogEntry, keep = LOG_KEEP): LogEntry[] {
  const text = scrub(entry.text).slice(0, LOG_LINE_MAX);
  const last = log[log.length - 1];
  const repeat = last && last.kind === entry.kind && last.text.replace(/ \(x\d+\)$/, '') === text;
  if (repeat) {
    const n = Number(/ \(x(\d+)\)$/.exec(last.text)?.[1] ?? 1) + 1;
    return [...log.slice(0, -1), { at: entry.at, kind: entry.kind, text: `${text} (x${n})` }];
  }
  return [...log, { ...entry, text }].slice(-keep);
}

/** Takes out anything that could be private before a line is kept. */
export function scrub(s: string): string {
  return s
    // URLs keep their host and path, never the query string or fragment.
    .replace(/(https?:\/\/[^\s?#"']+)[?#][^\s"']*/gi, '$1')
    .replace(/[^\s@"'<>]+@[^\s@"'<>]+\.[a-z]{2,}/gi, '[email]')
    // JWTs and other long tokens.
    .replace(/\bey[\w-]{10,}\.[\w-]{10,}\.[\w-]{5,}/g, '[token]')
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, '[token]')
    // Coordinates ("38.5733, -109.5498") and long numbers.
    .replace(/-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/g, '[place]')
    .replace(/-?\d{1,3}\.\d{4,}/g, '[number]')
    .replace(/\d{7,}/g, '[number]')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The log as text, oldest first: "20:14:03.120  screen  /ride/[id]/live". UTC, so it lines up with the server. */
export function formatLog(log: readonly LogEntry[]): string {
  return log
    .map((e) => `${new Date(e.at).toISOString().slice(11, 23)}  ${e.kind.padEnd(7)}  ${e.text}`)
    .join('\n');
}

/** What a failed request says in the log: method, host and path only. */
export function requestLine(method: string, url: string, outcome: number | string): string {
  let where = url;
  try {
    const u = new URL(url);
    where = u.host + u.pathname;
  } catch {
    where = url.split(/[?#]/)[0];
  }
  return `${method.toUpperCase()} ${where} ${typeof outcome === 'number' ? `failed ${outcome}` : `failed: ${outcome}`}`;
}
