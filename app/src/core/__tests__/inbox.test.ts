import { describe, expect, it } from 'vitest';

import {
  badgeText, groupInbox, inboxLook, inboxNotSwitchedOn, moreText, notificationKey, unreadCount, whenText, type InboxItem,
} from '../inbox';

const now = new Date(2026, 10, 2, 15, 0); // Nov 2 2026, 3:00 pm local
const item = (over: Partial<InboxItem>): InboxItem => ({
  id: 'x', kind: 'message', title: 'T', body: '', data: {}, count: 1, created_at: now.toISOString(), read_at: null, ...over,
});
const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).toISOString();

describe('inbox counts', () => {
  it('counts unread rows, not folded messages', () => {
    expect(unreadCount([item({ count: 4 }), item({ read_at: at(2, 9) }), item({})])).toBe(2);
    expect(unreadCount([])).toBe(0);
  });
  it('shows the bell number', () => {
    expect(badgeText(0)).toBe('');
    expect(badgeText(7)).toBe('7');
    expect(badgeText(99)).toBe('99');
    expect(badgeText(100)).toBe('99+');
  });
  it('says how many more messages a chat row holds', () => {
    expect(moreText(1)).toBeNull();
    expect(moreText(3)).toBe('+2 More');
  });
});

describe('inbox sections and times', () => {
  it('groups newest first under Today, Yesterday and Earlier, leaving empty ones out', () => {
    const s = groupInbox([
      item({ id: 'old', created_at: new Date(2026, 9, 20, 8).toISOString() }),
      item({ id: 'y', created_at: at(1, 23, 59) }),
      item({ id: 't1', created_at: at(2, 0, 1) }),
      item({ id: 't2', created_at: at(2, 14) }),
    ], now);
    expect(s.map((x) => x.title)).toEqual(['Today', 'Yesterday', 'Earlier']);
    expect(s[0].items.map((i) => i.id)).toEqual(['t2', 't1']);
    expect(groupInbox([item({ created_at: at(2, 14) })], now).map((x) => x.title)).toEqual(['Today']);
  });
  it('writes short times', () => {
    expect(whenText(new Date(now.getTime() - 20_000).toISOString(), now)).toBe('Now');
    expect(whenText(at(2, 14, 35), now)).toBe('25m');
    expect(whenText(at(2, 9), now)).toBe('6h');
    expect(whenText(at(1, 18, 5), now)).toBe('6:05 PM');
    expect(whenText(new Date(2026, 9, 29, 10).toISOString(), now)).toBe('Thu');
    expect(whenText(new Date(2026, 9, 1, 10).toISOString(), now)).toBe('Oct 1');
  });
});

describe('inbox looks', () => {
  it('makes Need Help and EMERGENCY stand out', () => {
    expect(inboxLook({ kind: 'status', data: { status: 'emergency' } }).tone).toBe('alert');
    expect(inboxLook({ kind: 'status', data: { status: 'need_help' } }).icon).toBe('warning');
    expect(inboxLook({ kind: 'status', data: { status: 'need_fuel' } }).tone).toBe('status');
  });
  it('tells chat from a quick reply, and ride changes apart', () => {
    expect(inboxLook({ kind: 'message', data: {} }).icon).toBe('chat');
    expect(inboxLook({ kind: 'message', data: { itemId: 'i' } }).icon).toBe('flagged');
    expect(inboxLook({ kind: 'ride', data: { change: 'live' } }).icon).toBe('flag');
    expect(inboxLook({ kind: 'ride', data: { change: 'cancelled' } }).tone).toBe('quiet');
    expect(inboxLook({ kind: 'ride', data: { change: 'place' } }).icon).toBe('pin');
    expect(inboxLook({ kind: 'friend_request', data: {} }).icon).toBe('addFriend');
    expect(inboxLook({ kind: 'something_new', data: {} }).icon).toBe('bell');
  });
});

describe('matching a row to the notification on the phone', () => {
  it('matches chat by conversation and status taps by the tap', () => {
    const row = { type: 'message', rideId: 'r1', inviteCode: 'ABC', messageId: 'm2' };
    const push = { type: 'message', rideId: 'r1', inviteCode: 'ABC', messageId: 'm1' };
    expect(notificationKey(row)).toBe(notificationKey(push));
    expect(notificationKey({ type: 'message', rideId: 'r2' })).not.toBe(notificationKey(push));
    expect(notificationKey({ type: 'status', itemId: 's1', rideId: 'r1' })).toBe(notificationKey({ type: 'cancelled', itemId: 's1' }));
    expect(notificationKey({ type: 'group_message', groupId: 'g' })).toBe('group:g');
    expect(notificationKey({ type: 'direct_message', userId: 'u' })).toBe('dm:u');
    expect(notificationKey({ type: 'ride', rideId: 'r1', change: 'live' })).not.toBe(notificationKey({ type: 'ride', rideId: 'r1', change: 'time' }));
  });
  it('reads Android raw FCM data the same way', () => {
    expect(notificationKey({ body: JSON.stringify({ type: 'group_message', groupId: 'g' }) })).toBe('group:g');
    expect(notificationKey(undefined)).toBeNull();
    expect(notificationKey({})).toBeNull();
  });
  it('knows when the server part is not there yet', () => {
    expect(inboxNotSwitchedOn('relation "public.rider_notifications" does not exist')).toBe(true);
    expect(inboxNotSwitchedOn(null, 'PGRST205')).toBe(true);
    expect(inboxNotSwitchedOn('Network request failed')).toBe(false);
  });
});

describe('event invites in the inbox', () => {
  it('look like other invites and match by event', () => {
    expect(inboxLook(item({ kind: 'event_invite', data: { type: 'event_invite', eventId: 'e1' } }))).toEqual({ icon: 'flag', tone: 'social' });
    expect(notificationKey({ type: 'event_invite', eventId: 'e1', eventCode: 'X' })).toBe('event_invite:e1');
    expect(notificationKey({ type: 'event_invite', eventId: 'e2' })).not.toBe(notificationKey({ type: 'event_invite', eventId: 'e1' }));
  });
});
