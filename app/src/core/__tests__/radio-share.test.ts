import { describe, expect, it } from 'vitest';

import { airtimeMs } from '../meshtastic';
import { NearbyMesh, roundKey, sealFrame, type NearbyItem, type RideKeys } from '../nearby';
import {
  BUDGET_MS_PER_MIN, BUSY_UTIL, MOVE_M, REPEAT_EVENT_MS, RELAY_FACTOR, markSent, pick, radioKey, spotIntervalMs, usedLastMinute,
  type RadioPickInput, type RadioSent,
} from '../radio-share';

const RIDE = '11111111-2222-4333-8444-555555555555';
const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';
const key = (n: number) => Uint8Array.from({ length: 32 }, (_, i) => (i * 7 + n) & 255);
const keys = (riderKeyN: number): RideKeys => ({ rideId: RIDE, rideKey: key(1), riderKey: key(riderKeyN) });
const T0 = Date.UTC(2026, 10, 19, 16, 0, 0);
const fix = (at: number, lat = 38.5, lng = -109.5) => ({ lat, lng, accuracyM: 5, speedMps: 8, headingDeg: 90, at });
const nonce = () => new Uint8Array(12);
const sizeOf = (i: NearbyItem) => sealFrame(key(1), i, nonce(), Math.floor(T0 / 1000)).length;

function input(items: NearbyItem[], over: Partial<RadioPickInput> = {}): RadioPickInput {
  return {
    items, myId: A, now: T0, preset: 'LONG_FAST', fromRadio: new Set(), sent: new Map<string, RadioSent>(),
    usedMs: 0, radioPeers: 0, channelUtil: null, sizeOf, ...over,
  };
}

/** Rider B's spot, tap and message as rider A's phone heard them (over phone Bluetooth). */
function heardFromB(at = T0) {
  const b = new NearbyMesh(keys(3), B);
  const a = new NearbyMesh(keys(2), A);
  const frames = [
    sealFrame(key(1), b.ownPosition(fix(at, 38.51, -109.51))!, nonce(), Math.floor(at / 1000)),
    sealFrame(key(1), b.ownStatus({ id: 'dddddddd-0000-4000-8000-000000000004', status: 'stopped', lat: null, lng: null, at }), nonce(), Math.floor(at / 1000)),
  ];
  for (const f of frames) a.receive(f, at);
  return a;
}

