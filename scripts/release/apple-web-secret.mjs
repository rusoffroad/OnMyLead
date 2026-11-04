#!/usr/bin/env node
// Makes the "Secret Key (for OAuth)" that Supabase's Apple provider needs for Sign in with Apple
// on the website and Android (docs/web-sign-in-with-apple.md). It is a JWT signed with the Sign in
// with Apple key (.p8) from the Apple Developer site, good for 6 months (Apple's maximum), so run
// it again before it expires and paste the new one into Supabase.
//
//   node scripts/release/apple-web-secret.mjs ~/keys/AuthKey_ABC123DEFG.p8 ABC123DEFG com.rusoffroad.onmylead.web
//
// Arguments: the .p8 file, its Key ID, and the Services ID. The Team ID defaults to RUS Offroad's.
// Nothing is written anywhere: the secret is printed once for pasting. Never commit it.
import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const [keyPath, keyId, servicesId, teamId = 'YJ4KUF2QQV'] = process.argv.slice(2);
if (!keyPath || !keyId || !servicesId) {
  console.error('Usage: node scripts/release/apple-web-secret.mjs <AuthKey.p8> <Key ID> <Services ID> [Team ID]');
  process.exit(1);
}

const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const exp = now + 180 * 24 * 60 * 60 - 60; // 6 months, less a minute so Apple never sees it as too long
const header = b64({ alg: 'ES256', kid: keyId });
const payload = b64({ iss: teamId, iat: now, exp, aud: 'https://appleid.apple.com', sub: servicesId });
const key = createPrivateKey(readFileSync(keyPath));
// Apple wants the raw r||s signature (JOSE), not DER.
const signature = sign('sha256', Buffer.from(`${header}.${payload}`), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');

console.log(`${header}.${payload}.${signature}`);
console.error(`\nPaste this into Supabase > Authentication > Providers > Apple > Secret Key (for OAuth). It expires ${new Date(exp * 1000).toDateString()}; run this again before then.`);
