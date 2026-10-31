// Help Center checks. Three ways to run it (from app/):
//   node scripts/help/check.mjs                  every article is well formed, links work, nothing unreleased leaks
//   node scripts/help/check.mjs --base origin/main
//                                                 also: this change touched app code that articles describe,
//                                                 so those articles (and the changelog) must be in the same change
//   node scripts/help/check.mjs --audit report.json
//                                                 the full audit: staleness from git history, screenshots to
//                                                 replace, screens with no article, the App Store release, and
//                                                 dashboard edits. Writes the report the Admin Dashboard reads.
// Exits 1 when there are errors. Warnings never fail.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { checkReleaseNotes } from '../../src/core/release-notes.ts';
import { HELP, ROOT, engine, filesFor, git, loadHelp, loadLiveEdits, matchesAny, readJson, repoFiles, resolveRelease, withEdit } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const base = opt('--base');
const auditOut = opt('--audit');
const offline = process.env.HELP_OFFLINE === '1';

const help = loadHelp();
const issues = []; // { level: 'error' | 'warning', slug, kind, message }
const add = (level, slug, kind, message) => issues.push({ level, slug, kind, message });
for (const e of help.errors) add('error', e.slug, 'format', e.message);

const slugs = new Set(help.articles.map((a) => a.slug));
const catKeys = new Set(help.categories.map((c) => c.key));
const coverage = readJson(join(HELP, 'coverage.json'));
const unreleased = help.release.unreleased ?? [];
const versions = new Set((help.release.versions ?? []).map((v) => v.version));

/* ---------------------------------------------------------------------------------------------
 * 1. Every article on its own
 * ------------------------------------------------------------------------------------------- */
