// Shared loading for the Help Center scripts (build, check, audit). Node 22 runs the engine
// (app/src/core/help.ts) straight from TypeScript.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as engine from '../../src/core/help.ts';

export { engine };

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const HELP = join(ROOT, 'help');
export const SITE = 'https://onmylead.com';

export const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

/** Every article in help/articles, parsed. Parse errors come back as `errors`, not thrown. */
export function loadHelp() {
  const errors = [];
  const articles = [];
  const dir = join(HELP, 'articles');
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
    const slug = f.replace(/\.md$/, '');
    const text = readFileSync(join(dir, f), 'utf8');
    try {
      const a = engine.parseArticle(slug, text);
      a.hash = engine.contentHash(text);
      a.path = `help/articles/${f}`;
      articles.push(a);
    } catch (e) {
      errors.push({ slug, message: String(e.message ?? e) });
    }
  }
  return {
    articles,
    errors,
    categories: readJson(join(HELP, 'categories.json')),
    release: readJson(join(HELP, 'release.json')),
    changelog: readJson(join(HELP, 'changelog.json')),
    redirects: readJson(join(HELP, 'redirects.json')),
    releaseNotes: readJson(join(HELP, 'release-notes.json')),
  };
}

export const globToRegExp = engine.globToRegExp;

let fileList = null;
/** Every file in the repo (tracked by git), repo-relative. */
export function repoFiles() {
  if (fileList) return fileList;
  try {
    fileList = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    fileList = walk(ROOT).map((p) => relative(ROOT, p));
  }
  return fileList;
}

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.') || e.name === 'dist') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

export const matchesAny = engine.matchesAny;

/** Files a source glob points at. Empty means the glob is stale (the code moved or was removed). */
export function filesFor(glob) {
  const re = globToRegExp(glob);
  return repoFiles().filter((f) => re.test(f) || (existsSync(join(ROOT, glob)) && f === glob));
}

/** Runs git and returns trimmed stdout, or null when git (or the history) isn't there. */
export function git(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

/**
 * Which App Store version riders can download, asked of Apple's free public lookup. Falls back to
 * release.json's `live` when Apple can't be reached, and to the prelaunch version (with its notice)
 * while nothing is live yet. Never guesses upward: a failed lookup can only show fewer articles.
 */
export async function resolveRelease(release, { offline = false } = {}) {
  let apple = { checked: false, version: null, error: null, releaseNotes: null, releasedAt: null, url: null };
  if (!offline) {
    try {
      const url = `https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(release.bundleId)}&country=${release.country ?? 'us'}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`App Store lookup answered ${res.status}`);
      const j = await res.json();
      const r = j.results?.[0];
      apple = {
        checked: true,
        version: r?.version ?? null,
        error: null,
        releaseNotes: r?.releaseNotes ?? null,
        releasedAt: r?.currentVersionReleaseDate ?? null,
        url: r?.trackViewUrl ?? null,
      };
    } catch (e) {
      apple.error = String(e.message ?? e);
    }
  }
  const live = apple.version ?? (apple.checked ? null : release.live) ?? null;
  const prelaunch = !live;
  return {
    apple,
    live,
    prelaunch,
    publicVersion: live ?? release.prelaunch?.version ?? null,
    notice: prelaunch ? release.prelaunch?.notice ?? null : null,
  };
}

/**
 * Which version Google Play shows for the app, read from the public store page (Google has no free
 * lookup like Apple's). Best effort: if the page can't be read or its layout changed, the answer is
 * null and the release notes fall back to the dates in help/release-notes.json.
 */
export async function lookupPlay(packageName, { offline = false } = {}) {
  if (offline) return { version: null, error: 'offline' };
  try {
    const res = await fetch(`https://play.google.com/store/apps/details?id=${encodeURIComponent(packageName)}&hl=en_US&gl=US`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Google Play answered ${res.status}`);
    const html = await res.text();
    // The version sits next to the minimum Android version: [[["1.0.1"]],[[[36]],[[[24,"7.0"]]]]]
    const m = /\[\[\["(\d+(?:\.\d+){0,2})"\]\],\[\[\[\d+\]\],\[\[\[\d+,"[\d.]+"\]\]\]\]\]/.exec(html);
    return m ? { version: m[1], error: null } : { version: null, error: 'version not found on the Google Play page' };
  } catch (e) {
    return { version: null, error: String(e.message ?? e) };
  }
}

/**
 * The live manual edits from the Admin Dashboard (Help page), read with the website's public key.
 * Missing setup or an older database just means "no edits".
 */
export async function loadLiveEdits({ offline = false } = {}) {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (offline || !url || !key || /example|localhost|127\.0\.0\.1/.test(url)) return { edits: [], error: null };
  try {
    const res = await fetch(`${url}/rest/v1/rpc/help_live_edits`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 404) return { edits: [], error: 'help_live_edits is not on the server yet' };
    if (!res.ok) return { edits: [], error: `help_live_edits answered ${res.status}` };
    return { edits: await res.json(), error: null };
  } catch (e) {
    return { edits: [], error: String(e.message ?? e) };
  }
}

/** The article as the public sees it: the live manual edit (if any) on top of the repo version. */
export function withEdit(article, edit) {
  if (!edit) return { ...article, edited: null };
  return {
    ...article,
    title: edit.title || article.title,
    summary: edit.summary || article.summary,
    body: edit.body.trim() + '\n',
    updated: String(edit.updated_at).slice(0, 10),
    edited: { id: edit.id, at: edit.updated_at, baseHash: edit.base_hash, stale: edit.base_hash !== article.hash },
  };
}
