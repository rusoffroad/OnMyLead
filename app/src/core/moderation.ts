// Reporting and moderation rules shared by the app and the Admin Dashboard (2.0).
// Pure TypeScript: no React Native, so it is unit tested in core/__tests__.

/** Where a report was sent from (reports.source, migration 20261102800000_abuse_reports.sql). */
export type ReportSource = 'dm' | 'group_chat' | 'ride_chat' | 'ride' | 'roster' | 'out_riding' | 'you';

export const REPORT_SOURCE_LABELS: Record<ReportSource, string> = {
  dm: 'Direct Messages',
  group_chat: 'Riding Group Chat',
  ride_chat: 'Ride Chat',
  ride: 'Ride Page',
  roster: 'Ride’s Going List',
  out_riding: 'Out Riding',
  you: 'You > Report a Rider',
};

export function reportSourceLabel(source: string | null | undefined): string | null {
  if (!source) return null;
  return REPORT_SOURCE_LABELS[source as ReportSource] ?? null;
}

/** Suspension lengths offered on the Admin Dashboard, in days. A ban has no end. */
export const SUSPEND_DAYS = [1, 7, 30, 90] as const;

export function suspendLabel(days: number): string {
  return days === 1 ? '1 Day' : `${days} Days`;
}

/** Auth has no "forever": a ban is about 100 years, so anything over 10 years counts as permanent. */
const PERMANENT_MS = 10 * 365 * 24 * 3600 * 1000;

export type Suspension = { state: 'none' } | { state: 'suspended'; until: Date } | { state: 'banned' };

export function suspensionOf(bannedUntil: string | null | undefined, now: Date = new Date()): Suspension {
  if (!bannedUntil) return { state: 'none' };
  const until = new Date(bannedUntil);
  if (Number.isNaN(until.getTime()) || until.getTime() <= now.getTime()) return { state: 'none' };
  if (until.getTime() - now.getTime() > PERMANENT_MS) return { state: 'banned' };
  return { state: 'suspended', until };
}

/** "Suspended until Nov 10", "Banned" or null, for badges on the Admin Dashboard. */
export function suspensionLabel(bannedUntil: string | null | undefined, now: Date = new Date()): string | null {
  const s = suspensionOf(bannedUntil, now);
  if (s.state === 'none') return null;
  if (s.state === 'banned') return 'Banned';
  return `Suspended until ${s.until.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: s.until.getFullYear() === now.getFullYear() ? undefined : 'numeric' })}`;
}

type Msg = { source: 'dm' | 'group_chat' | 'ride_chat'; source_id: string | null; source_name: string | null; sent_at: string };

export type Conversation<M extends Msg> = { key: string; source: M['source']; title: string; messages: M[] };

/**
 * The copied messages of a report, one conversation per direct message thread, group or ride,
 * oldest message first. Direct messages come first, then groups, then rides.
 */
export function conversationsOf<M extends Msg>(messages: M[]): Conversation<M>[] {
  const order = { dm: 0, group_chat: 1, ride_chat: 2 } as const;
  const map = new Map<string, Conversation<M>>();
  for (const m of messages) {
    const key = `${m.source}:${m.source_id ?? ''}`;
    let c = map.get(key);
    if (!c) {
      const fallback = m.source === 'dm' ? 'Direct Messages' : m.source === 'group_chat' ? 'Group Chat' : 'Ride Chat';
      const title = m.source === 'dm' ? 'Direct Messages' : `${m.source_name || fallback}${m.source === 'group_chat' ? ' (Group Chat)' : ' (Ride Chat)'}`;
      c = { key, source: m.source, title, messages: [] };
      map.set(key, c);
    }
    c.messages.push(m);
  }
  const list = [...map.values()];
  for (const c of list) c.messages.sort((a, b) => a.sent_at.localeCompare(b.sent_at));
  return list.sort((a, b) => order[a.source] - order[b.source]);
}

/** A friendly sign-in error for a suspended or banned account (Auth says "User is banned"). */
export function isBannedError(message: string): boolean {
  return /user is banned|user_banned/i.test(message);
}
export const BANNED_MESSAGE =
  'This account is suspended for breaking the OnMyLead rider rules. If you think this is a mistake, contact us at onmylead.com/contact.';

export type ReportablePerson = { userId: string; name: string; detail: string };
export type ReportableSection = { title: string; people: ReportablePerson[] };

/**
 * Who You > Report a Rider lists: riders I've messaged, my friends, riders I've ridden with or
 * share a group with, and riders I blocked (often the person being reported). Each rider once,
 * in the first section they fit; filtered by a name search.
 */
export function reportablePeople(input: {
  me: string | null;
  dms: { other_id: string; other_name: string; last_at: string | null }[];
  friends: { user_id: string; display_name: string; status: string }[];
  known: { user_id: string; display_name: string; reason: string }[];
  blocked: { userId: string; name: string }[];
  query?: string;
}): ReportableSection[] {
  const seen = new Set<string>(input.me ? [input.me] : []);
  const q = (input.query ?? '').trim().toLowerCase();
  const take = (people: ReportablePerson[]) =>
    people.filter((p) => {
      if (seen.has(p.userId)) return false;
      seen.add(p.userId);
      return !q || p.name.toLowerCase().includes(q);
    });
  const sections: ReportableSection[] = [
    { title: 'Messaged', people: take(input.dms.map((d) => ({ userId: d.other_id, name: d.other_name || 'Rider', detail: 'Direct messages' }))) },
    { title: 'Friends', people: take(input.friends.filter((f) => f.status === 'friends').map((f) => ({ userId: f.user_id, name: f.display_name || 'Rider', detail: 'Friend' }))) },
    { title: 'Ridden With', people: take(input.known.map((k) => ({ userId: k.user_id, name: k.display_name || 'Rider', detail: k.reason }))) },
    { title: 'Blocked', people: take(input.blocked.map((b) => ({ userId: b.userId, name: b.name || 'Rider', detail: 'You blocked them' }))) },
  ];
  return sections.filter((s) => s.people.length);
}
