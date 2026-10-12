/**
 * Quick ride polls. A poll is a ride chat message from the leader: the message body is the
 * question and poll_options holds the choices. Every rider on the ride gets one vote, which
 * they can change; everyone on the ride sees the live counts. The database enforces the same
 * limits as below.
 */

import type { ChatMessage } from './chat';

export const MIN_POLL_CHOICES = 2;
export const MAX_POLL_CHOICES = 5;
export const MAX_POLL_QUESTION = 200;
export const MAX_POLL_CHOICE = 60;

export type PollVote = { message_id: string; ride_id: string; user_id: string; choice: number; voted_at: string };

/** One-tap starters for the questions organizers ask most. */
export const POLL_STARTERS: { question: string; choices: string[] }[] = [
  { question: 'Lunch Stop?', choices: ['Yes', 'No'] },
  { question: 'How’s The Pace?', choices: ['Too Slow', 'Just Right', 'Too Fast'] },
  { question: 'Saturday Or Sunday?', choices: ['Saturday', 'Sunday'] },
  { question: 'Morning Or Afternoon?', choices: ['Morning', 'Afternoon'] },
];

export const isPoll = (m: Pick<ChatMessage, 'poll_options'>): boolean =>
  Array.isArray(m.poll_options) && m.poll_options.length >= MIN_POLL_CHOICES;

export type PollCheck = { ok: true; question: string; choices: string[] } | { ok: false; error: string };

/** Trim and validate a poll before it goes to the database. Blank choice rows are dropped. */
export function checkPoll(rawQuestion: string, rawChoices: string[]): PollCheck {
  const question = rawQuestion.trim();
  const choices = rawChoices.map((c) => c.trim()).filter(Boolean);
  if (!question) return { ok: false, error: 'Type a question first.' };
  if (question.length > MAX_POLL_QUESTION) return { ok: false, error: `Keep the question under ${MAX_POLL_QUESTION} characters.` };
  if (choices.length < MIN_POLL_CHOICES) return { ok: false, error: 'Add at least two choices.' };
  if (choices.length > MAX_POLL_CHOICES) return { ok: false, error: `Up to ${MAX_POLL_CHOICES} choices.` };
  if (choices.some((c) => c.length > MAX_POLL_CHOICE)) return { ok: false, error: `Keep each choice under ${MAX_POLL_CHOICE} characters.` };
  if (new Set(choices.map((c) => c.toLowerCase())).size !== choices.length) return { ok: false, error: 'Each choice needs to be different.' };
  return { ok: true, question, choices };
}

export type PollTally = {
  /** Votes per choice, in choice order. */
  counts: number[];
  total: number;
  /** The signed-in rider's choice, or null if they haven't voted. */
  mine: number | null;
  /** Share of the votes per choice, 0 to 1 (all 0 before anyone votes). */
  shares: number[];
};

/** Count the votes for one poll. Votes for choices the poll doesn't have are ignored. */
export function tallyPoll(choices: string[], votes: PollVote[], messageId: string, me: string | null | undefined): PollTally {
  const counts = choices.map(() => 0);
  let mine: number | null = null;
  for (const v of votes) {
    if (v.message_id !== messageId || v.choice < 0 || v.choice >= choices.length) continue;
    counts[v.choice] += 1;
    if (me && v.user_id === me) mine = v.choice;
  }
  const total = counts.reduce((a, b) => a + b, 0);
  return { counts, total, mine, shares: counts.map((c) => (total ? c / total : 0)) };
}

/** Add or replace votes (one per rider per poll), e.g. from a realtime event or a reload. */
export function mergeVotes(current: PollVote[], incoming: PollVote[]): PollVote[] {
  const key = (v: PollVote) => `${v.message_id}:${v.user_id}`;
  const all = new Map(current.map((v) => [key(v), v]));
  for (const v of incoming) all.set(key(v), v);
  return [...all.values()];
}

/** "3 Votes", "1 Vote", "No Votes Yet". */
export function voteCountLabel(total: number): string {
  if (!total) return 'No Votes Yet';
  return `${total} ${total === 1 ? 'Vote' : 'Votes'}`;
}

/** Is this database error the poll update not being applied yet? */
export const pollsNotSwitchedOn = (message: string) =>
  /poll_options|ride_poll_votes|vote_on_poll/i.test(message) && /column|relation|schema cache|does not exist|could not find/i.test(message);
