/**
 * The owner's release controls, set on the Admin Dashboard's Releases page and read by every
 * rider's phone with the other app settings (public_app_settings(), the `app_versions` key added
 * in migration 20261101300000_release_controls.sql):
 *
 *   {
 *     "ios":     { "minimum": "1.0.2", "latest": "1.0.4" },
 *     "android": { "minimum": "1.0.2", "latest": "1.0.4" },
 *     "notice":  { "versions": ["1.0.3"], "text": "...", "until": "ISO?" }
 *   }
 *
 * Neither store lets an app go back to an older version, so a bad release is handled by:
 *   * `notice`, a message shown only on the listed versions ("We know Ride Chat is broken in
 *     1.0.3; a fix is on the way");
 *   * `latest`, which tells riders on an older version that an update is waiting (the app also
 *     checks the App Store or Google Play itself, see parseAppStoreLookup, so this is optional);
 *   * `minimum`, which asks riders below it to update before they carry on, once the fixed
 *     version is in the store.
 *
 * Safety comes first: "Update Required" always has a "Not Now" so a rider on a trail with no
 * signal is never locked out of Ride Mode or Help and SOS. Anything missing or malformed means
 * "no control set", and the website (always the newest code) ignores all of it.
 */

// No import from app-settings.ts: it imports this file.
export type Notice = { text: string; until?: string };

export type PlatformVersions = { minimum: string | null; latest: string | null };
export type VersionNotice = Notice & { versions: string[] };
export type AppVersions = { ios: PlatformVersions; android: PlatformVersions; notice: VersionNotice | null };

export const NO_VERSIONS: AppVersions = {
  ios: { minimum: null, latest: null },
  android: { minimum: null, latest: null },
  notice: null,
};

/** "1", "1.0" or "1.0.3": up to three whole numbers. */
export const VERSION_RE = /^\d{1,4}(\.\d{1,4}){0,2}$/;

export const isVersion = (v: unknown): v is string => typeof v === 'string' && VERSION_RE.test(v.trim());

/** Compares app versions number by number, so 1.0.10 is newer than 1.0.9 and 1.0 equals 1.0.0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.trim().split('.').map(Number);
  const pb = b.trim().split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

const sameVersion = (a: string, b: string) => compareVersions(a, b) === 0;

function parsePlatform(v: unknown): PlatformVersions {
  if (!v || typeof v !== 'object') return { minimum: null, latest: null };
  const o = v as Record<string, unknown>;
  return { minimum: isVersion(o.minimum) ? o.minimum.trim() : null, latest: isVersion(o.latest) ? o.latest.trim() : null };
}

function parseVersionNotice(v: unknown): VersionNotice | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const text = typeof o.text === 'string' ? o.text.trim() : '';
  const versions = Array.isArray(o.versions) ? o.versions.filter(isVersion).map((x) => x.trim()) : [];
  if (!text || !versions.length) return null;
  const until = typeof o.until === 'string' && !Number.isNaN(Date.parse(o.until)) ? o.until : undefined;
  return until ? { text, versions, until } : { text, versions };
}

/** Reads the server's answer, dropping anything malformed instead of failing. */
export function parseAppVersions(v: unknown): AppVersions {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return NO_VERSIONS;
  const o = v as Record<string, unknown>;
  return { ios: parsePlatform(o.ios), android: parsePlatform(o.android), notice: parseVersionNotice(o.notice) };
}

export type StorePlatform = 'ios' | 'android';

export type UpdateState =
  | { kind: 'none' }
  /** Below the owner's minimum: the full-screen "Update Required" card (with Not Now). */
  | { kind: 'required'; minimum: string }
  /** A newer version is in the store: a small card on the home screen the rider can close. */
  | { kind: 'available'; latest: string };

/**
 * What this phone should show. `current` is the app's own version (app.json `version`); null on
 * the website or when it can't be read, which shows nothing.
 */
export function updateState(
  versions: AppVersions,
  platform: string,
  current: string | null | undefined,
  storeVersion: string | null = null,
): UpdateState {
  if ((platform !== 'ios' && platform !== 'android') || !isVersion(current)) return { kind: 'none' };
  const p = versions[platform];
  if (p.minimum && compareVersions(current, p.minimum) < 0) return { kind: 'required', minimum: p.minimum };
  const latest = newestVersion(p.latest, storeVersion);
  if (latest && compareVersions(current, latest) < 0) return { kind: 'available', latest };
  return { kind: 'none' };
}

/** The newer of two versions, ignoring anything missing or malformed. */
export function newestVersion(a: string | null | undefined, b: string | null | undefined): string | null {
  const x = isVersion(a) ? a.trim() : null;
  const y = isVersion(b) ? b.trim() : null;
  if (!x || !y) return x ?? y;
  return compareVersions(x, y) >= 0 ? x : y;
}

/*
 * The store's own answer, so "Update Available" shows by itself the day a new version goes live,
 * with nothing to set on the Releases page (its Latest Version still works and wins when newer).
 * Both readers return null on anything unexpected, which shows nothing.
 */

/** The version in the App Store, from Apple's public lookup (itunes.apple.com/lookup?bundleId=). */
export function parseAppStoreLookup(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null;
  const results = (json as { results?: unknown }).results;
  const r = Array.isArray(results) ? (results[0] as { version?: unknown } | undefined) : undefined;
  return isVersion(r?.version) ? r.version.trim() : null;
}

/**
 * The version on OnMyLead's public Google Play page. It sits next to the minimum Android version:
 * [[["1.0.3"]],[[[36]],[[[24,"7.0"]]]]] (the same reader the Help Center build uses).
 */
export function parsePlayPage(html: string): string | null {
  const m = /\[\[\["(\d+(?:\.\d+){0,2})"\]\],\[\[\[\d+\]\],\[\[\[\d+,"[\d.]+"\]\]\]\]\]/.exec(html);
  return m ? m[1] : null;
}

/** The owner's message for this exact version, while it is still showing. */
export function noticeForVersion(
  versions: AppVersions,
  platform: string,
  current: string | null | undefined,
  now: number = Date.now(),
): VersionNotice | null {
  if ((platform !== 'ios' && platform !== 'android') || !isVersion(current)) return null;
  const n = versions.notice;
  if (!n || !n.versions.some((v) => sameVersion(v, current))) return null;
  if (n.until && Date.parse(n.until) <= now) return null;
  return n;
}

/**
 * Checks what the Releases page is about to save, with the same rules as the database
 * (admin_set_setting in migration 20261101300000). Returns a problem in plain words, or null.
 */
export function versionsProblem(v: AppVersions): string | null {
  for (const p of ['ios', 'android'] as const) {
    const { minimum, latest } = v[p];
    if (minimum && latest && compareVersions(minimum, latest) > 0) {
      return `${p === 'ios' ? 'iPhone and iPad' : 'Android'}: the minimum version can't be newer than the latest version.`;
    }
  }
  if (v.notice && v.notice.text.length > 500) return 'The version notice must be 500 characters or fewer.';
  return null;
}

/** The JSON the Releases page saves: only what is set, so an empty control stays empty. */
export function versionsValue(v: AppVersions): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of ['ios', 'android'] as const) {
    const part: Record<string, string> = {};
    if (v[p].minimum) part.minimum = v[p].minimum!;
    if (v[p].latest) part.latest = v[p].latest!;
    if (Object.keys(part).length) out[p] = part;
  }
  if (v.notice) out.notice = v.notice;
  return out;
}
