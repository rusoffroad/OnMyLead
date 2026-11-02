/**
 * Custom messages from Ride Mode.
 *
 * Besides the four quick replies, a rider can type their own short message to the group. It goes
 * out exactly like a quick reply (kind 'status' in the ride chat): Sending, Sent, Seen by,
 * Cancel, the outbox when there is no signal, and a push titled "Name: message". Because that
 * push title is one line, the message is one line too, and short.
 *
 * Riders can keep messages they send often as their own quick replies on this device.
 */
import { QUICK_REPLIES } from './chat';

/** Longest custom Ride Mode message: it is the push title, so it has to read at a glance. */
export const RIDE_MESSAGE_MAX = 120;
/** How many of their own quick replies a rider can keep. */
export const MAX_SAVED_REPLIES = 6;

export type RideMessageCheck = { ok: true; body: string } | { ok: false; error: string };

/** One line, single spaces, trimmed. */
export function tidyRideMessage(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/** Tidy and validate what the rider typed in Ride Mode before it is sent. */
export function checkRideMessage(raw: string): RideMessageCheck {
  const body = tidyRideMessage(raw);
  if (!body) return { ok: false, error: 'Type a message first.' };
  if (body.length > RIDE_MESSAGE_MAX) {
    return { ok: false, error: `Keep it under ${RIDE_MESSAGE_MAX} characters (${body.length} now).` };
  }
  return { ok: true, body };
}

/** Characters left, for the counter under the box (negative when over). */
export function charactersLeft(raw: string): number {
  return RIDE_MESSAGE_MAX - tidyRideMessage(raw).length;
}

const same = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();

/** True when the message is already one of the built-in quick replies. */
export function isBuiltInReply(body: string): boolean {
  return QUICK_REPLIES.some((q) => same(q, tidyRideMessage(body)));
}

/**
 * Adds a message to the rider's own quick replies: newest first, no repeats (ignoring case),
 * never a copy of a built-in reply, and at most MAX_SAVED_REPLIES (the oldest drops off).
 */
export function addSavedReply(list: readonly string[], raw: string): string[] {
  const check = checkRideMessage(raw);
  if (!check.ok || isBuiltInReply(check.body)) return [...list];
  return [check.body, ...list.filter((s) => !same(s, check.body))].slice(0, MAX_SAVED_REPLIES);
}

export function removeSavedReply(list: readonly string[], body: string): string[] {
  return list.filter((s) => !same(s, body));
}

/** Reads the saved list back from storage, dropping anything that isn't a valid message. */
export function parseSavedReplies(raw: string | null | undefined): string[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  let out: string[] = [];
  for (const item of [...data].reverse()) if (typeof item === 'string') out = addSavedReply(out, item);
  return out;
}
