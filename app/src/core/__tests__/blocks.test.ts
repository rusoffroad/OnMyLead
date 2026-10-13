import { describe, expect, it } from 'vitest';

import { blockPrompt, blocksNotSwitchedOn, hiddenByBlock, sortBlocked, withoutBlocked } from '../blocks';

const blocked = new Set(['bad']);

describe('block rider', () => {
  it('hides chat and polls from blocked riders, never my own', () => {
    expect(hiddenByBlock({ user_id: 'bad', kind: 'chat' }, blocked, 'me')).toBe(true);
    expect(hiddenByBlock({ user_id: 'bad' }, blocked, 'me')).toBe(true); // group chat has no kind
    expect(hiddenByBlock({ user_id: 'ok', kind: 'chat' }, blocked, 'me')).toBe(false);
    expect(hiddenByBlock({ user_id: 'bad', kind: 'chat' }, blocked, 'bad')).toBe(false);
    expect(hiddenByBlock({ user_id: 'bad', kind: 'chat' }, new Set(), 'me')).toBe(false);
  });

  it('keeps announcements and quick replies, which carry the ride’s plan and safety', () => {
    expect(hiddenByBlock({ user_id: 'bad', kind: 'announcement' }, blocked, 'me')).toBe(false);
    expect(hiddenByBlock({ user_id: 'bad', kind: 'status' }, blocked, 'me')).toBe(false);
  });

  it('filters a list, returning the same array when nothing is hidden', () => {
    const list = [
      { id: '1', user_id: 'ok', kind: 'chat' as const },
      { id: '2', user_id: 'bad', kind: 'chat' as const },
      { id: '3', user_id: 'bad', kind: 'announcement' as const },
    ];
    expect(withoutBlocked(list, blocked, 'me').map((m) => m.id)).toEqual(['1', '3']);
    const clean = [list[0], list[2]];
    expect(withoutBlocked(clean, blocked, 'me')).toBe(clean);
    expect(withoutBlocked(list, new Set(), 'me')).toBe(list);
  });

  it('sorts blocked riders by ride name', () => {
    const sorted = sortBlocked([
      { userId: '2', name: 'zed', blockedAt: '' },
      { userId: '1', name: 'Ann', blockedAt: '' },
      { userId: '3', name: 'bob', blockedAt: '' },
    ]);
    expect(sorted.map((b) => b.name)).toEqual(['Ann', 'bob', 'zed']);
  });

  it('says they won’t be told, and that safety alerts still come through', () => {
    const p = blockPrompt('Dusty');
    expect(p.title).toBe('Block Dusty?');
    expect(p.message).toMatch(/won’t be told/);
    expect(p.message).toMatch(/EMERGENCY/);
    expect(blockPrompt('  ').title).toBe('Block This Rider?');
  });

  it('spots a database without the blocked_riders table', () => {
    expect(blocksNotSwitchedOn('whatever', 'PGRST205')).toBe(true);
    expect(blocksNotSwitchedOn('relation "blocked_riders" does not exist')).toBe(true);
    expect(blocksNotSwitchedOn('Could not find the table \'public.blocked_riders\' in the schema cache')).toBe(true);
    expect(blocksNotSwitchedOn('Failed to fetch')).toBe(false);
    expect(blocksNotSwitchedOn(null)).toBe(false);
  });
});
