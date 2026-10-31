// Release notes for every app version (help/release-notes.json), shown at onmylead.com/help/release-notes.
// Pure rules: which versions the public may see, what each store has, and the checks the Help
// Center check runs on the file. The build (app/scripts/help/build.mjs) renders the page.
// Standalone (no imports), so the website build can run it straight from TypeScript with Node.

/** Compares "1.0" with "1.0.1" or "1.10" (the same rule as core/help.ts). Returns <0, 0 or >0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}
const isVersion = (v: string) => /^\d+(\.\d+){0,2}$/.test(v);

export type ReleaseNoteKind = 'new' | 'improved' | 'fixed';
/** Who a note applies to. Leave it out for every device. */
export type ReleaseNoteDevices = 'iphone-ipad' | 'android' | 'phones' | 'tablets';

export type ReleaseNote = { kind: ReleaseNoteKind; text: string; devices?: ReleaseNoteDevices };

export type AppRelease = {
  version: string;
  /** A few words, Title Case: what this update is about. */
  title: string;
  /** One or two sentences that open the version on the page. */
  intro: string;
  /** The store "What's New" text, at most 500 characters (Google Play's limit; Apple allows 4000). */
  whatsNew: string;
  /** The day the App Store released it (YYYY-MM-DD), or null. Filled from Apple's lookup when it's live. */
  apple: string | null;
  /** The day Google Play published it (YYYY-MM-DD), or null. */
  google: string | null;
  notes: ReleaseNote[];
};

/** What each store has right now: the version, and for the App Store the release day it reports. */
export type StoresLive = {
  apple: { version: string | null; releasedAt?: string | null };
  google: { version: string | null };
};

export type StoreState =
  | { state: 'released'; date: string | null }
  | { state: 'later'; version: string }
  | { state: 'pending' };

export const KIND_TITLES: Record<ReleaseNoteKind, string> = { new: 'New', improved: 'Improved', fixed: 'Fixed' };
export const KIND_ORDER: ReleaseNoteKind[] = ['new', 'improved', 'fixed'];
export const DEVICE_LABELS: Record<ReleaseNoteDevices, string> = {
  'iphone-ipad': 'iPhone and iPad',
  android: 'Android',
  phones: 'Phones',
  tablets: 'Tablets',
};
export const WHATS_NEW_LIMIT = 500;

const live = (v: string, storeVersion: string | null) => !!storeVersion && compareVersions(v, storeVersion) <= 0;

/** Where a version stands on one store. */
export function storeState(r: AppRelease, store: 'apple' | 'google', all: AppRelease[], stores: StoresLive): StoreState {
  const date = r[store];
  const storeVersion = stores[store].version;
  if (date) return { state: 'released', date };
  if (storeVersion && compareVersions(r.version, storeVersion) === 0)
    return { state: 'released', date: store === 'apple' ? (stores.apple.releasedAt ?? '').slice(0, 10) || null : null };
  if (live(r.version, storeVersion)) {
    // Skipped on this store: its changes reached riders in the first later version the store had.
    const next = [...all]
      .filter((x) => compareVersions(x.version, r.version) > 0 && (x[store] || live(x.version, storeVersion)))
      .sort((a, b) => compareVersions(a.version, b.version))[0];
    return { state: 'later', version: next?.version ?? storeVersion! };
  }
  return { state: 'pending' };
}

/**
 * The versions the public may read about, newest first: those at least one store has released.
 * Notes for a version still in review stay hidden, the same way the Help Center hides its guides.
 */
export function publishedReleases(all: AppRelease[], stores: StoresLive): AppRelease[] {
  return all
    .filter((r) => storeState(r, 'apple', all, stores).state === 'released' || storeState(r, 'google', all, stores).state === 'released')
    .sort((a, b) => compareVersions(b.version, a.version));
}

/** The notes of a version in page order (New, Improved, Fixed), keeping the file's order inside each. */
export function groupNotes(r: AppRelease): { kind: ReleaseNoteKind; title: string; notes: ReleaseNote[] }[] {
  return KIND_ORDER.map((kind) => ({ kind, title: KIND_TITLES[kind], notes: r.notes.filter((n) => n.kind === kind) })).filter((g) => g.notes.length);
}

/** Problems with help/release-notes.json. `appVersion` is app.json's version: it must have notes. */
export function checkReleaseNotes(all: unknown, appVersion?: string | null): string[] {
  const errors: string[] = [];
  if (!Array.isArray(all)) return ['help/release-notes.json must be a list of versions.'];
  const seen = new Set<string>();
  const date = (v: unknown) => v === null || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v));
  let prev: string | null = null;
  for (const r of all as AppRelease[]) {
    const v = String(r?.version ?? '');
    const at = `Release notes ${v || '(no version)'}`;
    if (!isVersion(v)) errors.push(`${at}: version must look like "1.0.2".`);
    if (seen.has(v)) errors.push(`${at}: listed twice.`);
    seen.add(v);
    if (prev && isVersion(v) && compareVersions(v, prev) >= 0) errors.push(`${at}: list versions newest first.`);
    prev = v;
    if (!r.title?.trim()) errors.push(`${at}: no title.`);
    else if (r.title.split(' ').some((w, i) => i > 0 && /^[a-z]{4,}/.test(w) && !/^(with|from|into|than|your|that|when|what|this)$/.test(w)))
      errors.push(`${at}: the title "${r.title}" must be Title Case.`);
    if (!r.intro?.trim()) errors.push(`${at}: no intro.`);
    if (!r.whatsNew?.trim()) errors.push(`${at}: no whatsNew (the store text).`);
    else if (r.whatsNew.length > WHATS_NEW_LIMIT)
      errors.push(`${at}: whatsNew is ${r.whatsNew.length} characters; Google Play takes at most ${WHATS_NEW_LIMIT}.`);
    if (!date(r.apple) || !date(r.google)) errors.push(`${at}: apple and google must be a date like 2026-10-28, or null.`);
    if (!Array.isArray(r.notes) || !r.notes.length) errors.push(`${at}: no notes.`);
    for (const n of Array.isArray(r.notes) ? r.notes : []) {
      if (!KIND_ORDER.includes(n?.kind)) errors.push(`${at}: note kind must be new, improved or fixed, not "${n?.kind}".`);
      if (!n?.text?.trim()) errors.push(`${at}: a note has no text.`);
      if (n?.devices !== undefined && !(n.devices in DEVICE_LABELS)) errors.push(`${at}: unknown devices "${n.devices}".`);
    }
    const words = [r.title, r.intro, r.whatsNew, ...(Array.isArray(r.notes) ? r.notes.map((n) => n?.text) : [])].join(' ');
    if (/[—–]/.test(words)) errors.push(`${at}: use no em or en dashes.`);
  }
  if (appVersion && isVersion(appVersion) && !seen.has(appVersion))
    errors.push(`The app is version ${appVersion} (app/app.json) but help/release-notes.json has no notes for it. Add them before the build goes to the stores.`);
  return errors;
}
