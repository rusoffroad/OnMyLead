import { describe, expect, it } from 'vitest';
import {
  alertTitle, checkMessage, friendlyChatError, isLeaderOnly, isResolved, latestAnnouncement, MAX_MESSAGE_LENGTH, mergeMessages,
  messageActionsNotSwitchedOn, QUICK_REPLIES, reconcileMessages, rideLeaderIds, SEND_STATE_LABEL, shouldAlert, spokenAnnouncement,
  withoutMessage,
  type ChatMessage,
} from '../chat';

const msg = (id: string, minute: number, kind: ChatMessage['kind'] = 'chat', body = id): ChatMessage => ({
  id,
  ride_id: 'r',
  user_id: 'u',
  kind,
  body,
  sent_at: new Date(Date.UTC(2026, 9, 10, 9, minute)).toISOString(),
  created_at: new Date(Date.UTC(2026, 9, 10, 9, minute)).toISOString(),
});

describe('checkMessage', () => {
  it('trims and accepts a normal message', () => {
    expect(checkMessage('  Gas stop in 10  ')).toEqual({ ok: true, body: 'Gas stop in 10' });
  });

  it('rejects empty and overly long messages', () => {
    expect(checkMessage('   ').ok).toBe(false);
    expect(checkMessage('x'.repeat(MAX_MESSAGE_LENGTH)).ok).toBe(true);
    const long = checkMessage('x'.repeat(MAX_MESSAGE_LENGTH + 1));
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.error).toContain(String(MAX_MESSAGE_LENGTH + 1));
  });

  it('keeps every quick reply short and valid', () => {
    expect(QUICK_REPLIES).toEqual(['On My Way', 'Running Late', 'Need a Minute', 'All Good']);
    for (const q of QUICK_REPLIES) expect(checkMessage(q).ok).toBe(true);
  });
});

describe('announcements', () => {
  it('pins the newest announcement only', () => {
    const list = [msg('a1', 1, 'announcement'), msg('c1', 2), msg('a2', 3, 'announcement'), msg('c2', 4)];
    expect(latestAnnouncement(list)?.id).toBe('a2');
    expect(latestAnnouncement([msg('c1', 1)])).toBeNull();
  });

  it('speaks who sent it', () => {
    expect(spokenAnnouncement('Olivia', 'Fuel stop at the next town.')).toBe('Announcement from Olivia. Fuel stop at the next town.');
    expect(spokenAnnouncement('', 'Lunch')).toBe('Announcement from the organizer. Lunch');
  });
});

