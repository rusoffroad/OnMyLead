/**
 * Ride chat and announcements.
 *
 * Organizers and co-organizers post announcements; the latest one is pinned on the ride page
 * and read aloud in Ride Mode so nobody has to look at the phone while driving. In Ride Mode
 * riders can only send the canned quick replies below, never type.
 */

export type MessageKind = 'chat' | 'announcement' | 'status';

/**
 * Who a message is for. 'leader' messages are readable only by the sender and the ride's
 * leader (enforced by the database). Rows from before the leader-only update have no audience.
 */
export type MessageAudience = 'everyone' | 'leader';

export type ChatMessage = {
  id: string;
  ride_id: string;
  user_id: string;
  kind: MessageKind;
  body: string;
  audience?: MessageAudience;
  /** Set only on quick polls (see core/polls): the choices, with the body as the question. */
  poll_options?: string[] | null;
  /** When the sender marked it resolved; null or missing while it is open. */
  resolved_at?: string | null;
  sent_at: string;
  created_at: string;
};

/** Longest message the database accepts (it enforces the same limit). */
export const MAX_MESSAGE_LENGTH = 500;
/** Messages per minute per rider before the database asks them to slow down. */
export const MESSAGES_PER_MINUTE = 10;

/** One-tap replies for Ride Mode. Sent as kind 'status' so the chat can show them differently. */
export const QUICK_REPLIES = ['On my way', 'Running late', 'Need a minute', 'All good'] as const;
export type QuickReply = (typeof QUICK_REPLIES)[number];

export type MessageCheck = { ok: true; body: string } | { ok: false; error: string };

/** Trim and validate what a rider typed before it goes to the database. */
export function checkMessage(raw: string): MessageCheck {
  const body = raw.trim();
  if (!body) return { ok: false, error: 'Type a message first.' };
  if (body.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, error: `Keep it under ${MAX_MESSAGE_LENGTH} characters (${body.length} now).` };
  }
  return { ok: true, body };
}

const byTime = (a: ChatMessage, b: ChatMessage) =>
  Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id);

/**
 * The pinned announcement: the most recent one, or null. Once its sender marks it resolved
 * nothing is pinned (an older announcement doesn't come back).
 */
export function latestAnnouncement(messages: ChatMessage[]): ChatMessage | null {
  let best: ChatMessage | null = null;
  for (const m of messages) {
    if (m.kind === 'announcement' && (!best || byTime(best, m) < 0)) best = m;
  }
  return best && !isResolved(best) ? best : null;
}

/**
 * Add incoming messages (from a realtime event or a reload) without duplicates, oldest first,
 * keeping only the newest `limit`.
 */
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[], limit = 200): ChatMessage[] {
  const seen = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) seen.set(m.id, m);
  const all = [...seen.values()].sort(byTime);
  return all.length > limit ? all.slice(all.length - limit) : all;
}

/**
 * Replace the loaded messages with a fresh page from the database (newest `limit`, oldest
 * first), so messages cleared since the last load disappear. Messages that arrived after the
 * page was read are kept, and so are older ones when the page was full (they are just off it).
 */
export function reconcileMessages(current: ChatMessage[], page: ChatMessage[], limit: number): ChatMessage[] {
  // An empty page means every message is gone (a stray new one comes back on the next load).
  if (!page.length) return [];
  const ids = new Set(page.map((m) => m.id));
  const times = page.map((m) => Date.parse(m.created_at));
  const newest = Math.max(...times);
  const oldest = Math.min(...times);
  const keep = current.filter((m) => {
    if (ids.has(m.id)) return false;
    const t = Date.parse(m.created_at);
    return t > newest || (page.length >= limit && t < oldest);
  });
  return mergeMessages(keep, page);
}

/** The list without one message (cleared by its sender). */
export const withoutMessage = (current: ChatMessage[], id: string) => current.filter((m) => m.id !== id);

export const isResolved = (m: Pick<ChatMessage, 'resolved_at'>) => !!m.resolved_at;

/**
 * A message on its way out. It shows in the chat straight away as Sending, then becomes the
 * real message (Sent) or stays as Not Sent with Retry and Remove.
 */
