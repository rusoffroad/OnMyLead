// Tests for the Android push sender: message shape, channels, error handling and the signed token.
// Run: deno test --no-config -A supabase/functions/_shared/fcm_test.ts
// (also runs under Node 22: node supabase/functions/_shared/fcm_test.ts)
import assert from 'node:assert/strict';

import { channelFor, fcmMessage, fcmOutcome, readServiceAccount, serviceAccountJwt } from './fcm.ts';

// deno-lint-ignore no-explicit-any
const g = globalThis as any;
const test: (name: string, fn: () => void | Promise<void>) => void = g.Deno?.test ?? (async (name, fn) => {
  await fn();
  console.log('ok', name);
});

test('data-only message in the format expo-notifications reads', () => {
  const m = fcmMessage({ token: 'tok', title: 'Ride', body: 'Hi', data: { type: 'message', rideId: 'r1' }, channelId: 'ride-chat', tag: 'x'.repeat(80) });
  assert.equal(m.message.token, 'tok');
  assert.equal(m.message.android.priority, 'HIGH');
  assert.deepEqual(JSON.parse(m.message.data.body), { type: 'message', rideId: 'r1' });
  assert.equal(m.message.data.title, 'Ride');
  assert.equal(m.message.data.message, 'Hi');
  assert.equal(m.message.data.channelId, 'ride-chat');
  assert.equal(m.message.data.tag.length, 64);
  assert.ok(Object.values(m.message.data).every((v) => typeof v === 'string'));
  assert.equal('tag' in fcmMessage({ token: 't', title: '', body: '', data: {}, channelId: 'c' }).message.data, false);
});

test('channels follow the push type', () => {
  assert.equal(channelFor('status'), 'ride-alerts');
  assert.equal(channelFor('cancelled'), 'ride-alerts');
  assert.equal(channelFor('message'), 'ride-chat');
  assert.equal(channelFor('group_message'), 'ride-chat');
  assert.equal(channelFor('ride'), 'ride-updates');
  assert.equal(channelFor(undefined), 'ride-updates');
});

test('dead tokens are removed, other errors are not', () => {
  assert.equal(fcmOutcome(200, null), 'ok');
  assert.equal(fcmOutcome(404, { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }), 'gone');
  assert.equal(fcmOutcome(400, { error: { status: 'INVALID_ARGUMENT', message: 'The registration token is not a valid FCM registration token' } }), 'gone');
  assert.equal(fcmOutcome(400, { error: { status: 'INVALID_ARGUMENT', message: 'Invalid JSON payload' } }), 'failed');
  assert.equal(fcmOutcome(429, { error: { status: 'RESOURCE_EXHAUSTED' } }), 'failed');
  assert.equal(fcmOutcome(503, {}), 'failed');
});

test('service account parsing', () => {
  assert.equal(readServiceAccount(''), null);
  assert.equal(readServiceAccount('{bad'), null);
  assert.equal(readServiceAccount('{"client_email":"a"}'), null);
  assert.deepEqual(readServiceAccount('{"client_email":"a@b","private_key":"k","project_id":"p","type":"service_account"}'), { client_email: 'a@b', private_key: 'k', project_id: 'p' });
});

test('signed token verifies with the service account key', async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const b64 = btoa(String.fromCharCode(...pkcs8)).replace(/(.{64})/g, '$1\n');
  const pem = `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n`;
  const jwt = await serviceAccountJwt({ client_email: 'push@p.iam.gserviceaccount.com', private_key: pem, project_id: 'p' }, 1_000);
  const [h, p, s] = jwt.split('.');
  const dec = (x: string) => Uint8Array.from(atob(x.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  assert.deepEqual(JSON.parse(new TextDecoder().decode(dec(h))), { alg: 'RS256', typ: 'JWT' });
  const claims = JSON.parse(new TextDecoder().decode(dec(p)));
  assert.equal(claims.iss, 'push@p.iam.gserviceaccount.com');
  assert.equal(claims.aud, 'https://oauth2.googleapis.com/token');
  assert.equal(claims.scope, 'https://www.googleapis.com/auth/firebase.messaging');
  assert.equal(claims.exp - claims.iat, 3600);
  assert.ok(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', pair.publicKey, dec(s), new TextEncoder().encode(`${h}.${p}`)));
});
