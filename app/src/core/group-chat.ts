/**
 * Group Chat: a group text inside each riding group (migration 20261019400000_group_chat.sql).
 *
 * Everyone in the group reads and posts; nobody else can. A message can be about one of the
 * sender's rides, so the group can talk about an upcoming ride, one happening now, or one
 * that's over with the ride linked. Sending shows Sending, then Sent, or Not Sent with Retry,
 * the same as ride chat (core/chat).
 */

export type GroupMessage = {
  id: string;
  group_id: string;
  user_id: string;
  body: string;
  /** The ride this message is about, or null. */
  ride_id: string | null;
  sent_at: string;
  created_at: string;
};

/** A ride the chat talks about, as everyone in the group sees it. */
export type ChatRide = {
  id: string;
  name: string;
  meet_at: string;
  status: string;
  invite_code: string;
};

/** A message on its way out: Sending, or Not Sent with Retry and Remove. */
export type PendingGroupMessage = {
  localId: string;
  body: string;
  rideId: string | null;
  state: 'sending' | 'failed';
  error?: string;
  at: string;
};

/** One line per group on the Riding Groups screen. */
export type GroupChatSummary = {
  group_id: string;
  last_body: string | null;
  last_user_id: string | null;
  last_at: string | null;
  unread: number;
  muted: boolean;
};

export const NOT_SWITCHED_ON = 'Group Chat isn’t switched on yet. It starts working with the next server update.';

/** True when the database doesn't have the Group Chat update yet. */
export function groupChatNotSwitchedOn(message: string | null | undefined, code?: string | null): boolean {
  if (code && ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(code)) return true;
  return (
    !!message
    && /group_messages|group_chat|my_group_chats|clear_group_message|mark_group_chat_read|set_group_chat_muted|group_chat_rides/i.test(message)
    && /does not exist|schema cache|could not find|relation|function/i.test(message)
  );
}

/** Turn a database error into something a rider can act on. */
export function friendlyGroupChatError(message: string): string {
  if (groupChatNotSwitchedOn(message)) return NOT_SWITCHED_ON;
  if (/only the sender or the group/i.test(message)) return 'Only the person who sent it, or whoever runs the group, can clear it.';
  if (/network request failed|failed to fetch|fetch failed|network error/i.test(message)) return 'No signal. Check your connection and tap Retry.';
  if (/slow down/i.test(message)) return 'You’re sending a lot. Wait a minute and try again.';
  if (/row-level security|violates row-level/i.test(message)) return 'Only riders in this group can post here, about rides they’re on.';
  if (/too long/i.test(message)) return 'Keep it under 500 characters.';
  if (/group not found/i.test(message)) return 'You’re no longer in this group.';
  return message;
}

const byTime = (a: GroupMessage, b: GroupMessage) =>
  Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id);

/** Add messages without duplicates, oldest first, keeping the newest `limit`. */
export function mergeGroupMessages(current: GroupMessage[], incoming: GroupMessage[], limit = 300): GroupMessage[] {
  const seen = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) seen.set(m.id, m);
  const all = [...seen.values()].sort(byTime);
  return all.length > limit ? all.slice(all.length - limit) : all;
}

/**
 * Replace the loaded messages with a fresh page (newest `limit`), so cleared messages go away.
 * Messages that arrived after the page was read stay, and older ones stay when the page was full.
 */
export function reconcileGroupMessages(current: GroupMessage[], page: GroupMessage[], limit: number): GroupMessage[] {
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
  return mergeGroupMessages(keep, page);
}

