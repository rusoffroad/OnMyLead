// Data for the Admin Dashboard's Help page. Three sources, all free and keyless:
//   * the audit report GitHub Actions publishes after every change to main and every night
//     (help-audit branch of the public repo): every article, its status, history and problems;
//   * the dashboard's own edits, through the admin_help_* database functions;
//   * live checks the dashboard runs itself for "Run Audit Now" (Apple's App Store lookup,
//     GitHub's compare view, and the published help pages).
import { matchesAny, parseArticle, contentHash, type HelpVisibility } from '@/core/help';

import type { Tone } from '@/components/admin';

import { adminRpc } from './admin';

const REPO = 'rusoffroad/OnMyLead';
export const REPORT_URL = `https://raw.githubusercontent.com/${REPO}/help-audit/report.json`;
export const rawFileUrl = (sha: string, path: string) => `https://raw.githubusercontent.com/${REPO}/${sha}/${path}`;
export const commitUrl = (sha: string) => `https://github.com/${REPO}/commit/${sha}`;
export const ACTIONS_URL = `https://github.com/${REPO}/actions/workflows/help.yml`;

export type HelpIssue = { level: 'error' | 'warning'; slug: string | null; kind: string; message: string };

export type ReportArticle = {
  slug: string;
  title: string;
  summary: string;
  category: string;
  order: number;
  release: string;
  updated: string;
  visibility: HelpVisibility;
  review: string | null;
  draft: boolean;
  hash: string;
  sources: string[];
  related: string[];
  text: string;
  edit: { id: string; updatedAt: string; stale: boolean } | null;
  stale: boolean;
  changedSince: string[];
  screenshots: { file: string; shows: string[]; outdated: boolean; imageDate: string | null; screenDate: string | null }[];
  history: { sha: string; date: string; message: string }[];
};

export type HelpReport = {
  generatedAt: string;
  commit: string;
  release: {
    publicVersion: string | null;
    live: string | null;
    prelaunch: boolean;
    notice: string | null;
    apple: { checked: boolean; version: string | null; error: string | null; releasedAt: string | null; url: string | null };
    versions: { version: string; build: string; commit: string; status: string; submitted?: string; notes?: string }[];
    unreleased: { feature: string; why: string }[];
  };
  editsError: string | null;
  categories: { key: string; title: string }[];
  articles: ReportArticle[];
  uncovered: string[];
  changelog: { date: string; slugs: string[]; kind: string; by: string; ref?: string; why: string }[];
  issues: HelpIssue[];
};

export type SiteStatus = {
  builtAt: string;
  commit: string;
  publicVersion: string | null;
  live: string | null;
  prelaunch: boolean;
  published: { slug: string; updated: string; edit: string | null }[];
};

export type HelpEdit = {
  id: string;
  slug: string;
  title: string | null;
  summary: string | null;
  body: string;
  base_hash: string | null;
  note: string | null;
  kind: 'edit' | 'restore';
  live: boolean;
  created_at: string;
  updated_at: string;
  created_by_name: string | null;
};

export type AuditRun = { id: string; ran_at: string; errors: number; warnings: number; result: LiveAudit };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  return (await res.json()) as T;
}

export const loadReport = () => getJson<HelpReport>(`${REPORT_URL}?t=${Date.now()}`);
export const loadSiteStatus = () => getJson<SiteStatus>('/help/status.json').catch(() => null);

export const listEdits = (slug?: string) => adminRpc<HelpEdit[]>('admin_help_edits', { p_slug: slug ?? null });
export const listAudits = () => adminRpc<AuditRun[]>('admin_help_audits', { p_limit: 20 });
export const setLive = (id: string) => adminRpc<void>('admin_help_set_live', { p_id: id });
export const useAutomatic = (slug: string) => adminRpc<void>('admin_help_use_automatic', { p_slug: slug });

