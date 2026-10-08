import { describe, expect, it } from 'vitest';
import {
  checkMessage, friendlyChatError, latestAnnouncement, MAX_MESSAGE_LENGTH, mergeMessages, QUICK_REPLIES, spokenAnnouncement,
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
    expect(QUICK_REPLIES).toEqual(['On my way', 'Running late', 'Need a minute', 'All good']);
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
