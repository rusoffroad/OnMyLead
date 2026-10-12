import { describe, expect, it } from 'vitest';
import { checkPoll, isPoll, mergeVotes, MAX_POLL_CHOICES, pollsNotSwitchedOn, POLL_STARTERS, tallyPoll, voteCountLabel, type PollVote } from '../polls';

const vote = (user: string, choice: number, message = 'p1'): PollVote => ({
  message_id: message, ride_id: 'r', user_id: user, choice, voted_at: '2026-10-12T19:00:00Z',
});

describe('checkPoll', () => {
  it('trims, drops blank rows and accepts', () => {
    expect(checkPoll('  Lunch Stop? ', [' Yes ', '', 'No', '  '])).toEqual({ ok: true, question: 'Lunch Stop?', choices: ['Yes', 'No'] });
  });

  it('needs a question and two to six different choices', () => {
    expect(checkPoll(' ', ['Yes', 'No']).ok).toBe(false);
    expect(checkPoll('Lunch?', ['Yes', '']).ok).toBe(false);
    expect(checkPoll('Lunch?', ['Yes', 'yes ']).ok).toBe(false);
    expect(checkPoll('Lunch?', Array.from({ length: MAX_POLL_CHOICES + 1 }, (_, i) => `C${i}`)).ok).toBe(false);
    expect(checkPoll('Lunch?', ['Yes', 'x'.repeat(61)]).ok).toBe(false);
    expect(checkPoll('x'.repeat(201), ['Yes', 'No']).ok).toBe(false);
  });

  it('every starter is a valid poll', () => {
    for (const s of POLL_STARTERS) expect(checkPoll(s.question, s.choices).ok).toBe(true);
  });
});

describe('tallyPoll', () => {
  it('counts one vote per rider for this poll and finds mine', () => {
    const votes = [vote('a', 0), vote('b', 1), vote('c', 1), vote('me', 1), vote('x', 0, 'other'), vote('y', 7)];
    const t = tallyPoll(['Yes', 'No'], votes, 'p1', 'me');
    expect(t.counts).toEqual([1, 3]);
    expect(t.total).toBe(4);
    expect(t.mine).toBe(1);
    expect(t.shares).toEqual([0.25, 0.75]);
  });

  it('handles no votes', () => {
    const t = tallyPoll(['Sat', 'Sun'], [], 'p1', 'me');
    expect(t).toEqual({ counts: [0, 0], total: 0, mine: null, shares: [0, 0] });
  });
});

describe('mergeVotes', () => {
  it('replaces a changed vote instead of adding another', () => {
    const merged = mergeVotes([vote('a', 0), vote('b', 0)], [vote('a', 1)]);
    expect(merged).toHaveLength(2);
    expect(merged.find((v) => v.user_id === 'a')?.choice).toBe(1);
  });
});

describe('helpers', () => {
  it('spots polls and labels counts', () => {
    expect(isPoll({ poll_options: ['Yes', 'No'] })).toBe(true);
    expect(isPoll({ poll_options: null })).toBe(false);
    expect(isPoll({})).toBe(false);
    expect(voteCountLabel(0)).toBe('No Votes Yet');
    expect(voteCountLabel(1)).toBe('1 Vote');
    expect(voteCountLabel(5)).toBe('5 Votes');
  });

  it('knows when the database has no polls yet', () => {
    expect(pollsNotSwitchedOn('relation "public.ride_poll_votes" does not exist')).toBe(true);
    expect(pollsNotSwitchedOn("Could not find the table 'public.ride_poll_votes' in the schema cache")).toBe(true);
    expect(pollsNotSwitchedOn('not one of the poll choices')).toBe(false);
  });
});
