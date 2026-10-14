// Guards the native setup rules in CLAUDE.md that a build would otherwise only break on the Mac:
//   - ios/, android/, .env files, keystores, service-account keys and google-services.json with
//     secrets are never committed;
//   - config plugins with-scene-lifecycle and with-push-entitlement stay before expo-notifications;
//   - CarPlay stays off in app.json (it is turned on per build with ONMYLEAD_CARPLAY=1);
//   - both apps keep the same identifier, com.rusoffroad.onmylead.app.
// Usage: node scripts/ci/check-config.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ID = 'com.rusoffroad.onmylead.app';
const errors = [];

const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
const forbidden = [
  [/^app\/(ios|android)\//, 'generated native folder (prebuild makes it; configure app.json and plugins instead)'],
  [/(^|\/)\.env(\.[^/]*)?$/, 'environment file with keys'],
  [/\.(jks|keystore|p8|p12|mobileprovision)$/, 'signing key or certificate'],
  [/(^|\/)google-services\.json$/, 'Firebase config (keep it out of the public repo)'],
  [/(^|\/)GoogleService-Info\.plist$/, 'Firebase config (keep it out of the public repo)'],
  [/service[-_]?account[^/]*\.json$/i, 'service-account key'],
];
for (const file of tracked) {
  if (/\.env\.example$/.test(file)) continue;
  for (const [re, why] of forbidden) if (re.test(file)) errors.push(`${file} is committed: ${why}. Remove it from git.`);
}

const app = JSON.parse(readFileSync(join(ROOT, 'app/app.json'), 'utf8')).expo;
const plugins = (app.plugins ?? []).map((p) => (Array.isArray(p) ? p : [p, {}]));
const at = (name) => plugins.findIndex(([n]) => n === name);
const notifications = at('expo-notifications');
for (const name of ['./plugins/with-scene-lifecycle', './plugins/with-push-entitlement']) {
  const i = at(name);
  if (i < 0) errors.push(`app.json: plugin ${name} is missing.`);
  else if (notifications >= 0 && i > notifications) errors.push(`app.json: ${name} must stay before expo-notifications.`);
}
const carplay = plugins.find(([n]) => n === './plugins/with-carplay');
if (carplay?.[1]?.enabled) errors.push('app.json: with-carplay is enabled. CarPlay stays off until Apple grants the entitlement (build with ONMYLEAD_CARPLAY=1 instead).');
if (app.ios?.bundleIdentifier !== ID) errors.push(`app.json: ios.bundleIdentifier must stay ${ID}.`);
if (app.android?.package !== ID) errors.push(`app.json: android.package must stay ${ID}.`);

for (const e of errors) console.log(process.env.GITHUB_ACTIONS ? `::error::${e}` : `ERROR: ${e}`);
if (errors.length) process.exit(1);
console.log(`Native config rules hold (${tracked.length} tracked files, ${plugins.length} plugins).`);
