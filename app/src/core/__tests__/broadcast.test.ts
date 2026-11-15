import { describe, expect, it } from 'vitest';
import {
  ACK_WINDOW_MS, bluetoothReceipts, BROADCAST_SHOWN_MS, SENT_SHOWN_MS, sentShownFor, broadcastNotSwitchedOn, cancelErrorText, withoutCancelled, headline, isDuplicateSend, mergeReceipts, queuedLine, stateDetail, tally,
  tallyLine, toAcknowledge,
  type Receipt,
} from '../broadcast';

const r = (user_id: string, seen: boolean, pushed = false, item_id = 'x'): Receipt => ({
  item_id, user_id, seen_at: seen ? '2026-10-12T20:00:00Z' : null, pushed_at: pushed ? '2026-10-12T20:00:00Z' : null,
});
const NAMES: Record<string, string> = { a: 'Sam', b: 'Alex', c: 'Jo', d: 'Lee' };
const nameOf = (id: string) => NAMES[id] ?? 'Rider';

describe('tally', () => {
  it('splits riders into seen, notified by push and waiting', () => {
    const t = tally('x', [r('a', true, true), r('b', false, true), r('z', true, false, 'other')], ['a', 'b', 'c']);
    expect(t).toEqual({ seen: ['a'], notified: ['b'], reached: [], waiting: ['c'] });
  });

  it('only counts riders still on the ride', () => {
    expect(tally('x', [r('gone', true)], ['a'])).toEqual({ seen: [], notified: [], reached: [], waiting: ['a'] });
  });
});

describe('tallyLine', () => {
  it('says when everyone has it', () => {
    expect(tallyLine({ seen: ['a', 'b'], notified: [], reached: [], waiting: [] }, nameOf)).toBe('All 2 riders got it.');
    expect(tallyLine({ seen: ['a'], notified: [], reached: [], waiting: [] }, nameOf)).toBe('Sam got it.');
  });

  it('names who has seen it and counts pushes', () => {
    expect(tallyLine({ seen: ['a'], notified: ['b', 'c'], reached: [], waiting: ['d'] }, nameOf)).toBe('Seen by Sam. 2 notified by push.');
    expect(tallyLine({ seen: ['a', 'b', 'c'], notified: [], reached: [], waiting: ['d'] }, nameOf)).toBe('Seen by Sam, Alex and 1 more.');
  });

  it('names whose phone got it over Bluetooth, and says so under a tap waiting for signal', () => {
    const rows = bluetoothReceipts('x', [{ userId: 'a', state: 2, at: 1762300800 }, { userId: 'b', state: 1, at: 1762300801 }]);
    expect(rows[0]).toEqual({ item_id: 'x', user_id: 'a', seen_at: '2025-11-05T00:00:00.000Z', pushed_at: null, reached_at: '2025-11-05T00:00:00.000Z' });
    expect(rows[1].seen_at).toBeNull();
    const t = tally('x', mergeReceipts([r('b', false, true)], rows), ['a', 'b', 'c']);
    expect(t).toEqual({ seen: ['a'], notified: ['b'], reached: [], waiting: ['c'] });
    expect(tallyLine(tally('x', rows, ['a', 'b', 'c']), nameOf)).toBe('Seen by Sam. Reached Alex over Bluetooth.');
    expect(queuedLine(tally('x', rows, ['a', 'b', 'c']), nameOf)).toBe('No signal here. Seen by Sam over Bluetooth. Reached Alex over Bluetooth. It sends to everyone when you get service.');
    expect(queuedLine(tally('x', [], ['a']), nameOf)).toBeNull();
  });

  it('is honest while nobody has it yet', () => {
    expect(tallyLine({ seen: [], notified: [], reached: [], waiting: ['a', 'b'] }, nameOf)).toBe('Sent to 2 riders. Waiting for their phones.');
    expect(tallyLine({ seen: [], notified: [], reached: [], waiting: [] }, nameOf)).toBe('Nobody else has joined the ride yet.');
  });
});

