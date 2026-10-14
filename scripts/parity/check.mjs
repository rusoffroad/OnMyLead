// The feature-parity check (CLAUDE.md Rule 8, docs/feature-parity.md).
//
//   node scripts/parity/check.mjs --base origin/main          what CI runs on a pull request
//   node scripts/parity/check.mjs --report out/               gap report (report.json + report.md)
//
// Pull request mode fails when:
//   - the tracker is malformed (bad marks, duplicate IDs, missing columns), or
//   - the change edits feature code (screens, components, core rules, native modules, config
//     plugins, app.json, migrations, edge functions) without editing a tracker row, unless the
//     pull request description or a commit message has a line like
//     "Parity: no feature change (why)".
// It warns (never fails) about 🔨 or ⬜ rows this change edited that link no issue or pull request.
// Set PR_BODY to the pull request description. Writes a summary to $GITHUB_STEP_SUMMARY if set.
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MARK_COLUMNS, PARITY_OPT_OUT, TRACKER, changedFiles, changedRows, gapMarkdown, gapReport, git,
  isFeatureCode, markOf, readTracker, readTrackerAt,
} from './lib.mjs';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const base = opt('--base');
const reportDir = opt('--report');

const errors = [];
const warnings = [];
const summary = [];
const gh = !!process.env.GITHUB_ACTIONS;
const annotate = (kind, msg) => console.log(gh ? `::${kind}::${msg.replace(/\n/g, '%0A')}` : `${kind.toUpperCase()}: ${msg}`);

const source = readTrackerAt();
if (source == null) {
  console.error(`${TRACKER} is missing. It is the feature-parity tracker (CLAUDE.md Rule 8); restore it.`);
  process.exit(1);
}
const tracker = readTracker(source);
errors.push(...tracker.errors);
const report = gapReport(tracker);

if (base) {
  const files = changedFiles(base);
  const feature = files.filter(isFeatureCode);
  const trackerTouched = files.includes(TRACKER);
  const beforeSource = readTrackerAt(git('merge-base', base, 'HEAD'));
  const edited = beforeSource ? changedRows(readTracker(beforeSource), tracker) : [...tracker.features, ...tracker.foundations];

  const messages = git('log', '--format=%B', `${base}..HEAD`);
  const optOut = PARITY_OPT_OUT.exec(process.env.PR_BODY ?? '') ?? PARITY_OPT_OUT.exec(messages);

  if (feature.length && !edited.length) {
    if (optOut) {
      summary.push(`Feature code changed without a tracker edit; allowed by "${optOut[0].trim()}".`);
    } else {
      const shown = feature.slice(0, 15).map((f) => `  - ${f}`).join('\n');
      const more = feature.length > 15 ? `\n  - and ${feature.length - 15} more` : '';
      errors.push(
        `This pull request changes feature code but no row of ${TRACKER}:\n${shown}${more}\n` +
        `Update the row of each feature it adds, changes or removes (or add a row), with the honest state for ` +
        `iPhone, iPad, Android Phone, Android Tablet, Backend, Admin and Docs (CLAUDE.md Rule 8). ` +
        `If no feature changes (a refactor, a test, a comment), add a line "Parity: no feature change (reason)" ` +
        `to the pull request description or a commit message.` +
        (trackerTouched ? ' (The tracker file changed, but no feature or foundation row did.)' : ''),
      );
    }
  }

  // A brand-new tracker edits every row; only nag about rows a later change touches.
  for (const row of beforeSource ? edited : []) {
    const cells = row.State !== undefined ? [row.State] : MARK_COLUMNS.map((c) => row[c] ?? '');
    const open = cells.some((c) => ['🔨', '⬜'].includes(markOf(c)));
    if (open && !/#\d+|github\.com\/[^ )]+\/(issues|pull)\/\d+/.test(row.Notes ?? '')) {
      warnings.push(`${TRACKER}:${row.line}: ${row.ID} has 🔨 or ⬜ cells; link its GitHub issue or pull request in Notes (CLAUDE.md Rule 8).`);
    }
  }

  summary.unshift(
    `## Feature parity check`, '',
    `${files.length} files changed, ${feature.length} of them feature code. Tracker rows edited: ${edited.map((r) => r.ID).join(', ') || 'none'}.`, '',
  );
}

if (reportDir) {
  mkdirSync(reportDir, { recursive: true });
  // Drift: commits to feature code since the tracker last changed.
  let drift = [];
  try {
    const since = git('log', '-1', '--format=%H', '--', TRACKER);
    if (since) {
      const log = git('log', '--format=%h%x09%cs%x09%s', '--name-only', `${since}..HEAD`);
      let cur = null;
      for (const line of log.split('\n')) {
        if (/^[0-9a-f]{7,}\t/.test(line)) {
          const [sha, date, subject] = line.split('\t');
          cur = { sha, date, subject, feature: false };
          drift.push(cur);
        } else if (line && cur && isFeatureCode(line)) cur.feature = true;
      }
      drift = drift.filter((c) => c.feature).map(({ feature, ...c }) => c);
    }
  } catch { /* shallow clone: no history, no drift section */ }

  const md = [gapMarkdown(report)];
  if (drift.length) {
    md.push('## Feature changes since the tracker was last edited', '');
    md.push('Each of these merged commits changed feature code after the last edit to the tracker. Check their rows.', '');
    for (const c of drift) md.push(`- ${c.sha} ${c.date} ${c.subject}`);
    md.push('');
  }
  if (tracker.errors.length) md.push('## Tracker problems', '', ...tracker.errors.map((e) => `- ${e}`), '');
  writeFileSync(join(reportDir, 'report.md'), md.join('\n'));
  writeFileSync(join(reportDir, 'report.json'), JSON.stringify({
    generated: new Date().toISOString(),
    commit: git('rev-parse', 'HEAD'),
    ...report,
    drift,
    errors: tracker.errors,
  }, null, 2) + '\n');
  console.log(`Wrote ${join(reportDir, 'report.md')} and report.json.`);
}

summary.push(gapMarkdown(report, 'Rows still incomplete per device'));
for (const w of warnings) annotate('warning', w);
for (const e of errors) annotate('error', e);
if (process.env.GITHUB_STEP_SUMMARY) {
  const head = errors.length ? ['### ❌ Problems', '', ...errors.map((e) => `- ${e.replace(/\n/g, '\n  ')}`), ''] : [];
  const warn = warnings.length ? ['### Warnings', '', ...warnings.map((w) => `- ${w}`), ''] : [];
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, [...head, ...warn, ...summary, ''].join('\n'));
} else if (!reportDir) {
  console.log(summary.join('\n'));
}
if (errors.length) {
  console.error(`\nFeature parity check failed: ${errors.length} problem(s).`);
  process.exit(1);
}
console.log(base ? 'Feature parity check passed.' : 'Tracker is well formed.');
