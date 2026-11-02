import { describe, expect, it } from 'vitest';
import {
  addSavedReply, charactersLeft, checkRideMessage, isBuiltInReply, MAX_SAVED_REPLIES, parseSavedReplies, removeSavedReply,
  RIDE_MESSAGE_MAX, tidyRideMessage,
} from '../ride-message';

describe('checkRideMessage', () => {
  it('trims and keeps a message on one line', () => {
    expect(checkRideMessage('  Gas at the\n\nnext   town ')).toEqual({ ok: true, body: 'Gas at the next town' });
    expect(tidyRideMessage('\tA  b\n')).toBe('A b');
  });

  it('rejects an empty message', () => {
    expect(checkRideMessage('   \n ')).toEqual({ ok: false, error: 'Type a message first.' });
  });

  it('caps the length so the push title reads at a glance', () => {
    expect(checkRideMessage('x'.repeat(RIDE_MESSAGE_MAX)).ok).toBe(true);
    const long = checkRideMessage('x'.repeat(RIDE_MESSAGE_MAX + 3));
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.error).toContain(String(RIDE_MESSAGE_MAX + 3));
    expect(RIDE_MESSAGE_MAX).toBeLessThanOrEqual(500); // never more than the chat itself allows
  });

  it('counts what is left after tidying', () => {
    expect(charactersLeft('')).toBe(RIDE_MESSAGE_MAX);
    expect(charactersLeft('  ab   c ')).toBe(RIDE_MESSAGE_MAX - 4);
    expect(charactersLeft('x'.repeat(RIDE_MESSAGE_MAX + 1))).toBe(-1);
  });
});

describe('saved quick replies', () => {
  it('puts the newest first without repeats', () => {
    let list = addSavedReply([], 'Gas Stop');
    list = addSavedReply(list, 'Lunch at the Diner');
    list = addSavedReply(list, 'gas stop');
    expect(list).toEqual(['gas stop', 'Lunch at the Diner']);
  });

  it('never saves a built-in reply, an empty or a too-long message', () => {
    expect(isBuiltInReply(' on my way ')).toBe(true);
    expect(addSavedReply([], 'On My Way')).toEqual([]);
    expect(addSavedReply(['A'], '  ')).toEqual(['A']);
    expect(addSavedReply([], 'x'.repeat(RIDE_MESSAGE_MAX + 1))).toEqual([]);
  });

  it('keeps at most the limit, dropping the oldest', () => {
    let list: string[] = [];
    for (let i = 1; i <= MAX_SAVED_REPLIES + 2; i++) list = addSavedReply(list, `Msg ${i}`);
    expect(list).toHaveLength(MAX_SAVED_REPLIES);
    expect(list[0]).toBe(`Msg ${MAX_SAVED_REPLIES + 2}`);
    expect(list).not.toContain('Msg 1');
  });

  it('removes ignoring case', () => {
    expect(removeSavedReply(['Gas Stop', 'Lunch'], 'gas stop')).toEqual(['Lunch']);
  });

  it('reads storage safely and keeps the order', () => {
    expect(parseSavedReplies(null)).toEqual([]);
    expect(parseSavedReplies('not json')).toEqual([]);
    expect(parseSavedReplies('{"a":1}')).toEqual([]);
    expect(parseSavedReplies(JSON.stringify(['Gas Stop', 7, 'Lunch', 'gas stop', 'All Good', '']))).toEqual(['Gas Stop', 'Lunch']);
  });
});