describe('card text', () => {
  it('names the tap in every state, in Title Case', () => {
    expect(headline({ label: 'On My Way', state: 'sending' })).toBe('Sending On My Way');
    expect(headline({ label: 'On My Way', state: 'sent' })).toBe('On My Way Sent to the Group');
    expect(headline({ label: 'Need Fuel', state: 'queued' })).toBe('Need Fuel Is Waiting for Signal');
    expect(headline({ label: 'Need Fuel', state: 'cancelled' })).toBe('Need Fuel Cancelled');
    expect(stateDetail('sent')).toBeNull();
    expect(stateDetail('queued')).toMatch(/sends by itself/);
  });
});

describe('toAcknowledge', () => {
  const now = Date.parse('2026-10-12T20:00:00Z');
  const at = (minAgo: number) => new Date(now - minAgo * 60_000).toISOString();

  it('marks recent taps from other riders, once', () => {
    const items = [
      { id: '1', user_id: 'a', at: at(1) },
      { id: '2', user_id: 'me', at: at(1) },
      { id: '3', user_id: 'b', at: at(ACK_WINDOW_MS / 60_000 + 1) },
      { id: '4', user_id: 'b', at: at(2), cancelled: true },
      { id: '5', user_id: 'c', at: at(3) },
      { id: '5', user_id: 'c', at: at(3) },
      { id: null, user_id: 'c', at: at(3) },
    ];
    expect(toAcknowledge(items, 'me', new Set(['5']), now)).toEqual(['1']);
    expect(toAcknowledge(items, 'me', new Set(), now)).toEqual(['1', '5']);
    expect(toAcknowledge(items, null, new Set(), now)).toEqual([]);
  });
});

describe('errors', () => {
  it('spots a database without the update', () => {
    expect(broadcastNotSwitchedOn('Could not find the function public.cancel_ride_item(p_item) in the schema cache')).toBe(true);
    expect(broadcastNotSwitchedOn('relation "public.ride_receipts" does not exist')).toBe(true);
    expect(broadcastNotSwitchedOn('only the sender can cancel this')).toBe(false);
  });

  it('spots a retry whose first try landed', () => {
    expect(isDuplicateSend('duplicate key value violates unique constraint "rider_statuses_pkey"')).toBe(true);
    expect(isDuplicateSend('Failed to fetch')).toBe(false);
  });
});

describe('mergeReceipts', () => {
  it('keeps the seen and pushed times from either row', () => {
    const merged = mergeReceipts([r('a', false, true)], [r('a', true, false), r('b', true)]);
    expect(merged).toHaveLength(2);
    expect(merged.find((x) => x.user_id === 'a')).toMatchObject({ seen_at: expect.any(String), pushed_at: expect.any(String) });
  });
});

describe('sentShownFor', () => {
  const at = '2026-11-15T12:00:00.000Z';
  const t0 = Date.parse(at);
  it('clears an everyday tap 15 seconds after it is out, even one that waited for signal', () => {
    expect(sentShownFor({ at, urgent: false }, t0 + 1000)).toBe(SENT_SHOWN_MS);
    expect(sentShownFor({ at }, t0 + 20 * 60_000)).toBe(15_000);
  });
  it('keeps Need Help and EMERGENCY up for ten minutes from the tap', () => {
    expect(sentShownFor({ at, urgent: true }, t0 + 60_000)).toBe(BROADCAST_SHOWN_MS - 60_000);
    expect(sentShownFor({ at, urgent: true }, t0 + 11 * 60_000)).toBe(0);
describe('Cancel', () => {
  it('never shows the raw error (Ride Mode, no service, 3.1)', () => {
    const raw = 'Error: fetch failed: UnexpectedException: The Internet connection appears to be offline. (at ExpoModulesCore/Promise.swift:56)';
    expect(cancelErrorText(raw)).toBe('No service. Try again when you have signal.');
    expect(cancelErrorText('only the sender can cancel this')).toBe('Something went wrong. Try again.');
  });

  it('keeps taps taken back off Ride Mode, whatever the case of the id', () => {
    const statuses: Record<string, { id?: string; status: string }> = { u1: { id: 'ABC', status: 'stuck' }, u2: { id: 'def', status: 'ok' }, u3: { status: 'ok' } };
    expect(withoutCancelled(statuses, new Set(['abc']))).toEqual({ u2: statuses.u2, u3: statuses.u3 });
    expect(withoutCancelled(statuses, new Set())).toEqual(statuses);
  });
});
