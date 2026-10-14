// Reads docs/feature-parity.md (the feature-parity tracker, CLAUDE.md Rule 8) and works out what
// a change touched. No dependencies: runs on the bare Node that GitHub Actions provides.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const TRACKER = 'docs/feature-parity.md';

export const MARKS = ['✅', '🟡', '🔨', '⬜', '➖'];
export const MARK_NAMES = { '✅': 'verified', '🟡': 'shared, untested', '🔨': 'in progress', '⬜': 'missing', '➖': 'not applicable' };
// Columns of the Features table that must start with a mark. Release and Notes are free text.
export const MARK_COLUMNS = ['iPhone', 'iPad', 'Android Phone', 'Android Tablet', 'Backend', 'Admin', 'Docs'];

// Code that riders, the backend or the Admin Dashboard depend on. A pull request that changes any
// of it changes a feature, so it updates the tracker (or says why it doesn't, see PARITY_OPT_OUT).
const FEATURE_CODE = [
  /^app\/src\/(app|components|core|lib|hooks|constants)\//,
  /^app\/modules\//,
  /^app\/plugins\//,
  /^app\/app\.json$/,
  /^supabase\/migrations\//,
  /^supabase\/functions\//,
];
const NOT_FEATURE_CODE = [/(^|\/)__tests__\//, /\.test\.[cm]?[jt]sx?$/];

export const isFeatureCode = (path) =>
  FEATURE_CODE.some((re) => re.test(path)) && !NOT_FEATURE_CODE.some((re) => re.test(path));

// A line like "Parity: no feature change (refactor of the map hook)" in the pull request
// description or a commit message lets a change through without a tracker edit.
export const PARITY_OPT_OUT = /^\s*parity:\s*(none|n\/a|no (feature )?change)\b.*$/im;

export const git = (...args) =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'pipe'] }).trim();

export const changedFiles = (base) => {
  const out = git('diff', '--name-only', `${base}...HEAD`);
  return out ? out.split('\n') : [];
};

const splitRow = (line) => {
  const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  return cells;
};

// Every Markdown table in the tracker, keyed by the "## " heading above it.
export function parseTables(markdown) {
  const tables = {};
  let heading = '';
  const lines = markdown.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) { heading = h[1]; continue; }
    if (!line.trim().startsWith('|') || tables[heading]) continue;
    // A table starts with a header row and a |---| separator row.
    if (!/^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? '')) continue;
    const header = splitRow(line);
    const rows = [];
    let j = i + 2;
    for (; j < lines.length && lines[j].trim().startsWith('|'); j++) {
      rows.push({ line: j + 1, cells: splitRow(lines[j]) });
    }
    tables[heading] = { header, rows, line: i + 1 };
    i = j - 1;
  }
  return tables;
}

export const markOf = (cell) => MARKS.find((m) => cell.startsWith(m)) ?? null;

// Parses the tracker and checks its shape. Returns { features, foundations, exceptions, errors }.
export function readTracker(markdown) {
  const errors = [];
  const tables = parseTables(markdown);
  const need = (name) => {
    if (!tables[name]) errors.push(`${TRACKER}: the "## ${name}" table is missing.`);
    return tables[name] ?? { header: [], rows: [] };
  };
  const feat = need('Features');
  const found = need('Device Foundations');
  const exc = need('Exceptions');

  for (const col of ['ID', 'Feature', ...MARK_COLUMNS, 'Release', 'Notes']) {
    if (tables.Features && !feat.header.includes(col)) errors.push(`${TRACKER}: the Features table has no "${col}" column.`);
  }

  const seen = new Map();
  const toObjects = (table, kind) => table.rows.map(({ line, cells }) => {
    if (cells.length !== table.header.length) {
      errors.push(`${TRACKER}:${line}: ${kind} row has ${cells.length} cells, the header has ${table.header.length}.`);
    }
    const row = Object.fromEntries(table.header.map((h, k) => [h, cells[k] ?? '']));
    row.line = line;
    const id = row.ID;
    if (!id) errors.push(`${TRACKER}:${line}: ${kind} row has no ID.`);
    else if (seen.has(id)) errors.push(`${TRACKER}:${line}: ID ${id} is used twice (also line ${seen.get(id)}).`);
    else seen.set(id, line);
    return row;
  });

  const features = toObjects(feat, 'Features');
  for (const row of features) {
    for (const col of MARK_COLUMNS) {
      if (!(col in row)) continue;
      if (!markOf(row[col])) {
        errors.push(`${TRACKER}:${row.line}: ${row.ID} "${col}" is "${row[col]}"; it must start with one of ${MARKS.join(' ')}.`);
      }
    }
  }
  const foundations = toObjects(found, 'Device Foundations');
  for (const row of foundations) {
    if ('State' in row && !markOf(row.State)) {
      errors.push(`${TRACKER}:${row.line}: ${row.ID} State is "${row.State}"; it must start with one of ${MARKS.join(' ')}.`);
    }
  }
  const exceptions = toObjects(exc, 'Exceptions');
  return { features, foundations, exceptions, errors };
}

