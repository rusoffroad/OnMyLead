import { describe, expect, it } from 'vitest';

import {
  EMERGENCY_RELAY_SEC, MAX_FRAME_BYTES, MAX_HOPS, MAX_REPLY_BYTES, NearbyMesh, POSITION_RELAY_SEC, TAG_WINDOW_SEC,
  canonical, fitReply, fromBase64, fromHex, openFrame, rideTag, riderMac, sealFrame, toBase64, toHex, uploadRow,
  type NearbyItem, type RideKeys,
} from '../nearby';

const RIDE = '11111111-2222-4333-8444-555555555555';
const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';
const C = 'cccccccc-0000-4000-8000-000000000003';
const key = (n: number) => Uint8Array.from({ length: 32 }, (_, i) => (i * 7 + n) & 255);
const keys = (riderKeyN: number, rideKeyN = 1): RideKeys => ({ rideId: RIDE, rideKey: key(rideKeyN), riderKey: key(riderKeyN) });
let counter = 0;
const nonce = () => Uint8Array.from({ length: 12 }, (_, i) => (counter++ * 13 + i) & 255);
const T0 = Date.UTC(2026, 10, 3, 16, 0, 0);
const fix = (at: number, lat = 30.2672, lng = -97.7431) => ({ lat, lng, accuracyM: 6.4, speedMps: 4.2, headingDeg: 271.3, at });

describe('bytes', () => {
  it('round-trips hex and base64', () => {
    const b = Uint8Array.from([0, 1, 127, 128, 254, 255, 9]);
    expect(fromHex(toHex(b))).toEqual(b);
    for (let n = 0; n < 6; n++) expect(fromBase64(toBase64(b.slice(0, n)))).toEqual(b.slice(0, n));
    expect(toBase64(Uint8Array.from([104, 105]))).toBe('aGk=');
  });
});

describe('packets', () => {
  it('seal and open a spot with the ride key', () => {
    const a = new NearbyMesh(keys(2), A);
    const item = a.ownPosition(fix(T0))!;
    const frame = sealFrame(key(1), item, nonce(), T0 / 1000);
    expect(frame.length).toBeLessThan(MAX_FRAME_BYTES);
    const back = openFrame(key(1), frame, T0 / 1000)!;
    expect(back).toEqual(item);
    expect(back.kind === 'position' && back.latE7).toBe(302672000);
    expect(back.kind === 'position' && back.headingDd).toBe(2713);
  });

  it("can't be read with another ride's key, or after a byte changes", () => {
    const a = new NearbyMesh(keys(2), A);
    const frame = sealFrame(key(1), a.ownPosition(fix(T0))!, nonce(), T0 / 1000);
    expect(openFrame(key(9), frame, T0 / 1000)).toBeNull();
    const bad = frame.slice();
    bad[bad.length - 20] ^= 1;
    expect(openFrame(key(1), bad, T0 / 1000)).toBeNull();
    expect(openFrame(key(1), frame.slice(0, 20), T0 / 1000)).toBeNull();
  });

  it('carries no readable rider id, and the ride tag rotates', () => {
    const a = new NearbyMesh(keys(2), A);
    const frame = sealFrame(key(1), a.ownPosition(fix(T0))!, nonce(), T0 / 1000);
    expect(toHex(frame)).not.toContain('aaaaaaaa');
    const now = T0 / 1000;
    expect(rideTag(key(1), now)).toEqual(rideTag(key(1), now + 1));
    expect(rideTag(key(1), now)).not.toEqual(rideTag(key(1), now + TAG_WINDOW_SEC));
    // A packet sealed just before the tag changes still opens just after.
    const late = sealFrame(key(1), a.ownPosition(fix(T0 + 1000))!, nonce(), now + 1);
    expect(openFrame(key(1), late, now + TAG_WINDOW_SEC + 1)).not.toBeNull();
  });

  it('fits the longest quick reply and every status in one write', () => {
    const a = new NearbyMesh(keys(2), A);
    const reply = a.ownReply({ id: C, body: '🙂'.repeat(60), at: T0 });
    expect(new TextEncoder().encode(reply.body).length).toBeLessThanOrEqual(MAX_REPLY_BYTES);
    expect(sealFrame(key(1), reply, nonce(), T0 / 1000).length).toBeLessThanOrEqual(MAX_FRAME_BYTES);
    const st = a.ownStatus({ id: C, status: 'emergency', flags: 1, lat: 30.1, lng: -97.1, at: T0 });
    const back = openFrame(key(1), sealFrame(key(1), st, nonce(), T0 / 1000), T0 / 1000);
    expect(back).toEqual(st);
    expect(fitReply('  On my way  ')).toBe('On my way');
  });

  it('keeps a status without a spot', () => {
    const a = new NearbyMesh(keys(2), A);
    const st = a.ownStatus({ id: C, status: 'ok', lat: null, lng: null, at: T0 });
    expect(openFrame(key(1), sealFrame(key(1), st, nonce(), T0 / 1000), T0 / 1000)).toMatchObject({ latE7: null, lngE7: null });
  });
});

