/**
 * Out Riding: see who else is out riding near you, and message them (migration
 * 20261101700000_out_riding.sql). Like "online" in a game, for riders.
 *
 * The rules that keep it private live in the database: it's off until a rider switches it on,
 * only a rough area is kept (snapped to about a mile), other riders only ever get a name and whole
 * miles, you only see others while you're Out Riding yourself, strangers see each other only when
 * both chose Everyone Nearby, blocking hides both ways, and it turns itself off. This file holds
 * the choices and the words the screens show.
 */

/** Who can see me while I'm Out Riding. */
export type Audience = 'riders' | 'everyone';

/** My own status, as the database keeps it (only I can read my row). */
export type MyOutRiding = {
  audience: Audience;
  spot: string | null;
  started_at: string;
  refreshed_at: string;
  expires_at: string;
};

/** A rider in the Out Riding list. Never a position: just whole miles. */
export type NearbyRider = {
  user_id: string;
  display_name: string;
  photo_url: string | null;
  /** Whole miles; 0 means under a mile. Rounded to 5 past 10 miles. */
  miles: number;
  spot: string | null;
  /** Ridden together, or in a riding group together. */
  known: boolean;
  since: string;
  riding_types: string[] | null;
};

/** One conversation in the Messages list. */
export type DmThread = {
  thread_id: string;
  other_id: string;
  other_name: string;
  last_body: string | null;
  last_sender_id: string | null;
  last_at: string | null;
  unread: number;
  muted: boolean;
  cleared_at: string | null;
};

export type DirectMessage = {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  sent_at: string;
  created_at: string;
};

/** How far to look. The database never looks past 50 miles. */
export const RADIUS_OPTIONS = [10, 25, 50] as const;
export type Radius = (typeof RADIUS_OPTIONS)[number];
export const DEFAULT_RADIUS: Radius = 10;

/** How long it stays on. The database allows 1 hour to 3 days. */
export const DURATION_OPTIONS: { hours: number; label: string }[] = [
  { hours: 4, label: '4 Hours' },
  { hours: 12, label: 'Today' },
  { hours: 72, label: 'This Weekend' },
];
export const DEFAULT_HOURS = 12;

/** Listed for this long after the app was last opened; the database uses the same number. */
export const IDLE_HOURS = 6;

/** Refresh the area at most this often while the app is open (the database allows 30 an hour). */
export const REFRESH_EVERY_MS = 10 * 60_000;

export const MAX_SPOT_LENGTH = 40;

export const AUDIENCE_CHOICES: { value: Audience; title: string; detail: string }[] = [
  {
    value: 'riders',
    title: 'Riders I Know',
    detail: 'Only riders you’ve been on a ride with or share a riding group with can see you.',
  },
  {
    value: 'everyone',
    title: 'Everyone Nearby',
    detail: 'Any OnMyLead rider who is Out Riding nearby and also picked Everyone Nearby. Handy at a park for the weekend.',
  },
];

/** Is my status on right now? Past its end, or idle too long, it's off. */
export function isOut(me: MyOutRiding | null | undefined, now = Date.now()): boolean {
  if (!me) return false;
  return Date.parse(me.expires_at) > now && Date.parse(me.refreshed_at) > now - IDLE_HOURS * 3_600_000;
}

/** "Under a Mile", "About 1 Mile", "About 15 Miles". Never more exact than that. */
export function distanceLabel(miles: number): string {
  if (!Number.isFinite(miles) || miles < 1) return 'Under a Mile';
  const m = Math.round(miles);
  return `About ${m} ${m === 1 ? 'Mile' : 'Miles'}`;
}

