import { describe, expect, it } from 'vitest';

import {
  countLine, distanceLabel, dmPreview, dmReportDetails, endsLabel, friendlyOutRidingError, isOut, leftBeforeReply,
  mergeDirectMessages, outRidingNotSwitchedOn, outSince, ringMiles, ringSpot, sortNearby, tidySpot, totalUnread,
  type DirectMessage, type MyOutRiding, type NearbyRider,
} from '../out-riding';

const NOW = Date.parse('2026-11-07T15:00:00Z');
const H = 3_600_000;
const status = (over: Partial<MyOutRiding> = {}): MyOutRiding => ({
  audience: 'riders', spot: null,
  started_at: new Date(NOW - H).toISOString(), refreshed_at: new Date(NOW - 10 * 60_000).toISOString(),
  expires_at: new Date(NOW + 3 * H).toISOString(), ...over,
});
const rider = (id: string, miles: number, known: boolean, name = id): NearbyRider => ({
  user_id: id, display_name: name, photo_url: null, miles, spot: null, known, since: new Date(NOW - H).toISOString(), riding_types: [],
});
const msg = (id: string, sender: string, at: number): DirectMessage => ({
  id, thread_id: 't', sender_id: sender, body: id, sent_at: new Date(at).toISOString(), created_at: new Date(at).toISOString(),
});

describe('isOut', () => {
  it('is off with no status, past its end, or idle 6 hours', () => {
    expect(isOut(null, NOW)).toBe(false);
    expect(isOut(status(), NOW)).toBe(true);
    expect(isOut(status({ expires_at: new Date(NOW - 1).toISOString() }), NOW)).toBe(false);
    expect(isOut(status({ refreshed_at: new Date(NOW - 6 * H - 1).toISOString() }), NOW)).toBe(false);
  });
});

describe('distance words', () => {
  it('never gets more exact than whole miles', () => {
    expect(distanceLabel(0)).toBe('Under a Mile');
    expect(distanceLabel(1)).toBe('About 1 Mile');
    expect(distanceLabel(7)).toBe('About 7 Miles');
    expect(distanceLabel(Number.NaN)).toBe('Under a Mile');
  });

  it('counts riders you know and others', () => {
    expect(countLine([], 10)).toBe('Nobody Else Out Within 10 Miles Yet');
    expect(countLine([rider('a', 1, true)], 10)).toBe('1 Rider You Know Out Within 10 Miles');
    expect(countLine([rider('a', 1, true), rider('b', 2, false), rider('c', 3, false)], 25)).toBe(
      '1 Rider You Know and 2 Other Riders Out Within 25 Miles',
    );
  });

  it('says how long they have been out and how long mine lasts', () => {
    expect(outSince(new Date(NOW - 20 * 60_000).toISOString(), NOW)).toBe('Out for 20 Min');
    expect(outSince(new Date(NOW - 3 * H).toISOString(), NOW)).toBe('Out for 3 Hr');
    expect(endsLabel(new Date(NOW + 3 * H).toISOString(), NOW)).toBe('On for 3 More Hours');
    expect(endsLabel(new Date(NOW - 1).toISOString(), NOW)).toBe('Ended');
    expect(endsLabel(new Date(NOW + 40 * H).toISOString(), NOW)).toMatch(/^On Until /);
  });
});

describe('sortNearby', () => {
  it('puts riders you know first, then the nearest', () => {
    const list = sortNearby([rider('far', 9, false), rider('near', 1, false), rider('pal', 8, true)]);
    expect(list.map((r) => r.user_id)).toEqual(['pal', 'near', 'far']);
  });
});

describe('ringSpot', () => {
  it('places dots by distance only, the same way every time', () => {
    const a = ringSpot('rider-1', 5, 10);
    expect(a).toEqual(ringSpot('rider-1', 5, 10));
    expect(a.fraction).toBeCloseTo(0.61);
    expect(a.angle).toBeGreaterThanOrEqual(0);
    expect(a.angle).toBeLessThan(360);
    expect(ringSpot('rider-1', 0, 10).fraction).toBeGreaterThan(0.22);
    expect(ringSpot('rider-1', 0, 10).fraction).toBeLessThan(ringSpot('rider-1', 2, 10).fraction);
    expect(ringSpot('rider-1', 80, 10).fraction).toBe(1);
    expect(ringMiles(10)).toEqual([3, 7, 10]);
  });
});

describe('tidySpot', () => {
  it('trims and caps the spot', () => {
    expect(tidySpot('  Windrock   Park ')).toBe('Windrock Park');
    expect(tidySpot('   ')).toBeNull();
    expect(tidySpot('x'.repeat(60))).toHaveLength(40);
  });
});

describe('direct messages', () => {
  it('caps messages before a reply at 3', () => {
    expect(leftBeforeReply([], 'me')).toBe(3);
    expect(leftBeforeReply([msg('1', 'me', NOW), msg('2', 'me', NOW)], 'me')).toBe(1);
    expect(leftBeforeReply([msg('1', 'me', NOW), msg('2', 'me', NOW), msg('3', 'me', NOW), msg('4', 'me', NOW)], 'me')).toBe(0);
    expect(leftBeforeReply([msg('1', 'me', NOW), msg('2', 'you', NOW)], 'me')).toBeNull();
  });

  it('merges without duplicates, oldest first', () => {
    const merged = mergeDirectMessages([msg('b', 'x', NOW), msg('a', 'x', NOW - 1000)], [msg('b', 'x', NOW), msg('c', 'x', NOW + 1)]);
    expect(merged.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('previews and counts unread, skipping muted', () => {
    expect(dmPreview({ last_body: 'On my way', last_sender_id: 'me' }, 'me')).toBe('You: On my way');
    expect(dmPreview({ last_body: 'Hey', last_sender_id: 'you' }, 'me')).toBe('Hey');
    expect(dmPreview({ last_body: null, last_sender_id: null }, 'me')).toBeNull();
    expect(totalUnread([{ unread: 2, muted: false }, { unread: 5, muted: true }, { unread: 1, muted: false }])).toBe(3);
  });

  it('puts the reported message in the report', () => {
    expect(dmReportDetails('creepy text')).toBe('From a direct message: “creepy text”');
    expect(dmReportDetails(null)).toBe('From a direct message.');
  });
});

describe('errors', () => {
  it('knows when the server has no Out Riding yet', () => {
    expect(outRidingNotSwitchedOn('Could not find the function public.nearby_riders in the schema cache')).toBe(true);
    expect(outRidingNotSwitchedOn('x', 'PGRST202')).toBe(true);
    expect(outRidingNotSwitchedOn('network request failed')).toBe(false);
  });

  it('turns database errors into plain words', () => {
    expect(friendlyOutRidingError('dm_wait_for_reply: wait')).toBe('Wait for them to reply before sending more.');
    expect(friendlyOutRidingError('dm_not_allowed: x')).toMatch(/Out Riding near you/);
    expect(friendlyOutRidingError('dm_you_blocked: x')).toMatch(/Unblock/);
    expect(friendlyOutRidingError('out_riding_rate: too many')).toMatch(/update again soon/);
    expect(friendlyOutRidingError('slow down: too many messages')).toMatch(/Wait a minute/);
  });
});
