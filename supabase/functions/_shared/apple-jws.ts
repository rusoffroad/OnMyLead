// Checks Apple's signature on StoreKit 2 data (transactions, renewal info, App Store Server
// Notifications), the same way Apple's own server library does, but on Web Crypto so it runs in
// Supabase's Deno edge runtime. (@apple/app-store-server-library can't verify here: Deno's
// node:crypto X509Certificate lacks the parts it needs.)
//
// A JWS is accepted only when:
//   - it is ES256 with a three-certificate chain in its x5c header,
//   - the intermediate is signed by one of Apple's root certificates built into this code (the
//     root in the header is ignored), the leaf by the intermediate, and the intermediate is a CA,
//   - the leaf and intermediate carry Apple's App Store marker extensions,
//   - every certificate was valid when Apple signed the data (its signedDate), and
//   - the signature over header.payload checks out with the leaf's key.
// Apple's library can also ask Apple's OCSP server whether a certificate was revoked; this one
// doesn't, which is the same as the library with online checks off.
import 'npm:reflect-metadata@0.2.2';
import { BasicConstraintsExtension, X509Certificate } from 'npm:@peculiar/x509@2.0.0';

const LEAF_OID = '1.2.840.113635.100.6.11.1';
const INTERMEDIATE_OID = '1.2.840.113635.100.6.2.1';

export class JwsError extends Error {}

const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const fromB64Url = (s: string) =>
  fromB64(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '='));
const json = (bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(bytes));

export const certificate = (der: Uint8Array) =>
  new X509Certificate(der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength) as ArrayBuffer);

export async function verifyAppleJws(jws: string, roots: X509Certificate[]): Promise<Record<string, unknown>> {
  const parts = jws.split('.');
  if (parts.length !== 3) throw new JwsError('not a JWS');
  let header, payload;
  try {
    header = json(fromB64Url(parts[0]));
    payload = json(fromB64Url(parts[1]));
  } catch {
    throw new JwsError('unreadable JWS');
  }
  if (header?.alg !== 'ES256') throw new JwsError('not ES256');
  if (!Array.isArray(header.x5c) || header.x5c.length !== 3) throw new JwsError('bad certificate chain length');
  if (!payload || typeof payload !== 'object') throw new JwsError('no payload');

  let leaf: X509Certificate, intermediate: X509Certificate;
  try {
    leaf = certificate(fromB64(header.x5c[0]));
    intermediate = certificate(fromB64(header.x5c[1]));
  } catch {
    throw new JwsError('unreadable certificate');
  }

  let root: X509Certificate | undefined;
  for (const r of roots) {
    if (intermediate.issuer === r.subject && (await intermediate.verify({ publicKey: r.publicKey, signatureOnly: true }))) root = r;
  }
  if (!root) throw new JwsError('not signed by an Apple root');
  if (leaf.issuer !== intermediate.subject || !(await leaf.verify({ publicKey: intermediate.publicKey, signatureOnly: true }))) {
    throw new JwsError('leaf not signed by the intermediate');
  }
  if (!intermediate.getExtension(BasicConstraintsExtension)?.ca) throw new JwsError('intermediate is not a CA');
  if (!leaf.getExtension(LEAF_OID) || !intermediate.getExtension(INTERMEDIATE_OID)) throw new JwsError('not an App Store certificate');

  const signed = typeof payload.signedDate === 'number' ? payload.signedDate : Date.now();
  for (const c of [leaf, intermediate, root]) {
    if (signed < c.notBefore.getTime() || signed > c.notAfter.getTime()) throw new JwsError('certificate not valid at signing time');
  }

  const key = await leaf.publicKey.export({ name: 'ECDSA', namedCurve: 'P-256' }, ['verify']);
  const ok = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    fromB64Url(parts[2]) as BufferSource,
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!ok) throw new JwsError('bad signature');
  return payload;
}