for (const a of help.articles) {
  const s = a.slug;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)) add('error', s, 'format', 'The file name must be lowercase words joined by hyphens.');
  if (!a.title) add('error', s, 'format', 'No title.');
  if (a.title && /\b(a|an|the|and|or|of|to|in|on|for|with)\b/.test(a.title.split(' ')[0])) add('error', s, 'format', 'The title must start with a capital (Title Case).');
  if (a.title && a.title.split(' ').some((w, i) => i > 0 && /^[a-z]/.test(w) && !/^(a|an|the|and|or|but|of|to|in|on|at|by|for|with|from|vs|as|is)$/.test(w)))
    add('warning', s, 'format', `The title "${a.title}" isn't Title Case.`);
  if (a.summary.length < 50 || a.summary.length > 170) add('error', s, 'format', `The summary is ${a.summary.length} characters; keep it between 50 and 170.`);
  if (!catKeys.has(a.category)) add('error', s, 'format', `Unknown category "${a.category}" (see help/categories.json).`);
  if (a.release !== 'web' && !engine.isVersion(a.release)) add('error', s, 'release', `release must be a version like "1.0" or "web", not "${a.release}".`);
  for (const v of engine.releasesNamed(a)) {
    if (engine.isVersion(v) && !versions.has(v) && engine.compareVersions(v, help.release.prelaunch?.version ?? '0') <= 0)
      add('warning', s, 'release', `Version ${v} isn't listed in help/release.json.`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.updated)) add('error', s, 'format', 'updated must be a date like 2026-10-14.');
  else if (a.updated > new Date(Date.now() + 86400000).toISOString().slice(0, 10)) add('error', s, 'format', 'updated is in the future.');
  if (!a.sources.length) add('error', s, 'sources', 'No sources: list the code this article describes.');
  for (const g of a.sources) if (!filesFor(g).length) add('error', s, 'sources', `Source "${g}" matches no file. The code moved or was removed: update the article.`);
  for (const r of a.related) if (!slugs.has(r)) add('error', s, 'links', `Related article "${r}" doesn't exist.`);
  if (/[—–]/.test(a.body + a.title + a.summary)) add('error', s, 'format', 'Use no em or en dashes.');
  if (/^#\s/m.test(a.body)) add('error', s, 'format', 'Use ## headings; the title is the page heading.');
  for (const h of a.body.matchAll(/^#{2,4}\s+(.+)$/gm)) {
    const words = h[1].replace(/[*`]/g, '').split(/\s+/);
    if (words.some((w, i) => i > 0 && /^[a-z]{4,}/.test(w) && !/^(with|from|into|than|your|that|when|what|this)$/.test(w)))
      add('warning', s, 'format', `Heading "${h[1]}" isn't Title Case.`);
  }
  // Release blocks must open and close in pairs.
  let depth = 0;
  for (const line of a.body.split('\n')) {
    if (/^:::\w/.test(line.trim())) depth++;
    else if (line.trim() === ':::') depth--;
    if (depth < 0) break;
  }
  if (depth !== 0) add('error', s, 'format', 'A ::: block is not closed (or closed twice).');

  // Links and images, in every release (so a link that appears later is checked now too).
  const r = engine.renderMarkdown(a.body.replace(/^:::(release|until)\s+\S+\s*$/gm, '').replace(/^:::\s*$/gm, ''));
  for (const href of r.links) {
    const m = /^\/help\/([a-z0-9-]+)(#.*)?$/.exec(href);
    if (m && !slugs.has(m[1]) && m[1] !== 'category' && m[1] !== 'search' && m[1] !== 'release-notes') add('error', s, 'links', `Link to /help/${m[1]}, which doesn't exist.`);
    if (/^\/help\/category\/([a-z-]+)/.test(href) && !catKeys.has(href.split('/')[3])) add('error', s, 'links', `Link to unknown category ${href}.`);
    if (/^(?!\/|#|https?:|mailto:)/.test(href)) add('error', s, 'links', `Link "${href}" must start with /, https:// or mailto:.`);
  }
  const listed = new Set(a.screenshots.map((x) => x.file));
  for (const src of r.images) {
    const m = /^\/help\/img\/(.+)$/.exec(src);
    if (!m) add('error', s, 'screenshots', `Image "${src}" must live in help/img/ and be linked as /help/img/<file>.`);
    else if (!existsSync(join(HELP, 'img', m[1]))) add('error', s, 'screenshots', `Image ${m[1]} is missing from help/img/.`);
    else if (!listed.has(m[1])) add('error', s, 'screenshots', `Image ${m[1]} isn't listed under screenshots: (with the screen it shows).`);
  }
  for (const shot of a.screenshots) {
    if (!existsSync(join(HELP, 'img', shot.file))) add('error', s, 'screenshots', `Screenshot ${shot.file} is missing from help/img/.`);
    if (!shot.shows.length) add('error', s, 'screenshots', `Screenshot ${shot.file} needs shows: (the screen's source file).`);
  }
  // Unreleased features must not read as available.
  for (const u of unreleased) {
    for (const w of u.words ?? []) {
      // Release blocks stay hidden until their release is live, so they may describe it already.
      for (const sentence of engine.filterRelease(a.body, null).split(/(?<=[.!?])\s+|\n/)) {
        if (new RegExp(`\\b${w}\\b`, 'i').test(sentence) && !sentence.trim().endsWith('?') && !/\b(not|isn't|aren't|doesn't|don't|no|can't|cannot|only)\b/i.test(sentence))
          add('error', s, 'unreleased', `Mentions ${u.feature} as if it's available ("${sentence.trim().slice(0, 90)}"). ${u.why}`);
      }
    }
  }
  if (a.review) add('warning', s, 'review', `Waiting for Chris's review, so not published: ${a.review}`);
}
/* ---------------------------------------------------------------------------------------------
 * 1b. Release notes (help/release-notes.json): well formed, and the app's version has notes
 * ------------------------------------------------------------------------------------------- */
const appVersion = readJson(join(ROOT, 'app/app.json')).expo?.version ?? null;
for (const e of checkReleaseNotes(help.releaseNotes, appVersion)) add('error', 'release-notes', 'release-notes', e);
if (slugs.has('release-notes')) add('error', 'release-notes', 'format', 'The slug release-notes is the Release Notes page; pick another name for this article.');
for (const r of Array.isArray(help.releaseNotes) ? help.releaseNotes : []) {
  const text = [r.title, r.intro, r.whatsNew, ...(r.notes ?? []).map((n) => n.text)].join('\n');
  for (const u of unreleased)
    for (const w of u.words ?? [])
      if (new RegExp(`\\b${w}\\b`, 'i').test(text)) add('error', 'release-notes', 'unreleased', `Release notes ${r.version} mention ${u.feature}. ${u.why}`);
}

if (!help.articles.some((a) => a.slug === 'faq')) add('warning', null, 'coverage', 'There is no faq article.');

/* ---------------------------------------------------------------------------------------------
 * 2. Coverage: every rider-facing screen is described by some article
 * ------------------------------------------------------------------------------------------- */
const described = new Set(help.articles.flatMap((a) => a.sources.flatMap(filesFor)));
const screens = repoFiles().filter((f) => matchesAny(f, coverage.screens) && !matchesAny(f, coverage.ignore.map((i) => i.path)));
const uncovered = screens.filter((f) => !described.has(f));
for (const f of uncovered) add('error', null, 'coverage', `The screen ${f} isn't in any article's sources. Document it, or add it to help/coverage.json "ignore" with why.`);

/* ---------------------------------------------------------------------------------------------
 * 3. This change (pull request or push): did app changes bring their help updates along?
 * ------------------------------------------------------------------------------------------- */
let changed = null;
if (base) {
  const out = git(['diff', '--name-only', `${base}...HEAD`]) ?? git(['diff', '--name-only', base, 'HEAD']);
  if (out === null) add('warning', null, 'drift', `Couldn't compare with ${base}; skipped the change checks.`);
  else {
    changed = out.split('\n').filter(Boolean);
    const touched = new Set(changed);
    const changelogTouched = touched.has('help/changelog.json');
    const before = (() => {
      try {
        return JSON.parse(git(['show', `${base}:help/changelog.json`]) ?? '[]');
      } catch {
        return [];
      }
    })();
    const logged = new Set(help.changelog.slice(0, Math.max(0, help.changelog.length - before.length)).flatMap((e) => e.slugs ?? []));
    for (const a of help.articles) {
      const code = changed.filter((f) => !f.startsWith('help/') && matchesAny(f, a.sources));
      // An article already dated today (another change bumped it) can't be bumped again, so a
      // changelog entry naming it is enough to say it was reviewed for this change.
      const reviewedToday = logged.has(a.slug) && a.updated >= new Date().toISOString().slice(0, 10);
      if (code.length && !touched.has(a.path) && !reviewedToday)
        add('error', a.slug, 'drift', `This change edits ${code.slice(0, 3).join(', ')}${code.length > 3 ? ` and ${code.length - 3} more` : ''}, which "${a.title}" describes. Update the article (or, if riders see no difference, just bump its updated: date and log why in help/changelog.json).`);
      if (touched.has(a.path) && !logged.has(a.slug))
        add('error', a.slug, 'changelog', `Article changed without a help/changelog.json entry naming "${a.slug}".`);
      for (const shot of a.screenshots) {
        const ui = changed.filter((f) => matchesAny(f, shot.shows));
        if (ui.length && !touched.has(`help/img/${shot.file}`))
          add('warning', a.slug, 'screenshots', `Screenshot ${shot.file} shows ${ui[0]}, which changed. Replace it if the screen looks different.`);
      }
    }
    for (const f of changed.filter((f) => /^help\/articles\/.+\.md$/.test(f) && !existsSync(join(ROOT, f)))) {
      const slug = f.split('/').pop().replace(/\.md$/, '');
      if (!help.redirects[slug]) add('error', slug, 'links', `Article ${slug} was removed: add it to help/redirects.json so old links and Google land somewhere.`);
      if (!logged.has(slug)) add('error', slug, 'changelog', `Removing ${slug} needs a help/changelog.json entry.`);
    }
    if (changed.some((f) => /^help\/articles\//.test(f)) && !changelogTouched) add('error', null, 'changelog', 'Articles changed but help/changelog.json did not.');
    // Pricing and plans are spelled out in the Pro articles.
    if (changed.some((f) => /app\/src\/constants\/site\.ts|core\/pro\.ts|pro-plan\.tsx|pro_entitlements|app_settings/.test(f)) && !changed.some((f) => /help\/articles\/(free-vs-pro|subscribe-to-pro|pro-trial)\.md/.test(f)))
      add('warning', null, 'drift', 'Plans, prices or Pro features may have changed: check the Free vs Pro, Pro Trial and Subscribe articles.');
  }
}

/* ---------------------------------------------------------------------------------------------
 * 4. The full audit (scheduled, or after every change to main)
 * ------------------------------------------------------------------------------------------- */
const lastCommit = (paths) => {
  if (!paths.length) return null;
  const out = git(['log', '-1', '--format=%H %cI', '--', ...paths]);
  if (!out) return null;
  const [sha, date] = out.split(' ');
  return { sha, date };
};

let report = null;
if (auditOut) {
  const release = await resolveRelease(help.release, { offline });
  const { edits, error: editsError } = await loadLiveEdits({ offline });
  const editFor = new Map(edits.map((e) => [e.slug, e]));
  const head = git(['rev-parse', 'HEAD']);

  if (release.apple.error) add('warning', null, 'release', `Couldn't ask the App Store which version is live (${release.apple.error}). Used help/release.json.`);
  const newest = [...versions].sort(engine.compareVersions).pop();
  if (release.live && !versions.has(release.live)) add('warning', null, 'release', `Version ${release.live} is live in the App Store but isn't in help/release.json. Add it so the guides match.`);
  if (release.live && newest && engine.compareVersions(release.live, newest) < 0)
    add('warning', null, 'release', `Version ${newest} isn't live yet (the App Store has ${release.live}); its guides stay hidden until Apple releases it.`);
  if (help.release.live && release.apple.checked && release.apple.version === null)
    add('error', null, 'release', 'help/release.json says a version is live, but the App Store has no OnMyLead listing. Check whether the app was removed.');

  const articles = help.articles.map((a) => {
    const edit = editFor.get(a.slug);
    const shown = withEdit(a, edit);
    const vis = engine.visibility(a, release.publicVersion);
    const own = lastCommit([a.path]);
    const srcFiles = [...new Set(a.sources.flatMap(filesFor))];
    const code = lastCommit(srcFiles);
    // Stale: the code changed in a commit after the article last changed (and after its updated: date).
    const stale = code && own && code.sha !== own.sha && code.date > own.date && code.date.slice(0, 10) > a.updated;
    let changedSince = [];
    if (stale) {
      const files = git(['diff', '--name-only', `${own.sha}..HEAD`, '--', ...srcFiles]);
      changedSince = files ? files.split('\n').filter(Boolean) : [];
      if (changedSince.length)
        add('warning', a.slug, 'stale', `The app changed after this article was last updated (${changedSince.slice(0, 3).join(', ')}${changedSince.length > 3 ? '…' : ''}).`);
    }
    const shots = a.screenshots.map((shot) => {
      const img = lastCommit([`help/img/${shot.file}`]);
      const ui = lastCommit(shot.shows.flatMap(filesFor));
      const outdated = !!(img && ui && ui.date > img.date);
      if (outdated) add('warning', a.slug, 'screenshots', `Screenshot ${shot.file} is older than the screen it shows. Replace it if the screen looks different.`);
      return { ...shot, outdated, imageDate: img?.date ?? null, screenDate: ui?.date ?? null };
    });
    if (edit && shown.edited.stale)
      add('warning', a.slug, 'edit', 'You edited this article on the dashboard, and the automatic version changed since. Your edit is still the one shown: compare and keep or drop it.');
    const history = (git(['log', '-15', '--format=%H|%cI|%s', '--', a.path]) ?? '')
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [sha, date, ...msg] = l.split('|');
        return { sha, date, message: msg.join('|') };
      });
    return {
      slug: a.slug,
      title: a.title,
      summary: a.summary,
      category: a.category,
      order: a.order,
      release: a.release,
      updated: a.updated,
      visibility: vis,
      review: a.review,
      draft: a.draft,
      hash: a.hash,
      sources: a.sources,
      related: a.related,
      text: readFileSync(join(ROOT, a.path), 'utf8'),
      edit: edit ? { id: edit.id, updatedAt: edit.updated_at, stale: shown.edited.stale } : null,
      stale: !!stale && changedSince.length > 0,
      changedSince,
      screenshots: shots,
      history,
    };
  });

  report = {
    generatedAt: new Date().toISOString(),
    commit: head,
    release: {
      publicVersion: release.publicVersion,
      live: release.live,
      prelaunch: release.prelaunch,
      notice: release.notice,
      apple: release.apple,
      versions: help.release.versions,
      unreleased: help.release.unreleased,
    },
    editsError,
    categories: help.categories,
    articles,
    uncovered,
    changelog: help.changelog.slice(0, 200),
    issues,
  };
}

/* ---------------------------------------------------------------------------------------------
 * Report
 * ------------------------------------------------------------------------------------------- */
const errors = issues.filter((i) => i.level === 'error');
const warnings = issues.filter((i) => i.level === 'warning');
const line = (i) => `${i.level === 'error' ? '✗' : '!'} ${i.slug ? `[${i.slug}] ` : ''}${i.message}`;
for (const i of [...errors, ...warnings]) console.log(line(i));
console.log(`\nHelp Center: ${help.articles.length} articles, ${errors.length} errors, ${warnings.length} warnings${changed ? `, ${changed.length} files in this change` : ''}.`);

if (process.env.GITHUB_STEP_SUMMARY) {
  const md = [
    `### Help Center check`,
    `${help.articles.length} articles · ${errors.length} errors · ${warnings.length} warnings`,
    '',
    ...[...errors, ...warnings].map((i) => `- ${i.level === 'error' ? '❌' : '⚠️'} ${i.slug ? `**${i.slug}**: ` : ''}${i.message}`),
    errors.length ? '\nHow to fix: see help/README.md ("When the check fails").' : '',
  ].join('\n');
  writeFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n', { flag: 'a' });
}
if (report) {
  writeFileSync(auditOut, JSON.stringify(report, null, 1));
  console.log(`Audit report written to ${auditOut}`);
}
process.exit(errors.length && !auditOut ? 1 : 0);