describe('mergeMessages', () => {
  it('dedupes realtime echoes and sorts oldest first', () => {
    const merged = mergeMessages([msg('b', 2), msg('a', 1)], [msg('b', 2), msg('c', 3)]);
    expect(merged.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps only the newest messages past the limit', () => {
    const merged = mergeMessages([], [msg('a', 1), msg('b', 2), msg('c', 3)], 2);
    expect(merged.map((m) => m.id)).toEqual(['b', 'c']);
  });
});

describe('friendlyChatError', () => {
  it('explains the rate limit and membership rule', () => {
    expect(friendlyChatError('slow down: too many messages')).toMatch(/wait a minute/i);
    expect(friendlyChatError('new row violates row-level security policy for table "ride_messages"')).toMatch(/only riders/i);
    expect(friendlyChatError('something else')).toBe('something else');
  });
});

describe('leader-only messages', () => {
  const m = (user_id: string, role: string, status = 'joined') => ({ user_id, role, status });

  it('uses riders with the Leader role as the leader', () => {
    expect(rideLeaderIds([m('o', 'organizer'), m('a', 'leader'), m('b', 'rider')], 'o')).toEqual(['a']);
  });

  it('falls back to the organizer when nobody is Leader, ignoring riders who are not joined', () => {
    expect(rideLeaderIds([m('o', 'organizer'), m('a', 'leader', 'left'), m('b', 'sweep')], 'o')).toEqual(['o']);
    expect(rideLeaderIds([], null)).toEqual([]);
  });

  it('pops up messages from others only', () => {
    expect(shouldAlert({ user_id: 'a' }, 'b')).toBe(true);
    expect(shouldAlert({ user_id: 'a' }, 'a')).toBe(false);
    expect(shouldAlert({ user_id: 'a' }, undefined)).toBe(false);
  });

  it('titles alerts by sender, audience and ride', () => {
    expect(alertTitle({ kind: 'chat' }, 'Ben', 'Moab Saturday')).toBe('Ben · Moab Saturday');
    expect(alertTitle({ kind: 'chat', audience: 'leader' }, 'Ben', null)).toBe('Ben (to you, the leader)');
    expect(alertTitle({ kind: 'announcement', audience: 'everyone' }, '', 'Moab')).toBe('Announcement from A rider · Moab');
    expect(isLeaderOnly({})).toBe(false);
  });

  it('explains a leader-only send before the database update', () => {
    expect(friendlyChatError("Could not find the 'audience' column of 'ride_messages' in the schema cache")).toMatch(/everyone for now/);
  });
});

describe('polls in chat', () => {
  it('titles a poll pop-up as a poll', () => {
    expect(alertTitle({ kind: 'chat', audience: 'everyone', poll_options: ['Yes', 'No'] }, 'Olivia', 'Moab')).toBe('Poll from Olivia · Moab');
  });

  it('says polls are not switched on when the database lacks them', () => {
    expect(friendlyChatError("Could not find the 'poll_options' column of 'ride_messages' in the schema cache")).toBe('Polls aren’t switched on yet.');
    expect(friendlyChatError('relation "ride_poll_votes" does not exist')).toBe('Polls aren’t switched on yet.');
    expect(friendlyChatError('poll choices repeat')).toBe('Each choice needs to be different.');
  });
});

describe('clear and resolve', () => {
  it('drops a cleared message when the chat reloads', () => {
    const before = [msg('a', 1), msg('b', 2), msg('c', 3)];
    // b was cleared by its sender: the fresh page no longer has it.
    expect(reconcileMessages(before, [msg('a', 1), msg('c', 3)], 100).map((m) => m.id)).toEqual(['a', 'c']);
  });

  it('keeps messages that arrived after the page was read, and older ones off a full page', () => {
    const before = [msg('old', 0), msg('a', 1), msg('late', 9)];
    expect(reconcileMessages(before, [msg('a', 1), msg('b', 2)], 2).map((m) => m.id)).toEqual(['old', 'a', 'b', 'late']);
    // Not a full page: everything older than its newest message is exactly what the database has.
    expect(reconcileMessages(before, [msg('a', 1), msg('b', 2)], 100).map((m) => m.id)).toEqual(['a', 'b', 'late']);
    expect(reconcileMessages(before, [], 100).map((m) => m.id)).toEqual([]);
  });

  it('takes the resolved state from the fresh page', () => {
    const resolved = { ...msg('a', 1), resolved_at: '2026-10-10T10:00:00Z' };
    const [a] = reconcileMessages([msg('a', 1)], [resolved], 100);
    expect(isResolved(a)).toBe(true);
    expect(isResolved(msg('b', 1))).toBe(false);
    expect(isResolved({ resolved_at: null })).toBe(false);
  });

  it('removes one message by id', () => {
    expect(withoutMessage([msg('a', 1), msg('b', 2)], 'a').map((m) => m.id)).toEqual(['b']);
  });

  it('stops pinning an announcement once it is resolved, without bringing back an older one', () => {
    const older = msg('old', 1, 'announcement');
    const newest = { ...msg('new', 2, 'announcement'), resolved_at: '2026-10-10T10:00:00Z' };
    expect(latestAnnouncement([older, newest])).toBeNull();
    expect(latestAnnouncement([older, { ...newest, resolved_at: null }])?.id).toBe('new');
  });

  it('says when Clear and Mark Resolved are not switched on yet', () => {
    const missing = 'Could not find the function public.clear_ride_message(p_message) in the schema cache';
    expect(messageActionsNotSwitchedOn(missing)).toBe(true);
    expect(friendlyChatError(missing)).toBe('Clear and Mark Resolved aren’t switched on yet.');
    expect(messageActionsNotSwitchedOn('only the sender can clear this message')).toBe(false);
    expect(friendlyChatError('only the sender can resolve this message')).toMatch(/Only the person who sent it/);
  });

  it('turns a dropped connection into a retry hint', () => {
    expect(friendlyChatError('TypeError: Network request failed')).toMatch(/Retry/);
  });

  it('names every send state in Title Case', () => {
    expect(SEND_STATE_LABEL).toEqual({ sending: 'Sending…', sent: 'Sent', failed: 'Not Sent', queued: 'Waiting for Signal' });
  });
});
