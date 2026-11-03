import { describe, expect, it } from 'vitest';

import { conversationsOf, isBannedError, reportablePeople, reportSourceLabel, suspendLabel, suspensionLabel, suspensionOf } from '../moderation';

const now = new Date('2026-11-03T20:00:00Z');

describe('suspensions', () => {
  it('reads Auth banned_until as none, suspended or banned', () => {
    expect(suspensionOf(null, now)).toEqual({ state: 'none' });
    expect(suspensionOf('2026-11-01T00:00:00Z', now)).toEqual({ state: 'none' });
    expect(suspensionOf('2026-11-10T20:00:00Z', now).state).toBe('suspended');
    expect(suspensionOf('2126-10-10T20:00:00Z', now)).toEqual({ state: 'banned' });
  });
  it('labels them for the dashboard', () => {
    expect(suspensionLabel('2026-11-10T20:00:00Z', now)).toBe('Suspended until Nov 10');
    expect(suspensionLabel('2027-01-31T20:00:00Z', now)).toBe('Suspended until Jan 31, 2027');
    expect(suspensionLabel('2126-10-10T20:00:00Z', now)).toBe('Banned');
    expect(suspensionLabel(undefined, now)).toBeNull();
    expect(suspendLabel(1)).toBe('1 Day');
    expect(suspendLabel(30)).toBe('30 Days');
  });
  it('spots the banned sign-in error', () => {
    expect(isBannedError('User is banned')).toBe(true);
    expect(isBannedError('Invalid login credentials')).toBe(false);
  });
});

describe('report conversations', () => {
  it('groups copied messages by conversation, DMs first, oldest first', () => {
    const c = conversationsOf([
      { source: 'ride_chat', source_id: 'r1', source_name: 'Hidden Falls', sent_at: '2026-11-02T10:00:00Z' },
      { source: 'dm', source_id: 't1', source_name: 'Direct Messages', sent_at: '2026-11-03T10:00:00Z' },
      { source: 'dm', source_id: 't1', source_name: 'Direct Messages', sent_at: '2026-11-01T10:00:00Z' },
      { source: 'group_chat', source_id: 'g1', source_name: 'Hill Country', sent_at: '2026-11-02T09:00:00Z' },
    ]);
    expect(c.map((x) => x.title)).toEqual(['Direct Messages', 'Hill Country (Group Chat)', 'Hidden Falls (Ride Chat)']);
    expect(c[0].messages.map((m) => m.sent_at)).toEqual(['2026-11-01T10:00:00Z', '2026-11-03T10:00:00Z']);
  });
  it('names sources and ignores unknown ones', () => {
    expect(reportSourceLabel('dm')).toBe('Direct Messages');
    expect(reportSourceLabel('somewhere')).toBeNull();
    expect(reportSourceLabel(null)).toBeNull();
  });
});

describe('reportablePeople', () => {
  const input = {
    me: 'me',
    dms: [{ other_id: 'jake', other_name: 'Jake M.', last_at: '2026-11-03T01:00:00Z' }],
    friends: [
      { user_id: 'amy', display_name: 'Amy L.', status: 'friends' },
      { user_id: 'jake', display_name: 'Jake M.', status: 'friends' },
      { user_id: 'pending', display_name: 'Pat', status: 'sent' },
    ],
    known: [{ user_id: 'dave', display_name: 'Dave K.', reason: 'Ridden With You' }, { user_id: 'me', display_name: 'Me', reason: 'x' }],
    blocked: [{ userId: 'tanner', name: 'Tanner R.' }, { userId: 'dave', name: 'Dave K.' }],
  };
  it('lists each rider once, in the first section they fit', () => {
    const s = reportablePeople(input);
    expect(s.map((x) => [x.title, x.people.map((p) => p.userId)])).toEqual([
      ['Messaged', ['jake']], ['Friends', ['amy']], ['Ridden With', ['dave']], ['Blocked', ['tanner']],
    ]);
  });
  it('searches by name and drops empty sections', () => {
    expect(reportablePeople({ ...input, query: 'tan' }).map((x) => x.title)).toEqual(['Blocked']);
  });
});