describe('rider code', () => {
  it('covers the canonical text, which the server rebuilds from whole numbers', () => {
    const item = { kind: 'position' as const, userId: A, at: 1793721600, latE7: 302672000, lngE7: -977431000, accuracyM: 6, speedCms: null, headingDd: 2713 };
    expect(canonical(RIDE, item)).toBe(`p|${RIDE}|${A}|302672000|-977431000|6||2713|1793721600`);
    const mac = riderMac(key(2), RIDE, item);
    expect(mac).toMatch(/^[0-9a-f]{32}$/);
    // The same vector is checked in supabase/tests/bluetooth_sharing_test.sql.
    expect(mac).toBe('c12ba602abf58ee3a828b730570a601f');
    expect(riderMac(key(3), RIDE, item)).not.toBe(mac);
    expect(riderMac(key(2), RIDE, { ...item, latE7: 302672001 })).not.toBe(mac);
    const st = { kind: 'status' as const, userId: A, id: C, status: 'emergency' as const, flags: 1, latE7: null, lngE7: 5, at: 9 };
    expect(canonical(RIDE, st)).toBe(`s|${RIDE}|${A}|${C}|emergency|1||5|9`);
  });
});

describe('NearbyMesh', () => {
  it("passes a rider's spot along a line of three phones", () => {
    const a = new NearbyMesh(keys(2), A);
    const b = new NearbyMesh(keys(3), B);
    const c = new NearbyMesh(keys(4), C);
    a.ownPosition(fix(T0));
    for (const f of a.outgoing(T0, nonce)) b.receive(f, T0 + 100);
    expect(b.heardPositions().map((p) => p.userId)).toEqual([A]);
    // C only hears B.
    for (const f of b.outgoing(T0 + 200, nonce)) c.receive(f, T0 + 300);
    const heard = c.heardPositions();
    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({ userId: A, hops: 1 });
  });

  it('keeps only the newest spot per rider and ignores repeats and its own', () => {
    const a = new NearbyMesh(keys(2), A);
    const b = new NearbyMesh(keys(3), B);
    a.ownPosition(fix(T0));
    const first = a.outgoing(T0, nonce)[0];
    expect(b.receive(first, T0)).not.toBeNull();
    expect(b.receive(first, T0)).toBeNull();
    a.ownPosition(fix(T0 + 5000, 30.3));
    expect(b.receive(a.outgoing(T0 + 5000, nonce)[0], T0 + 5000)).not.toBeNull();
    expect(b.receive(first, T0 + 6000)).toBeNull();
    expect(b.heardPositions()[0].latE7).toBe(303000000);
    // A hears its own spot echoed back and drops it.
    expect(a.receive(b.outgoing(T0 + 6000, nonce)[1] ?? b.outgoing(T0 + 6000, nonce)[0], T0 + 6000)).toBeNull();
    expect(a.ownPosition(fix(T0 + 5000))).toBeNull();
  });

  it('stops relaying after MAX_HOPS', () => {
    const phones = Array.from({ length: MAX_HOPS + 3 }, (_, i) =>
      new NearbyMesh(keys(10 + i), `dddddddd-0000-4000-8000-00000000000${i}`));
    phones[0].ownPosition(fix(T0));
    for (let i = 0; i + 1 < phones.length; i++) {
      for (const f of phones[i].outgoing(T0, nonce)) phones[i + 1].receive(f, T0);
    }
    const reached = phones.map((p, i) => (i === 0 ? true : p.heardPositions().length > 0));
    expect(reached).toEqual([true, ...Array(MAX_HOPS + 1).fill(true), false]);
  });

  it('drops old spots, future spots and expired taps', () => {
    const a = new NearbyMesh(keys(2), A);
    const b = new NearbyMesh(keys(3), B);
    a.ownPosition(fix(T0));
    const f = a.outgoing(T0, nonce)[0];
    expect(b.receive(f, T0 + (POSITION_RELAY_SEC + 1) * 1000)).toBeNull();
    expect(b.receive(f, T0 - 10 * 60_000)).toBeNull();
    b.receive(f, T0);
    expect(b.live(T0 + (POSITION_RELAY_SEC + 1) * 1000)).toHaveLength(0);
    const sos = a.ownStatus({ id: C, status: 'emergency', lat: 1, lng: 2, at: T0 });
    expect(a.live(T0 + (EMERGENCY_RELAY_SEC - 60) * 1000).map((i) => i.kind)).toContain('status');
    expect(sos.status).toBe('emergency');
  });

  it('sends emergencies first', () => {
    const a = new NearbyMesh(keys(2), A);
    a.ownPosition(fix(T0));
    a.ownReply({ id: B, body: 'Going slow', at: T0 });
    a.ownStatus({ id: C, status: 'emergency', lat: 1, lng: 2, at: T0 });
    const order = a.live(T0).map((i: NearbyItem) => (i.kind === 'status' ? i.status : i.kind));
    expect(order).toEqual(['emergency', 'position', 'reply']);
  });

  it("uploads only others' spots and taps, once", () => {
    const a = new NearbyMesh(keys(2), A);
    const b = new NearbyMesh(keys(3), B);
    a.ownPosition(fix(T0));
    a.ownStatus({ id: C, status: 'need_fuel', lat: null, lng: null, at: T0 });
    a.ownReply({ id: B, body: 'hi', at: T0 });
    expect(a.pendingUploads()).toHaveLength(0);
    for (const f of a.outgoing(T0, nonce)) b.receive(f, T0);
    const up = b.pendingUploads();
    expect(up.map((i) => i.kind).sort()).toEqual(['position', 'status']);
    expect(uploadRow(up.find((i) => i.kind === 'status')!)).toMatchObject({ k: 's', user_id: A, id: C, status: 'need_fuel' });
    b.markUploaded(up);
    expect(b.pendingUploads()).toHaveLength(0);
  });

  it('forgets a cancelled tap', () => {
    const a = new NearbyMesh(keys(2), A);
    a.ownStatus({ id: C, status: 'stuck', lat: null, lng: null, at: T0 });
    a.forget(C);
    expect(a.live(T0)).toHaveLength(0);
  });
});
