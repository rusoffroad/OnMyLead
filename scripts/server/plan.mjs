// Works out what the "Update server" workflow should put live, from git alone (no secrets).
//   node scripts/server/plan.mjs <commit> <last-live-commit or ""> <web-build ref> <web-live ref or "">
// Writes `migrations`, `functions` (JSON), `website`, `web_sha` and `anything` to $GITHUB_OUTPUT
// and a readable list to $GITHUB_STEP_SUMMARY.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { FUNCTIONS_DIR, isSharedDir, noVerifyJwt, parseNameStatus, planFunctions, planMigrations, summary, websiteChanged } from './lib.mjs';

const [head, base, webBuild, webLive] = process.argv.slice(2);
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 << 20 }).trim();

const allFunctions = readdirSync(FUNCTIONS_DIR).filter(
  (n) => !isSharedDir(n) && statSync(join(FUNCTIONS_DIR, n)).isDirectory() && existsSync(join(FUNCTIONS_DIR, n, 'index.ts')),
);
const first = !base;
const changes = first ? null : parseNameStatus(git('diff', '--name-status', base, head, '--', 'supabase/'));
const migrations = planMigrations(changes);
const functions = planFunctions(changes, allFunctions).map((name) => ({
  name,
  noVerifyJwt: noVerifyJwt(readFileSync(join(FUNCTIONS_DIR, name, 'index.ts'), 'utf8')),
}));
const webSha = git('rev-parse', webBuild);
const website = !webLive || websiteChanged(git('diff', '--name-only', webLive, webSha).split('\n'));

const text = summary({ migrations, functions, website, first });
console.log(text);
const out = {
  migrations: String(migrations.push),
  functions: JSON.stringify(functions),
  website: String(website),
  web_sha: webSha,
  anything: String(migrations.push || functions.length > 0 || website),
};
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(out).map(([k, v]) => `${k}=${v}\n`).join(''));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