export type PendingMessage = {
  localId: string;
  body: string;
  kind: MessageKind;
  audience: MessageAudience;
  state: 'sending' | 'failed';
  error?: string;
  at: string;
};

/** Sending state for anything a rider sends, in words. */
export type SendState = 'sending' | 'sent' | 'failed' | 'queued';
export const SEND_STATE_LABEL: Record<SendState, string> = {
  sending: 'Sending…',
  sent: 'Sent',
  failed: 'Not Sent',
  queued: 'Waiting for Signal',
};

/** Clearing and resolving need the database update; true when it hasn't run yet. */
export function messageActionsNotSwitchedOn(message: string): boolean {
  return /set_message_resolved|clear_ride_message|resolved_at/i.test(message)
    && /function|column|schema cache|does not exist|could not find/i.test(message);
}

/** What Ride Mode says out loud for a new announcement. */
export function spokenAnnouncement(senderName: string | null | undefined, body: string): string {
  const who = senderName?.trim() || 'the organizer';
  return `Announcement from ${who}. ${body}`;
}

/**
 * The ride's leader, the same rule the database uses: every joined rider with the Leader
 * role, or the organizer when nobody has been given it.
 */
export function rideLeaderIds(
  members: { user_id: string; status: string; role: string }[],
  organizerId: string | null | undefined,
): string[] {
  const leaders = members.filter((m) => m.status === 'joined' && m.role === 'leader').map((m) => m.user_id);
  if (leaders.length) return leaders;
  return organizerId ? [organizerId] : [];
}

export const isLeaderOnly = (m: Pick<ChatMessage, 'audience'>) => m.audience === 'leader';

/** Should a new message pop up for this rider? Everything except their own messages. */
export function shouldAlert(m: Pick<ChatMessage, 'user_id'>, me: string | null | undefined): boolean {
  return !!me && m.user_id !== me;
}

/** Headline for the pop-up and the push notification. */
export function alertTitle(
  m: Pick<ChatMessage, 'kind' | 'audience' | 'poll_options'>, senderName: string | null | undefined, rideName?: string | null,
): string {
  const who = senderName?.trim() || 'A rider';
  const what = m.kind === 'announcement'
    ? `Announcement from ${who}`
    : m.poll_options?.length
      ? `Poll from ${who}`
      : isLeaderOnly(m) ? `${who} (to you, the leader)` : who;
  return rideName?.trim() ? `${what} · ${rideName.trim()}` : what;
}

/** Turn a database error into something a rider can act on. */
export function friendlyChatError(message: string): string {
  if (messageActionsNotSwitchedOn(message)) return 'Clear and Mark Resolved aren’t switched on yet.';
  if (/only the sender can resolve/i.test(message)) return 'Only the person who sent it can mark it resolved.';
  if (/only the sender can clear/i.test(message)) return 'Only the person who sent it can clear it, or it’s already gone.';
  if (/network request failed|failed to fetch|fetch failed|network error/i.test(message)) return 'No signal. Check your connection and tap Retry.';
  if (/poll_options|ride_poll_votes|vote_on_poll/i.test(message) && /column|relation|schema cache|does not exist|could not find/i.test(message)) {
    return 'Polls aren’t switched on yet.';
  }
  if (/poll choices repeat/i.test(message)) return 'Each choice needs to be different.';
  if (/poll choice too long/i.test(message)) return 'Keep each choice under 60 characters.';
  if (/poll question too long/i.test(message)) return 'Keep the question under 200 characters.';
  if (/poll choice is empty|poll_size|check constraint/i.test(message)) return 'A poll needs 2 to 5 choices.';
  if (/not one of the poll choices|poll not found/i.test(message)) return 'That choice isn’t in this poll.';
  if (/only riders on this ride can vote/i.test(message)) return 'Only riders on this ride can vote.';
  if (/slow down/i.test(message)) return 'You’re sending a lot. Wait a minute and try again.';
  if (/row-level security|violates row-level/i.test(message)) return 'Only riders on this ride can chat here.';
  if (/audience/i.test(message)) return 'Leader-only messages aren’t switched on yet. Send it to everyone for now.';
  if (/too long/i.test(message)) return `Keep it under ${MAX_MESSAGE_LENGTH} characters.`;
  return message;
}
