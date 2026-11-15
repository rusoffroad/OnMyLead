// What one "Update server" run puts live (.github/workflows/server.yml, docs/server-updates.md).
// Pure functions so the rules are tested (lib.test.mjs); plan.mjs feeds them git and the disk.

export const FUNCTIONS_DIR = 'supabase/functions/';
export const MIGRATIONS_DIR = 'supabase/migrations/';

// Folders under supabase/functions that are shared code, not functions of their own.
export const isSharedDir = (name) => name.startsWith('_');

// A function turns JWT verification off only when its own "// Deploy:" line says so
// (e.g. webhooks from Apple, Google and the database). Anything else keeps it on, the safe default.
export const noVerifyJwt = (source) =>
  source.split('\n').some((line) => /^\s*\/\/\s*Deploy:.*--no-verify-jwt\b/.test(line));

// `changes` is `git diff --name-status` output as [{ status, path }], or null on the first run
// (nothing has been put live by this workflow yet).
export function planFunctions(changes, allFunctions) {
  if (changes === null) return [...allFunctions].sort();
  const names = new Set();
  for (const { path } of changes) {
    if (!path.startsWith(FUNCTIONS_DIR)) continue;
    const dir = path.slice(FUNCTIONS_DIR.length).split('/')[0];
    if (isSharedDir(dir)) return [...allFunctions].sort(); // shared code: every function bundles it
    names.add(dir);
  }
  // A function folder that was deleted isn't redeployed (and never deleted from the server here).
  return [...names].filter((n) => allFunctions.includes(n)).sort();
}

export function planMigrations(changes) {
  if (changes === null) return { push: true, added: [], edited: [] };
  const sql = changes.filter((c) => c.path.startsWith(MIGRATIONS_DIR) && c.path.endsWith('.sql'));
  const added = sql.filter((c) => c.status.startsWith('A')).map((c) => c.path.slice(MIGRATIONS_DIR.length));
  // Editing a migration that already ran does nothing on the server, so it's called out.
  const edited = sql.filter((c) => !c.status.startsWith('A') && !c.status.startsWith('D')).map((c) => c.path.slice(MIGRATIONS_DIR.length));
  return { push: added.length > 0, added: added.sort(), edited: edited.sort() };
}

// The website build differs from what's live in more than its build time and sitemap dates.
export const WEB_IGNORE = ['help/status.json', 'sitemap.xml'];
export const websiteChanged = (diffPaths) => diffPaths.some((p) => p && !WEB_IGNORE.includes(p));

export function parseNameStatus(text) {
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('\t');
      // Renames and copies list "R100<TAB>old<TAB>new": the new path is what's on disk.
      return { status: parts[0], path: parts[parts.length - 1] };
    });
}

export function summary({ migrations, functions, website, first }) {
  const lines = ['## What this update puts live', ''];
  if (first) lines.push('_First run: no earlier update recorded, so every function is redeployed and the database gets any migrations it is missing._', '');
  lines.push(
    migrations.push
      ? `- **Database:** ${migrations.added.length ? migrations.added.map((m) => `\`${m}\``).join(', ') : 'any migrations the live database is missing'}`
      : '- **Database:** no new migrations',
  );
  if (migrations.edited.length)
    lines.push(`- **Note:** ${migrations.edited.map((m) => `\`${m}\``).join(', ')} changed after it was added; a migration that already ran is not run again.`);
  lines.push(
    functions.length
      ? `- **Server functions:** ${functions.map((f) => `\`${f.name}\`${f.noVerifyJwt ? ' (no JWT check)' : ''}`).join(', ')}`
      : '- **Server functions:** no changes',
  );
  lines.push(website ? '- **Website:** the newest web build' : '- **Website:** no changes');
  return lines.join('\n') + '\n';
}
