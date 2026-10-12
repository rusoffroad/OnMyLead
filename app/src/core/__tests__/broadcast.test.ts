import { describe, expect, it } from 'vitest';
import {
  ACK_WINDOW_MS, broadcastNotSwitchedOn, headline, isDuplicateSend, mergeReceipts, stateDetail, tally, tallyLine, toAcknowledge,
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
    expect(t).toEqual({ seen: ['a'], notified: ['b'], waiting: ['c'] });
  });

  it('only counts riders still on the ride', () => {
    expect(tally('x', [r('gone', true)], ['a'])).toEqual({ seen: [], notified: [], waiting: ['a'] });
  });
});

describe('tallyLine', () => {
  it('says when everyone has it', () => {
    expect(tallyLine({ seen: ['a', 'b'], notified: [], waiting: [] }, nameOf)).toBe('All 2 riders got it.');
    expect(tallyLine({ seen: ['a'], notified: [], waiting: [] }, nameOf)).toBe('Sam got it.');
  });

  it('names who has seen it and counts pushes', () => {
    expect(tallyLine({ seen: ['a'], notified: ['b', 'c'], waiting: ['d'] }, nameOf)).toBe('Seen by Sam. 2 notified by push.');
    expect(tallyLine({ seen: ['a', 'b', 'c'], notified: [], waiting: ['d'] }, nameOf)).toBe('Seen by Sam, Alex and 1 more.');
  });

  it('is honest while nobody has it yet', () => {
    expect(tallyLine({ seen: [], notified: [], waiting: ['a', 'b'] }, nameOf)).toBe('Sent to 2 riders. Waiting for their phones.');
    expect(tallyLine({ seen: [], notified: [], waiting: [] }, nameOf)).toBe('Nobody else has joined the ride yet.');
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