describe('what goes to the radio', () => {
  it('sends EMERGENCY first, then own taps, own spot, own messages', () => {
    const a = new NearbyMesh(keys(2), A);
    a.ownPosition(fix(T0));
    a.ownReply({ id: 'eeeeeeee-0000-4000-8000-000000000005', body: 'Gas stop at the junction', at: T0 });
    a.ownStatus({ id: 'ffffffff-0000-4000-8000-000000000006', status: 'stopped', lat: null, lng: null, at: T0 });
    a.ownStatus({ id: '99999999-0000-4000-8000-000000000007', status: 'emergency', lat: 38.5, lng: -109.5, at: T0 });
    const kinds = pick(input(a.live(T0))).map((p) => (p.item.kind === 'status' ? p.item.status : p.item.kind));
    expect(kinds).toEqual(['emergency', 'stopped', 'position', 'reply']);
  });

  it('never sends back what came from the radio, but passes on what came over phone Bluetooth', () => {
    const a = heardFromB();
    const items = a.live(T0);
    expect(pick(input(items)).length).toBe(2);
    const fromRadio = new Set(items.map(roundKey));
    expect(pick(input(items, { fromRadio }))).toEqual([]);
  });

  it('holds a spot for its interval, and lets it go early once the rider moved far enough', () => {
    const a = new NearbyMesh(keys(2), A);
    const sent = new Map<string, RadioSent>();
    a.ownPosition(fix(T0));
    const first = pick(input(a.live(T0), { sent }));
    expect(first.length).toBe(1);
    markSent(sent, first[0], T0);
    // 30 s later, barely moved: held.
    const t1 = T0 + 30_000;
    a.ownPosition(fix(t1, 38.5001, -109.5));
    expect(pick(input(a.live(t1), { now: t1, sent }))).toEqual([]);
    // Moved about 1.1 km: goes now.
    a.ownPosition(fix(t1 + 1000, 38.51, -109.5));
    expect(pick(input(a.live(t1 + 1000), { now: t1 + 1000, sent })).length).toBe(1);
    // Never more often than every 15 s, even when moving fast.
    expect(MOVE_M).toBeGreaterThan(50);
    expect(pick(input(a.live(T0 + 5000), { now: T0 + 5000, sent }))).toEqual([]);
    // After the interval: goes regardless.
    const t2 = T0 + spotIntervalMs('LONG_FAST');
    a.ownPosition(fix(t2));
    expect(pick(input(a.live(t2), { now: t2, sent })).length).toBe(1);
  });

  it('sends a tap twice, a minute apart, and a receipt once', () => {
    const a = new NearbyMesh(keys(2), A);
    a.ownStatus({ id: 'ffffffff-0000-4000-8000-000000000006', status: 'stopped', lat: null, lng: null, at: T0 });
    a.ownAck('12121212-0000-4000-8000-000000000008', 2, T0);
    const sent = new Map<string, RadioSent>();
    const first = pick(input(a.live(T0), { sent }));
    expect(first.map((p) => p.item.kind).sort()).toEqual(['ack', 'status']);
    first.forEach((p) => markSent(sent, p, T0));
    expect(pick(input(a.live(T0 + 10_000), { now: T0 + 10_000, sent }))).toEqual([]);
    const again = pick(input(a.live(T0 + REPEAT_EVENT_MS), { now: T0 + REPEAT_EVENT_MS, sent }));
    expect(again.map((p) => p.item.kind)).toEqual(['status']);
    again.forEach((p) => markSent(sent, p, T0 + REPEAT_EVENT_MS));
    expect(pick(input(a.live(T0 + 3 * REPEAT_EVENT_MS), { now: T0 + 3 * REPEAT_EVENT_MS, sent }))).toEqual([]);
  });

  it('tracks each part of a long message on its own', () => {
    const a = new NearbyMesh(keys(2), A);
    const parts = a.ownReply({ id: 'eeeeeeee-0000-4000-8000-000000000005', body: 'x'.repeat(200), at: T0 });
    expect(parts.length).toBeGreaterThan(1);
    const keysSent = pick(input(a.live(T0))).map((p) => p.key);
    expect(new Set(keysSent).size).toBe(parts.length);
    expect(keysSent.every((k) => k.startsWith('r:'))).toBe(true);
    expect(radioKey(parts[1])).toBe(`${roundKey(parts[1])}#1`);
  });

  it('keeps relays and repeats within the air time budget, shared between the ride radios', () => {
    const a = heardFromB();
    const items = a.live(T0);
    const spotMs = airtimeMs(sizeOf(items.find((i) => i.kind === 'position')!), 'LONG_FAST');
    const perPhone = (peers: number) => BUDGET_MS_PER_MIN / RELAY_FACTOR / (peers + 1);
    expect(perPhone(0)).toBeGreaterThan(2 * spotMs);
    expect(pick(input(items)).length).toBe(2);
    // Ten radios on the ride: room for one of B's two items this minute.
    expect(perPhone(9)).toBeLessThan(2 * spotMs);
    expect(pick(input(items, { radioPeers: 9 })).length).toBeLessThan(2);
    // Budget used up: B's items wait.
    expect(pick(input(items, { usedMs: perPhone(0) }))).toEqual([]);
  });

  it('always sends EMERGENCY, the own spot when due and a new own tap, budget or not', () => {
    const a = new NearbyMesh(keys(2), A);
    a.ownPosition(fix(T0));
    a.ownStatus({ id: '99999999-0000-4000-8000-000000000007', status: 'emergency', lat: 38.5, lng: -109.5, at: T0 });
    a.ownStatus({ id: 'ffffffff-0000-4000-8000-000000000006', status: 'stopped', lat: null, lng: null, at: T0 });
    const out = pick(input(a.live(T0), { usedMs: BUDGET_MS_PER_MIN }));
    expect(out.map((p) => (p.item.kind === 'status' ? p.item.status : p.item.kind))).toEqual(['emergency', 'stopped', 'position']);
    expect(out[0].urgent).toBe(true);
  });

  it('stretches the spot interval for groups bigger than ten radios', () => {
    expect(spotIntervalMs('LONG_FAST', 4)).toBe(spotIntervalMs('LONG_FAST'));
    expect(spotIntervalMs('LONG_FAST', 19)).toBe(2 * spotIntervalMs('LONG_FAST'));
  });

  it('on a busy channel, sends only own items and taps', () => {
    const a = heardFromB();
    a.ownPosition(fix(T0));
    const kinds = pick(input(a.live(T0), { channelUtil: BUSY_UTIL + 1 })).map((p) => `${p.item.kind}:${p.item.userId === A ? 'own' : 'other'}`);
    expect(kinds).toContain('position:own');
    expect(kinds).toContain('status:other');
    expect(kinds).not.toContain('position:other');
  });

  it('counts air time over the last minute only', () => {
    const log: [number, number][] = [[T0, 500], [T0 + 30_000, 300], [T0 + 61_000, 200]];
    expect(usedLastMinute(log, T0 + 70_000)).toBe(500);
    expect(log.length).toBe(2);
  });

  it('spaces spots further apart on slower settings', () => {
    expect(spotIntervalMs('SHORT_FAST')).toBeLessThan(spotIntervalMs('MEDIUM_FAST'));
    expect(spotIntervalMs('MEDIUM_FAST')).toBeLessThan(spotIntervalMs('LONG_FAST'));
    expect(spotIntervalMs('OTHER')).toBeGreaterThan(spotIntervalMs('LONG_FAST'));
  });
});