export function saveEdit(e: { slug: string; body: string; title?: string; summary?: string; baseHash?: string; note?: string; kind?: 'edit' | 'restore'; publish: boolean }) {
  return adminRpc<string>('admin_help_save', {
    p_slug: e.slug,
    p_body: e.body,
    p_title: e.title ?? null,
    p_summary: e.summary ?? null,
    p_base_hash: e.baseHash ?? null,
    p_note: e.note ?? null,
    p_kind: e.kind ?? 'edit',
    p_publish: e.publish,
  });
}

/** An article as it was at an earlier commit, for "Restore This Version". */
export async function articleAt(sha: string, slug: string) {
  const res = await fetch(rawFileUrl(sha, `help/articles/${slug}.md`), { cache: 'no-store' });
  if (!res.ok) throw new Error(`Couldn't load that version (GitHub answered ${res.status}).`);
  const text = await res.text();
  return parseArticle(slug, text);
}

/** Splits the repository text of an article into its parts for the editor. */
export function articleParts(a: ReportArticle) {
  const p = parseArticle(a.slug, a.text);
  return { title: p.title, summary: p.summary, body: p.body, hash: contentHash(a.text) };
}

export type LiveFinding = { level: 'error' | 'warning' | 'info'; slug?: string; message: string };
export type LiveAudit = {
  ranAt: string;
  reportAt: string | null;
  reportCommit: string | null;
  mainCommit: string | null;
  commitsSinceReport: number | null;
  appStore: { version: string | null; checked: boolean; error: string | null };
  website: { publicVersion: string | null; builtAt: string | null; commit: string | null } | null;
  pagesChecked: number;
  findings: LiveFinding[];
};

/**
 * "Run Audit Now": everything the nightly audit checks that can change between runs, done from
 * the browser. App Store release, code changes since the last full audit, the live help pages,
 * and dashboard edits that the automatic version has moved past.
 */