const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** "Today", "Yesterday", or "Sat, Oct 17" (with the year when it isn't this year). */
export function dayLabel(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  const days = Math.round((startOfDay(now) - startOfDay(t)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  const d = new Date(t);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** How a message sits in the conversation: a new day above it, and whether it starts a run. */
export type ThreadRow = {
  message: GroupMessage;
  day: string | null;
  firstInRun: boolean;
  lastInRun: boolean;
  /** The talk turns to this message's ride: show its ticket (once, not on every reply about it). */
  newRide: boolean;
};

/** A run is one person's messages within 5 minutes of each other on the same day. */
const RUN_GAP_MS = 5 * 60_000;

export function threadRows(messages: GroupMessage[], now = Date.now()): ThreadRow[] {
  return messages.map((m, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const day = dayLabel(m.created_at, now);
    const newDay = !prev || dayLabel(prev.created_at, now) !== day;
    const joins = (a: GroupMessage | undefined, b: GroupMessage | undefined) =>
      !!a && !!b && a.user_id === b.user_id && a.ride_id === b.ride_id
      && Math.abs(Date.parse(b.created_at) - Date.parse(a.created_at)) <= RUN_GAP_MS
      && dayLabel(a.created_at, now) === dayLabel(b.created_at, now);
    const newRide = !!m.ride_id && (newDay || prev?.ride_id !== m.ride_id);
    return { message: m, day: newDay ? day : null, firstInRun: !joins(prev, m), lastInRun: !joins(m, next), newRide };
  });
}

export type RidePhase = 'live' | 'upcoming' | 'over';

export function ridePhase(r: Pick<ChatRide, 'status'>): RidePhase {
  if (r.status === 'live') return 'live';
  if (r.status === 'scheduled') return 'upcoming';
  return 'over';
}

/** The small line on a ride ticket: "Riding Now", "Sat, Oct 17, 8:00 AM", "Ride Over" or "Cancelled". */
export function rideWhen(r: Pick<ChatRide, 'status' | 'meet_at'>, now = Date.now()): string {
  if (r.status === 'live') return 'Riding Now';
  if (r.status === 'cancelled') return 'Cancelled';
  if (r.status !== 'scheduled') return 'Ride Over';
  const day = dayLabel(r.meet_at, now);
  const time = new Date(r.meet_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day === 'Today' ? 'Today' : day === 'Yesterday' ? 'Yesterday' : day}, ${time}`;
}

/** Rides ended this long ago can still be talked about (the after-ride stories). */
const PAST_WINDOW_MS = 30 * 86_400_000;

/**
 * The rides a rider can link a message to: ones they're on that are happening now, coming up,
 * or ended in the last 30 days. Riding now first, then the soonest, then the most recent past.
 */
export function talkableRides(rides: ChatRide[], now = Date.now()): ChatRide[] {
  const rank = { live: 0, upcoming: 1, over: 2 } as const;
  return rides
    .filter((r) => r.status !== 'cancelled' && (ridePhase(r) !== 'over' || now - Date.parse(r.meet_at) <= PAST_WINDOW_MS))
    .sort((a, b) => {
      const pa = ridePhase(a);
      const pb = ridePhase(b);
      if (pa !== pb) return rank[pa] - rank[pb];
      const d = Date.parse(a.meet_at) - Date.parse(b.meet_at);
      return pa === 'over' ? -d : d;
    });
}

/** The rides the chat talks about, newest mention first, for the filter strip. */
export function ridesTalkedAbout(messages: GroupMessage[], rides: ChatRide[]): ChatRide[] {
  const byId = new Map(rides.map((r) => [r.id, r]));
  const out: ChatRide[] = [];
  const seen = new Set<string>();
  for (let i = messages.length - 1; i >= 0; i--) {
    const id = messages[i].ride_id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const r = byId.get(id);
    if (r) out.push(r);
  }
  return out;
}

/** "3 new", "99+ new", or nothing. */
export function unreadLabel(n: number): string | null {
  if (n <= 0) return null;
  return n > 99 ? '99+ New' : `${n} New`;
}

/** The preview line under a group: "You: See you there" or "Dusty: Count me in". */
export function previewLine(s: Pick<GroupChatSummary, 'last_body' | 'last_user_id'>, me: string | null | undefined, nameOf: (id: string) => string): string | null {
  if (!s.last_body || !s.last_user_id) return null;
  return `${s.last_user_id === me ? 'You' : nameOf(s.last_user_id)}: ${s.last_body}`;
}
