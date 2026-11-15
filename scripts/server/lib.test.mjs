// Run with: node --test 'scripts/**/*.test.mjs'
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { noVerifyJwt, parseNameStatus, planFunctions, planMigrations, summary, websiteChanged } from './lib.mjs';

const all = ['admin-api', 'notify-ride-message', 'play-verify'];

test('only changed functions are redeployed', () => {
  const changes = parseNameStatus('M\tsupabase/functions/play-verify/index.ts\nA\tsupabase/migrations/1_x.sql\n');
  assert.deepEqual(planFunctions(changes, all), ['play-verify']);
});

test('shared code or a first run redeploys every function', () => {
  assert.deepEqual(planFunctions(parseNameStatus('M\tsupabase/functions/_shared/fcm.ts'), all), all);
  assert.deepEqual(planFunctions(null, all), all);
});

test('a deleted function is not deployed', () => {
  assert.deepEqual(planFunctions(parseNameStatus('D\tsupabase/functions/gone/index.ts'), all), []);
});

test('renames use the new path', () => {
  assert.deepEqual(parseNameStatus('R100\tsupabase/functions/a/x.ts\tsupabase/functions/admin-api/x.ts'), [
    { status: 'R100', path: 'supabase/functions/admin-api/x.ts' },
  ]);
});

test('new migrations push; edited ones are only called out', () => {
  const m = planMigrations(parseNameStatus('A\tsupabase/migrations/2_b.sql\nM\tsupabase/migrations/1_a.sql\nM\tsupabase/tests/t.sql'));
  assert.deepEqual(m, { push: true, added: ['2_b.sql'], edited: ['1_a.sql'] });
  assert.equal(planMigrations(parseNameStatus('M\tsupabase/migrations/1_a.sql')).push, false);
  assert.equal(planMigrations(null).push, true);
});

test('JWT check is off only where the Deploy line says so', () => {
  assert.equal(noVerifyJwt('// Deploy:  supabase functions deploy x --no-verify-jwt\n'), true);
  assert.equal(noVerifyJwt('// Deploy:  supabase functions deploy x   (JWT verification stays on)\n'), false);
  assert.equal(noVerifyJwt('const s = "--no-verify-jwt";\n'), false);
});

test('every function in the repo has a Deploy line, and the webhooks skip the JWT check', () => {
  const dir = new URL('../../supabase/functions/', import.meta.url);
  const names = readdirSync(dir).filter((n) => !n.startsWith('_') && !n.includes('.'));
  const off = [];
  for (const n of names) {
    const src = readFileSync(new URL(`${n}/index.ts`, dir), 'utf8');
    assert.match(src, /\/\/\s*Deploy:/, `${n}/index.ts needs a "// Deploy:" line (add --no-verify-jwt there if it must skip the JWT check)`);
    if (noVerifyJwt(src)) off.push(n);
  }
  for (const n of ['notify-ride-message', 'ad-conversions', 'appstore-notifications', 'play-notifications', 'contact-form']) assert.ok(off.includes(n), n);
});

test('a rebuild with only a new build time is not a website change', () => {
  assert.equal(websiteChanged(['help/status.json', 'sitemap.xml', '']), false);
  assert.equal(websiteChanged(['help/status.json', 'index.html']), true);
});

test('summary lists each part', () => {
  const s = summary({ migrations: { push: false, added: [], edited: [] }, functions: [{ name: 'ad-conversions', noVerifyJwt: true }], website: true, first: false });
  assert.match(s, /no new migrations/);
  assert.match(s, /`ad-conversions` \(no JWT check\)/);
  assert.match(s, /newest web build/);
});