export async function runLiveAudit(report: HelpReport | null, site: SiteStatus | null, edits: HelpEdit[]): Promise<LiveAudit> {
  const findings: LiveFinding[] = [];
  const out: LiveAudit = {
    ranAt: new Date().toISOString(),
    reportAt: report?.generatedAt ?? null,
    reportCommit: report?.commit ?? null,
    mainCommit: null,
    commitsSinceReport: null,
    appStore: { version: null, checked: false, error: null },
    website: site ? { publicVersion: site.publicVersion, builtAt: site.builtAt, commit: site.commit } : null,
    pagesChecked: 0,
    findings,
  };

  // 1. Which version Apple is actually selling.
  try {
    const j = await getJson<{ results: { version: string }[] }>('https://itunes.apple.com/lookup?bundleId=com.rusoffroad.onmylead.app&country=us');
    out.appStore = { version: j.results?.[0]?.version ?? null, checked: true, error: null };
  } catch (e) {
    out.appStore.error = (e as Error).message;
    findings.push({ level: 'warning', message: `Couldn't reach the App Store lookup (${out.appStore.error}).` });
  }
  if (out.appStore.checked) {
    const shown = site?.publicVersion ?? report?.release.publicVersion ?? null;
    if (out.appStore.version && site && !site.prelaunch && site.publicVersion !== out.appStore.version)
      findings.push({ level: 'error', message: `The App Store has version ${out.appStore.version}, but the website's guides are for ${shown}. Deploy the website so the guides match.` });
    else if (out.appStore.version && site?.prelaunch)
      findings.push({ level: 'error', message: `Version ${out.appStore.version} is now live in the App Store, but the website still says the app is waiting for review. Deploy the website to publish the release's guides.` });
    else if (!out.appStore.version)
      findings.push({ level: 'info', message: `No version is live in the App Store yet. The website shows the guides for ${shown ?? 'the first release'} with a "waiting for review" note.` });
    else findings.push({ level: 'info', message: `The App Store and the website's guides both show version ${out.appStore.version}.` });
  }

  // 2. Code changed since the last full audit.
  if (report) {
    try {
      const cmp = await getJson<{ ahead_by: number; files?: { filename: string }[]; commits: { sha: string }[] }>(
        `https://api.github.com/repos/${REPO}/compare/${report.commit}...main`,
      );
      out.commitsSinceReport = cmp.ahead_by;
      out.mainCommit = cmp.commits?.[cmp.commits.length - 1]?.sha ?? report.commit;
      const files = (cmp.files ?? []).map((f) => f.filename);
      for (const a of report.articles) {
        const code = files.filter((f) => !f.startsWith('help/') && matchesAny(f, a.sources));
        if (code.length && !files.includes(`help/articles/${a.slug}.md`))
          findings.push({ level: 'warning', slug: a.slug, message: `Changed since the last full audit without its article: ${code.slice(0, 3).join(', ')}.` });
      }
      if (cmp.ahead_by > 0)
        findings.push({ level: 'info', message: `${cmp.ahead_by} change${cmp.ahead_by === 1 ? '' : 's'} on main since the last full audit. The next full audit runs after the next change to main or tonight.` });
    } catch (e) {
      findings.push({ level: 'warning', message: `Couldn't ask GitHub what changed since the last audit (${(e as Error).message}).` });
    }
    if (Date.now() - Date.parse(report.generatedAt) > 2 * 86400000)
      findings.push({ level: 'warning', message: 'The last full audit is more than two days old. Check the Help Center workflow on GitHub.' });
  } else findings.push({ level: 'error', message: 'The full audit report could not be loaded from GitHub.' });

  // 3. The help pages the website says it published actually load.
  if (site) {
    const slugs = site.published.map((p) => p.slug);
    const bad: string[] = [];
    for (let i = 0; i < slugs.length; i += 8) {
      await Promise.all(
        slugs.slice(i, i + 8).map(async (s) => {
          try {
            const r = await fetch(`/help/${s}`, { method: 'HEAD', cache: 'no-store' });
            if (!r.ok) bad.push(s);
          } catch {
            bad.push(s);
          }
        }),
      );
    }
    out.pagesChecked = slugs.length;
    for (const s of bad) findings.push({ level: 'error', slug: s, message: `/help/${s} doesn't load on the website.` });
    const reportPublished = new Set(report?.articles.filter((a) => a.visibility === 'published').map((a) => a.slug) ?? []);
    const missing = [...reportPublished].filter((s) => !slugs.includes(s));
    if (missing.length) findings.push({ level: 'warning', message: `Ready but not on the website yet (needs a website deploy): ${missing.join(', ')}.` });
  } else findings.push({ level: 'warning', message: "Couldn't read /help/status.json, so the website's help pages weren't checked." });

  // 4. Dashboard edits the automatic version has moved past.
  if (report) {
    for (const e of edits.filter((x) => x.live)) {
      const a = report.articles.find((x) => x.slug === e.slug);
      if (!a) findings.push({ level: 'error', slug: e.slug, message: 'Your live edit is for an article that no longer exists.' });
      else if (e.base_hash && e.base_hash !== a.hash)
        findings.push({ level: 'warning', slug: e.slug, message: 'The automatic version changed after your edit. Your edit is still shown: compare them on the article page.' });
    }
  }
  return out;
}

export const VISIBILITY_LABEL: Record<HelpVisibility, string> = {
  published: 'Published',
  upcoming: 'Upcoming',
  draft: 'Draft',
  'needs-review': 'Needs Your Review',
};

export const saveAuditRun = (result: LiveAudit, errors: number, warnings: number) =>
  adminRpc<string>('admin_help_log_audit', { p_result: result, p_errors: errors, p_warnings: warnings });

export const visibilityTone = (v: string): Tone => (v === 'published' ? 'ok' : v === 'upcoming' ? 'pro' : v === 'needs-review' ? 'warn' : 'muted');
export const findingTone = (l: string): Tone => (l === 'error' ? 'danger' : l === 'warning' ? 'warn' : 'muted');