/** "Out for 25 Min", "Out for 3 Hr", "Out Since Sat". */
export function outSince(iso: string, now = Date.now()): string {
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (min < 1) return 'Just Started';
  if (min < 60) return `Out for ${min} Min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `Out for ${hr} Hr`;
  return `Out Since ${new Date(iso).toLocaleDateString('en-US', { weekday: 'short' })}`;
}

/** "On for 3 More Hours", "On Until Sun 6 PM". */
export function endsLabel(expiresAt: string, now = Date.now()): string {
  const ms = Date.parse(expiresAt) - now;
  if (ms <= 0) return 'Ended';
  const min = Math.round(ms / 60_000);
  if (min < 60) return `On for ${min} More Min`;
  const hr = Math.round(min / 60);
  if (hr <= 12) return `On for ${hr} More ${hr === 1 ? 'Hour' : 'Hours'}`;
  const d = new Date(expiresAt);
  const day = d.toLocaleDateString('en-US', { weekday: 'short' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: d.getMinutes() ? '2-digit' : undefined });
  return `On Until ${day} ${time}`;
}

/** Riders I know first, then nearest, then by name. */
export function sortNearby(list: NearbyRider[]): NearbyRider[] {
  return [...list].sort(
    (a, b) => Number(b.known) - Number(a.known) || a.miles - b.miles
      || a.display_name.localeCompare(b.display_name, undefined, { sensitivity: 'base' }),
  );
}

/** The count line under the switch: "2 Riders You Know Out Nearby", "Nobody Else Out Nearby Yet". */
export function countLine(list: NearbyRider[], radius: number): string {
  if (!list.length) return `Nobody Else Out Within ${radius} Miles Yet`;
  const known = list.filter((r) => r.known).length;
  const others = list.length - known;
  const parts: string[] = [];
  if (known) parts.push(`${known} ${known === 1 ? 'Rider' : 'Riders'} You Know`);
  if (others) parts.push(`${others} ${others === 1 ? 'Other Rider' : 'Other Riders'}`);
  return `${parts.join(' and ')} Out Within ${radius} Miles`;
}

/** The spot as typed, tidied: trimmed, one space between words, at most 40 characters. */
export function tidySpot(raw: string): string | null {
  const s = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_SPOT_LENGTH).trim();
  return s || null;
}

export const NOT_SWITCHED_ON = 'Out Riding isn’t switched on yet. It starts working with the next server update.';

/** True when the database doesn't have the Out Riding update yet. */
export function outRidingNotSwitchedOn(message: string | null | undefined, code?: string | null): boolean {
  if (code && ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(code)) return true;
  return (
    !!message
    && /out_riding|nearby_riders|direct_message|dm_thread|my_dm_threads|mark_dm_read|set_dm_muted|clear_dm_thread|dm_reads/i.test(message)
    && /does not exist|schema cache|could not find|relation|function/i.test(message)
  );
}

/** Turn a database error into something a rider can act on. */
export function friendlyOutRidingError(message: string): string {
  if (outRidingNotSwitchedOn(message)) return NOT_SWITCHED_ON;
  if (/network request failed|failed to fetch|fetch failed|network error/i.test(message)) return 'No signal. Check your connection and try again.';
  if (/out_riding_rate/i.test(message)) return 'Your area was updated a lot this hour. It’ll update again soon.';
  if (/a location is needed/i.test(message)) return 'OnMyLead needs your location to show who’s out near you.';
  if (/slow down/i.test(message)) return 'You’re sending a lot. Wait a minute and try again.';
  if (/dm_daily_limit/i.test(message)) return 'You’ve hit today’s message limit. Try again tomorrow.';
  if (/dm_wait_for_reply/i.test(message)) return 'Wait for them to reply before sending more.';
  if (/dm_you_blocked/i.test(message)) return 'You blocked this rider. Unblock them from You, Blocked Riders to message them.';
  if (/dm_not_allowed/i.test(message)) return 'You can message riders you see Out Riding near you, or riders you’ve ridden with.';
  if (/too long/i.test(message)) return 'Keep it under 500 characters.';
  if (/conversation not found/i.test(message)) return 'This conversation isn’t available.';
  return message;
}

/** Until they reply, this many messages can go to someone. Same as the database. */
export const MESSAGES_BEFORE_REPLY = 3;

/** How many more I can send before they reply, or null when they've replied (no cap). */
export function leftBeforeReply(messages: Pick<DirectMessage, 'sender_id'>[], me: string | null | undefined): number | null {
  if (!me) return null;
  if (messages.some((m) => m.sender_id !== me)) return null;
  return Math.max(0, MESSAGES_BEFORE_REPLY - messages.filter((m) => m.sender_id === me).length);
}

/** Add messages without duplicates, oldest first, keeping the newest `limit`. */
export function mergeDirectMessages(current: DirectMessage[], incoming: DirectMessage[], limit = 300): DirectMessage[] {
  const seen = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) seen.set(m.id, m);
  const all = [...seen.values()].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id));
  return all.length > limit ? all.slice(all.length - limit) : all;
}

/** The line under a conversation: "You: On my way" or "Where are you parked?". */
export function dmPreview(t: Pick<DmThread, 'last_body' | 'last_sender_id'>, me: string | null | undefined): string | null {
  if (!t.last_body) return null;
  return t.last_sender_id === me ? `You: ${t.last_body}` : t.last_body;
}

/** Total unread across conversations, for the badge on the Messages row. Muted ones don't count. */
export function totalUnread(threads: Pick<DmThread, 'unread' | 'muted'>[]): number {
  return threads.reduce((n, t) => n + (t.muted ? 0 : Math.max(0, t.unread)), 0);
}

/** Report details when reporting from a conversation: the message, so the owner can see it. */
export function dmReportDetails(body: string | null | undefined): string {
  const b = (body ?? '').trim();
  return b ? `From a direct message: “${b.slice(0, 900)}”` : 'From a direct message.';
}

/**
 * Range rings: where a rider's dot sits. The distance from the middle is their whole miles over
 * the radius; the angle is made up from their id (same every time, so dots don't jump), so the
 * picture never says which direction anyone is.
 */
export function ringSpot(userId: string, miles: number, radius: number): { angle: number; fraction: number } {
  let h = 2166136261;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const angle = (h % 3600) / 10;
  return { angle, fraction: ringFraction(Math.max(miles, 0.5), radius) };
}

/** How far out from the middle a distance sits (0 to 1). The middle fifth is kept for "You". */
export function ringFraction(miles: number, radius: number): number {
  return 0.22 + 0.78 * Math.min(1, Math.max(0, miles) / Math.max(radius, 1));
}

/** The three rings' labels for a radius: 10 gives 3, 6 and 10 miles. */
export function ringMiles(radius: number): number[] {
  return [Math.round(radius / 3), Math.round((radius * 2) / 3), radius];
}
