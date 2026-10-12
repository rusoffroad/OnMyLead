// Tests for the App Store signature checks, with a made-up certificate chain shaped like Apple's.
// Run: deno test --no-config -A supabase/functions/_shared/apple-jws_test.ts
import 'npm:reflect-metadata@0.2.2';
import {
  BasicConstraintsExtension,
  Extension,
  X509Certificate,
  X509CertificateGenerator,
} from 'npm:@peculiar/x509@2.0.0';

import { certificate, JwsError, verifyAppleJws } from './apple-jws.ts';
import { APPLE_ROOT_CA_G3 } from './apple-root-certs.ts';
import { subscriptionRow } from './appstore-status.ts';

const alg = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' };
const day = 86_400_000;
const now = Date.now();
const NULL = new Uint8Array([5, 0]).buffer; // DER NULL, the value Apple's marker extensions carry

async function cert(name: string, issuer: { name: string; keys: CryptoKeyPair } | null, keys: CryptoKeyPair, ca: boolean, oid?: string, from = now - 30 * day, to = now + 30 * day) {
  return await X509CertificateGenerator.create({
    serialNumber: crypto.randomUUID().replace(/-/g, '').slice(0, 16),
    subject: `CN=${name}`,
    issuer: `CN=${issuer?.name ?? name}`,
    notBefore: new Date(from),
    notAfter: new Date(to),
    signingAlgorithm: alg,
    publicKey: keys.publicKey,
    signingKey: (issuer?.keys ?? keys).privateKey,
    extensions: [new BasicConstraintsExtension(ca, undefined, true), ...(oid ? [new Extension(oid, false, NULL)] : [])],
  });
}

const gen = () => crypto.subtle.generateKey(alg, true, ['sign', 'verify']) as Promise<CryptoKeyPair>;
const rootKeys = await gen();
const interKeys = await gen();
const leafKeys = await gen();
const root = await cert('Test Root', null, rootKeys, true);
const inter = await cert('Test Inter', { name: 'Test Root', keys: rootKeys }, interKeys, true, '1.2.840.113635.100.6.2.1');
const leaf = await cert('Test Leaf', { name: 'Test Inter', keys: interKeys }, leafKeys, false, '1.2.840.113635.100.6.11.1');

const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)));
const b64u = (s: string | ArrayBuffer) =>
  (typeof s === 'string' ? btoa(s) : b64(s)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function sign(payload: object, chain: X509Certificate[] = [leaf, inter, root], key = leafKeys.privateKey, alg = 'ES256') {
  const input = `${b64u(JSON.stringify({ alg, x5c: chain.map((c) => b64(c.rawData)) }))}.${b64u(JSON.stringify(payload))}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(input));
  return `${input}.${b64u(sig)}`;
}

const tx = {
  transactionId: '2000000456',
  originalTransactionId: '2000000123',
  bundleId: 'com.rusoffroad.onmylead.app',
  productId: 'com.rusoffroad.onmylead.pro.monthly',
  expiresDate: now + 30 * day,
  signedDate: now - 1000,
  environment: 'Sandbox',
  appAccountToken: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  price: 4990,
  currency: 'USD',
  offerType: 3,
  offerIdentifier: 'SPRING',
};
const trusted = [certificate(new Uint8Array(root.rawData))];

async function rejects(p: Promise<unknown>, why: string) {
  try {
    await p;
  } catch (e) {
    if (e instanceof JwsError) return;
    throw new Error(`${why}: threw ${e}`);
  }
  throw new Error(`${why}: was accepted`);
}

Deno.test('accepts a correctly signed transaction', async () => {
  const t = await verifyAppleJws(await sign(tx), trusted);
  if (t.productId !== tx.productId || t.appAccountToken !== tx.appAccountToken) throw new Error('payload changed');
  const row = subscriptionRow({ transaction: t as typeof tx, now });
  if (row.status !== 'active' || row.offer_id !== 'SPRING' || row.price_milli !== 4990) throw new Error(JSON.stringify(row));
});

Deno.test('rejects an edited payload', async () => {
  const [h, , s] = (await sign(tx)).split('.');
  await rejects(verifyAppleJws(`${h}.${b64u(JSON.stringify({ ...tx, productId: 'com.rusoffroad.onmylead.pro.annual' }))}.${s}`, trusted), 'edited');
});

Deno.test('rejects a chain that is not rooted in a trusted root', async () => {
  const apple = [certificate(Uint8Array.from(atob(APPLE_ROOT_CA_G3), (c) => c.charCodeAt(0)))];
  await rejects(verifyAppleJws(await sign(tx), apple), 'untrusted root');
});

Deno.test('rejects a leaf without the App Store marker', async () => {
  const plain = await cert('Plain Leaf', { name: 'Test Inter', keys: interKeys }, leafKeys, false);
  await rejects(verifyAppleJws(await sign(tx, [plain, inter, root]), trusted), 'no marker');
});

Deno.test('rejects an intermediate that is not a CA or lacks its marker', async () => {
  const notCa = await cert('Test Inter', { name: 'Test Root', keys: rootKeys }, interKeys, false, '1.2.840.113635.100.6.2.1');
  await rejects(verifyAppleJws(await sign(tx, [leaf, notCa, root]), trusted), 'not a CA');
  const unmarked = await cert('Test Inter', { name: 'Test Root', keys: rootKeys }, interKeys, true);
  await rejects(verifyAppleJws(await sign(tx, [leaf, unmarked, root]), trusted), 'unmarked intermediate');
});

Deno.test('rejects a signature from another key, and a short chain', async () => {
  const other = await gen();
  await rejects(verifyAppleJws(await sign(tx, undefined, other.privateKey), trusted), 'other key');
  await rejects(verifyAppleJws(await sign(tx, [leaf, inter]), trusted), 'short chain');
  await rejects(verifyAppleJws('not.a.jws', trusted), 'garbage');
});

Deno.test('checks certificate dates at the signing time', async () => {
  const old = await cert('Test Leaf', { name: 'Test Inter', keys: interKeys }, leafKeys, false, '1.2.840.113635.100.6.11.1', now - 10 * day, now - 5 * day);
  await rejects(verifyAppleJws(await sign(tx, [old, inter, root]), trusted), 'expired leaf');
  // Signed while the leaf was valid: still accepted after the leaf expired.
  await verifyAppleJws(await sign({ ...tx, signedDate: now - 6 * day }, [old, inter, root]), trusted);
});
