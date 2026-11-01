import { describe, expect, it } from 'vitest';

import {
  friendButtonLabel, friendIds, friendInviteMessage, friendLink, friendlyFriendError, friendsLine, friendsNotSwitchedOn,
  FRIENDS_NOT_SWITCHED_ON, readFriendCode, relationTo, requestResultLine, splitFriends, type Friend,
} from '../friends';

const f = (id: string, status: Friend['status'], extra: Partial<Friend> = {}): Friend => ({
  user_id: id, display_name: id, photo_url: null, status, since: '2026-11-01T12:00:00Z', out_now: false, miles: null, spot: null, riding_types: null, ...extra,
});

describe('splitFriends', () => {
  it('splits requests, friends and sent, friends out riding first and nearest first', () => {
    const list = [
      f('Zed', 'friends'),
      f('Amy', 'friends'),
      f('Far', 'friends', { out_now: true, miles: 8 }),
      f('Near', 'friends', { out_now: true, miles: 0 }),
      f('Req1', 'received', { since: '2026-10-01T00:00:00Z' }),
      f('Req2', 'received', { since: '2026-11-01T00:00:00Z' }),
      f('Sent', 'sent'),
    ];
    const s = splitFriends(list);
    expect(s.friends.map((x) => x.user_id)).toEqual(['Near', 'Far', 'Amy', 'Zed']);
    expect(s.received.map((x) => x.user_id)).toEqual(['Req2', 'Req1']);
    expect(s.sent.map((x) => x.user_id)).toEqual(['Sent']);
  });
});

describe('relationTo and friendIds', () => {
  const list = [f('a', 'friends'), f('b', 'sent'), f('c', 'received')];
  it('says where I stand with a rider', () => {
    expect(relationTo(list, 'a')).toBe('friends');
    expect(relationTo(list, 'b')).toBe('sent');
    expect(relationTo(list, 'c')).toBe('received');
    expect(relationTo(list, 'd')).toBe('none');
    expect(relationTo(list, 'me', 'me')).toBe('self');
    expect(relationTo(list, null)).toBe('none');
  });
  it('only counts accepted friends', () => {
    expect([...friendIds(list)]).toEqual(['a']);
  });
  it('labels the button', () => {
    expect(friendButtonLabel('none')).toBe('Add Friend');
    expect(friendButtonLabel('received')).toBe('Accept Friend Request');
    expect(friendButtonLabel('sent')).toBe('Requested');
    expect(friendButtonLabel('friends')).toBe('Friends');
  });
});

describe('friendsLine', () => {
  it('sums up requests and friends out riding', () => {
    expect(friendsLine([])).toBe('Add riders you know as friends');
    expect(friendsLine([f('a', 'friends')])).toBe('1 Friend');
    expect(friendsLine([f('a', 'friends', { out_now: true, miles: 2 }), f('b', 'friends'), f('c', 'received')])).toBe('1 Friend Request · 2 Friends, 1 Out Riding');
    expect(friendsLine([f('c', 'received'), f('d', 'received'), f('s', 'sent')])).toBe('2 Friend Requests');
  });
});

describe('friend links and codes', () => {
  it('builds the link', () => {
    expect(friendLink('https://onmylead.com/', 'A1B2C3D4E5')).toBe('https://onmylead.com/friend/A1B2C3D4E5');
    expect(friendLink('', 'A1B2C3D4E5')).toBeNull();
    expect(friendInviteMessage('A1B2C3D4E5', null)).toContain('Friend code: A1B2C3D4E5');
    expect(friendInviteMessage('A1B2C3D4E5', 'https://onmylead.com/friend/A1B2C3D4E5')).toContain('https://onmylead.com/friend/A1B2C3D4E5');
  });
  it('reads a typed code or a pasted link', () => {
    expect(readFriendCode('a1b2c3d4e5')).toBe('A1B2C3D4E5');
    expect(readFriendCode('A1B2C 3D4E5')).toBe('A1B2C3D4E5');
    expect(readFriendCode('A1B2C-3D4E5')).toBe('A1B2C3D4E5');
    expect(readFriendCode('Add me https://onmylead.com/friend/a1b2c3d4e5 thanks')).toBe('A1B2C3D4E5');
    expect(readFriendCode('hello')).toBeNull();
    expect(readFriendCode('A1B2C3D4E5F')).toBeNull();
    expect(readFriendCode('')).toBeNull();
  });
});

describe('errors', () => {
  it('knows when the server has no Friends yet', () => {
    expect(friendsNotSwitchedOn('Could not find the function public.my_friends without parameters in the schema cache')).toBe(true);
    expect(friendsNotSwitchedOn('x', 'PGRST202')).toBe(true);
    expect(friendsNotSwitchedOn('friend_not_allowed: send them your friend link instead')).toBe(false);
    expect(friendlyFriendError('function my_friends() does not exist')).toBe(FRIENDS_NOT_SWITCHED_ON);
  });
  it('turns database errors into words', () => {
    expect(friendlyFriendError('friend_not_allowed: send them your friend link instead')).toMatch(/share your friend link/);
    expect(friendlyFriendError('friend_daily_limit: too many friend requests today')).toMatch(/tomorrow/);
    expect(friendlyFriendError('friend_daily_limit: you already asked this rider this week')).toBe('You already asked this rider this week.');
    expect(friendlyFriendError('friend_link_not_found: gone')).toMatch(/new one/);
    expect(friendlyFriendError('friend_you_blocked: unblock')).toMatch(/Blocked Riders/);
    expect(friendlyFriendError('Network request failed')).toMatch(/No signal/);
  });
  it('words what a request did', () => {
    expect(requestResultLine('requested', 'Ann')).toBe('Friend request sent to Ann.');
    expect(requestResultLine('accepted', 'Ann')).toBe('You and Ann are friends now.');
    expect(requestResultLine('already', 'Ann')).toBe('You’ve already asked Ann.');
  });
});
