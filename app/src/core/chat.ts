/**
 * Ride chat and announcements.
 *
 * Organizers and co-organizers post announcements; the latest one is pinned on the ride page
 * and read aloud in Ride Mode so nobody has to look at the phone while driving. In Ride Mode
 * riders can only send the canned quick replies below, never type.
 */

export type MessageKind = 'chat' | 'announcement' | 'status';

export type ChatMessage = {
  id: string;
  ride_id: string;
  user_id: string;
  kind: MessageKind;
  body: string;
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

/** The pinned announcement: the most recent one, or null. */
export function latestAnnouncement(messages: ChatMessage[]): ChatMessage | null {
  let best: ChatMessage | null = null;
  for (const m of messages) {
    if (m.kind === 'announcement' && (!best || byTime(best, m) < 0)) best = m;
  }
  return best;
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

/** What Ride Mode says out loud for a new announcement. */
export function spokenAnnouncement(senderName: string | null | undefined, body: string): string {
  const who = senderName?.trim() || 'the organizer';
  return `Announcement from ${who}. ${body}`;
}

/** Turn a database error into something a rider can act on. */
export function friendlyChatError(message: string): string {
  if (/slow down/i.test(message)) return 'You’re sending a lot. Wait a minute and try again.';
  if (/row-level security|violates row-level/i.test(message)) return 'Only riders on this ride can chat here.';
  if (/too long/i.test(message)) return `Keep it under ${MAX_MESSAGE_LENGTH} characters.`;
  return message;
}