export const readTrackerAt = (ref) => {
  try {
    return ref ? git('show', `${ref}:${TRACKER}`) : readFileSync(join(ROOT, TRACKER), 'utf8');
  } catch {
    return null;
  }
};

// Which rows a change edited, comparing the tracker before and after.
export function changedRows(before, after) {
  const key = (r) => JSON.stringify({ ...r, line: undefined });
  const old = new Map([...before.features, ...before.foundations].map((r) => [r.ID, key(r)]));
  return [...after.features, ...after.foundations].filter((r) => old.get(r.ID) !== key(r));
}

// Per-column counts and the IDs still short of ✅ (or ➖) on each device and layer.
export function gapReport(tracker) {
  const columns = {};
  for (const col of MARK_COLUMNS) {
    const counts = Object.fromEntries(MARKS.map((m) => [m, 0]));
    const open = [];
    for (const row of tracker.features) {
      const m = markOf(row[col] ?? '');
      if (!m) continue;
      counts[m]++;
      if (m !== '✅' && m !== '➖') open.push({ id: row.ID, feature: row.Feature, mark: m });
    }
    columns[col] = { counts, open };
  }
  const foundations = tracker.foundations
    .filter((r) => !['✅', '➖'].includes(markOf(r.State ?? '')))
    .map((r) => ({ id: r.ID, item: r.Item, mark: markOf(r.State ?? ''), notes: r.Notes ?? '' }));
  return { features: tracker.features.length, columns, foundations };
}

export function gapMarkdown(report, title = 'Feature parity gaps') {
  const out = [`## ${title}`, ''];
  out.push(`${report.features} features tracked in \`${TRACKER}\`. ✅ verified · 🟡 shared, untested · 🔨 in progress · ⬜ missing · ➖ not applicable.`, '');
  out.push('| Column | ✅ | 🟡 | 🔨 | ⬜ | ➖ |', '|---|---|---|---|---|---|');
  for (const [col, { counts }] of Object.entries(report.columns)) {
    out.push(`| ${col} | ${MARKS.map((m) => counts[m]).join(' | ')} |`);
  }
  out.push('');
  for (const [col, { open }] of Object.entries(report.columns)) {
    if (!open.length) continue;
    const missing = open.filter((o) => o.mark === '⬜' || o.mark === '🔨');
    const untested = open.filter((o) => o.mark === '🟡');
    out.push(`**${col}**`);
    if (missing.length) out.push(`- Missing or in progress: ${missing.map((o) => `${o.mark} ${o.id} ${o.feature}`).join('; ')}`);
    if (untested.length) out.push(`- Untested on this device: ${untested.map((o) => o.id).join(', ')}`);
    out.push('');
  }
  if (report.foundations.length) {
    out.push('**Device foundations not done**', '');
    for (const f of report.foundations) out.push(`- ${f.mark ?? '?'} ${f.id} ${f.item}`);
    out.push('');
  }
  return out.join('\n');
}
