/**
 * The Notifications inbox: the notifications OnMyLead sent a rider, listed under the bell on the
 * Rides tab on every device (see migration 20261102100000_notification_inbox.sql, which saves a
 * row each time a push goes out, and lib/inbox.ts).
 *
 * Pure helpers only: grouping, labels, icons, and matching an inbox row to a notification on the
 * phone, so a tap or a clear in one place clears the other.
 */
import { tapData, type TapData } from './push-tap';

import { coreLocale, tc } from './i18n';
export type InboxItem = {
  id: string;
  kind: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  /** Messages in the same chat fold into one row; this is how many. */
  count: number;
  created_at: string;
  read_at: string | null;
};

export const INBOX_NOT_SWITCHED_ON = 'Saved notifications are almost ready. They switch on with the next server update.';

/** The table or functions aren't there yet (the migration hasn't run). */
export function inboxNotSwitchedOn(message: string | null | undefined, code?: string | null): boolean {
  if (code && ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(code)) return true;
  return !!message && /notification/i.test(message) && /does not exist|schema cache|could not find/i.test(message);
}

export function unreadCount(items: readonly InboxItem[]): number {
  return items.reduce((n, i) => n + (i.read_at ? 0 : 1), 0);
}

/** The number on the bell: nothing at 0, then 1 to 99, then 99+. */
export function badgeText(n: number): string {
  if (n <= 0) return '';
  return n > 99 ? '99+' : String(n);
}

/** "+2 More" under a chat row that holds three messages. */
export function moreText(count: number): string | null {
  return count > 1 ? tc('+{v} More', { v: count - 1 }) : null;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export type InboxSection = { title: 'Today' | 'Yesterday' | 'Earlier'; items: InboxItem[] };

/** Newest first, under Today, Yesterday and Earlier (in the phone's own time zone). Empty sections are left out. */
export function groupInbox(items: readonly InboxItem[], now: Date = new Date()): InboxSection[] {
  const today = startOfDay(now);
  const yesterday = today - 86_400_000;
  const sorted = [...items].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const sections: InboxSection[] = [
    { title: 'Today', items: [] },
    { title: 'Yesterday', items: [] },
    { title: 'Earlier', items: [] },
  ];
  for (const i of sorted) {
    const t = Date.parse(i.created_at);
    sections[t >= today ? 0 : t >= yesterday ? 1 : 2].items.push(i);
  }
  return sections.filter((s) => s.items.length);
}

/** When it came in, short: Now, 5m, 3h; then a time for yesterday, a weekday this week, or a date. */
export function whenText(iso: string, now: Date = new Date()): string {
  const t = Date.parse(iso);
  const mins = Math.floor((now.getTime() - t) / 60_000);
  if (mins < 1) return tc('Now');
  if (mins < 60) return `${mins}m`;
  const d = new Date(t);
  if (t >= startOfDay(now)) return `${Math.floor(mins / 60)}h`;
  if (t >= startOfDay(now) - 86_400_000) return d.toLocaleTimeString(coreLocale(), { hour: 'numeric', minute: '2-digit' });
  if (t >= startOfDay(now) - 6 * 86_400_000) return d.toLocaleDateString(coreLocale(), { weekday: 'short' });
  return d.toLocaleDateString(coreLocale(), { month: 'short', day: 'numeric' });
}

export type InboxTone = 'alert' | 'status' | 'chat' | 'ride' | 'social' | 'account' | 'quiet';
export type InboxIcon = 'warning' | 'flagged' | 'chat' | 'flag' | 'clock' | 'pin' | 'close' | 'people' | 'mail' | 'addFriend' | 'star' | 'map' | 'check' | 'bell' | 'heart';

/** The icon and color family for a row, from its type. */
export function inboxLook(item: Pick<InboxItem, 'kind' | 'data'>): { icon: InboxIcon; tone: InboxTone } {
  const d = item.data ?? {};
  switch (item.kind) {
    case 'status':
      return d.status === 'need_help' || d.status === 'emergency' ? { icon: 'warning', tone: 'alert' } : { icon: 'flagged', tone: 'status' };
    case 'cancelled':
      return { icon: 'check', tone: 'quiet' };
    case 'message':
      return typeof d.itemId === 'string' ? { icon: 'flagged', tone: 'status' } : { icon: 'chat', tone: 'chat' };
    case 'group_message':
      return { icon: 'chat', tone: 'chat' };
    case 'direct_message':
      return { icon: 'mail', tone: 'chat' };
    case 'ride':
      if (d.change === 'live') return { icon: 'flag', tone: 'alert' };
      if (d.change === 'cancelled' || d.change === 'deleted') return { icon: 'close', tone: 'quiet' };
      if (d.change === 'place') return { icon: 'pin', tone: 'ride' };
      return { icon: 'clock', tone: 'ride' };
    case 'member':
      return { icon: 'people', tone: 'ride' };
    case 'invite':
    case 'leader_ride':
      return { icon: 'flag', tone: 'social' };
    case 'friend_request':
    case 'friend_accept':
      return { icon: 'addFriend', tone: 'social' };
    case 'feed_like':
      return { icon: 'heart', tone: 'social' };
    case 'feed_comment':
      return { icon: 'chat', tone: 'social' };
    case 'badge':
    case 'trial':
    case 'referral':
      return { icon: 'star', tone: 'account' };
    case 'trail_hidden':
      return { icon: 'map', tone: 'account' };
    default:
      return { icon: 'bell', tone: 'quiet' };
  }
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : '');

/**
 * Which conversation or event a notification is about, so an inbox row and the notification on
 * the phone can be matched (the push and the row carry the same data). Chat matches by
 * conversation, since chat rows fold together; status taps by the tap itself.
 */
export function notificationKey(raw: unknown): string | null {
  const d: TapData | undefined = tapData(raw);
  if (!d || typeof d.type !== 'string') return null;
  if ((d.type === 'status' || d.type === 'cancelled' || d.type === 'message') && str(d.itemId)) return `item:${str(d.itemId)}`;
  if (d.type === 'message') return `chat:${str(d.rideId)}`;
  if (d.type === 'group_message') return `group:${str(d.groupId)}`;
  if (d.type === 'direct_message') return `dm:${str(d.userId)}`;
  if (d.type === 'feed_like' || d.type === 'feed_comment') return `${d.type}:${str(d.key)}`;
  const extra = d as Record<string, unknown>;
  return [d.type, str(d.rideId), str(d.change), str(extra.trailId), str(extra.stage)].join(':');
}
