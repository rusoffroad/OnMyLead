/**
 * Events (2.0): rallies, poker runs, meetups and ride weekends with an agenda and their group rides.
 * The shared rules for every device: what an event looks like on the wire, the form checks, the
 * date and agenda wording, and the event's link. Pure TypeScript, unit tested in core/__tests__.
 *
 * The server is the judge (migration 20261102950000_events.sql): only Pro creates, hosts edit, a
 * host links only rides they organize, and a private ride's code only reaches its riders.
 */

import { SITE_URL } from './ride-link';

import { coreLocale, tc } from './i18n';
export const EVENT_PHOTO_BUCKET = 'event-photos';
/** Longest side of a saved event photo, in pixels (wide photos stay wide, unlike profile pictures). */
export const EVENT_PHOTO_MAX = 1600;
export const EVENT_PHOTO_QUALITY = 0.72;
export const MAX_EVENT_PHOTOS = 12;
export const MAX_EVENT_DAYS = 31;
export const MAX_COHOSTS = 10;

export const EVENTS_NOT_SWITCHED_ON = 'Events aren’t switched on yet. They start working with the next server update.';

/**
 * The one explainer for "Event or Public Ride?", shown on Events, Find a Ride and both Create
 * screens on every device, and matched by the Help Center's Events guide. Riders asked what the
 * difference is (2026-11-03).
 */
export const EVENT_OR_RIDE = {
  question: 'Event or Public Ride?',
  link: 'What’s the Difference?',
  ride: {
    title: 'Public Ride',
    text: 'One ride on one day: a leader, a meeting point and a time. Anyone nearby finds it in Find a Ride, joins, and rides together in Ride Mode.',
  },
  event: {
    title: 'Event',
    text: 'A bigger gathering, like a rally, poker run or ride weekend. It has dates, a place, photos, an agenda and Going or Interested, and it can hold several group rides you join one by one.',
  },
  pick: 'Just riding? Create a Public Ride. Running a rally or a weekend? Create an Event and add its rides to it.',
} as const;

export type EventStatus = 'scheduled' | 'cancelled';
export type EventVisibility = 'public' | 'unlisted';
export type Rsvp = 'going' | 'interested';

export type AgendaKind =
  | 'ride' | 'concert' | 'raffle' | 'poker_run' | 'show' | 'contest' | 'meal' | 'meeting' | 'vendor' | 'other';

/** Agenda kinds in the order the picker shows them, with their names. */
export const AGENDA_KINDS: { kind: AgendaKind; label: string }[] = [
  { kind: 'ride', label: 'Group Ride' },
  { kind: 'poker_run', label: 'Poker Run' },
  { kind: 'concert', label: 'Concert' },
  { kind: 'raffle', label: 'Raffle' },
  { kind: 'show', label: 'Show' },
  { kind: 'contest', label: 'Contest' },
  { kind: 'meal', label: 'Food' },
  { kind: 'vendor', label: 'Vendors' },
  { kind: 'meeting', label: 'Meetup' },
  { kind: 'other', label: 'Other' },
];

export function agendaKindLabel(kind: string): string {
  return AGENDA_KINDS.find((k) => k.kind === kind)?.label ?? tc('Other');
}

/** Each agenda kind's color on the timeline: red for riding, gold for prizes, blue for the rest. */
export function agendaKindTone(kind: string): 'red' | 'gold' | 'blue' {
  if (kind === 'ride' || kind === 'poker_run') return 'red';
  if (kind === 'raffle' || kind === 'contest' || kind === 'show') return 'gold';
  return 'blue';
}

export type Person = { id: string; name: string };

export type AgendaItem = {
  id: string; kind: AgendaKind; title: string; starts_at: string; ends_at: string | null; place: string | null; details: string | null;
};

export type EventRide = {
  ride_id: string; name: string; meet_at: string; status: string; label: string | null;
  meet_area_label: string | null; visibility: string; join_policy: string; route_miles: number | null; difficulty: string | null;
  /** Null for a private ride the viewer isn't on: its code is its invitation. */
  invite_code: string | null;
  going: number;
  manager: Person | null;
  my_status: string | null;
  i_manage: boolean;
};

export type EventDetail = {
  id: string; share_code: string; title: string; details: string | null;
  starts_at: string; ends_at: string;
  location_name: string; location_address: string | null; lat: number | null; lng: number | null; state: string | null;
  website_url: string | null; visibility: EventVisibility; status: EventStatus; hidden: boolean; hidden_reason: string | null;
  am_owner: boolean; am_host: boolean;
  /** Null signed out: names only reach signed-in riders. */
  owner: Person | null;
  hosts: Person[];
  photos: { id: string; path: string }[];
  agenda: AgendaItem[];
  rides: EventRide[];
  rsvp: { going: number; interested: number; mine: Rsvp | null };
  going_riders: Person[];
};

export type EventCard = {
  id: string; share_code: string; title: string; starts_at: string; ends_at: string;
  location_name: string; state: string | null; lat: number | null; lng: number | null;
  status: EventStatus; visibility: EventVisibility; hidden: boolean;
  cover_path: string | null; going: number; rides: number; agenda: number;
  mine: Rsvp | null; i_host: boolean; distance_mi: number | null;
};

/** https://onmylead.com/e/CODE */
export function eventLink(shareCode: string, webUrl?: string | null): string {
  const base = (webUrl || SITE_URL).replace(/\/+$/, '');
  return `${base}/e/${encodeURIComponent(shareCode)}`;
}

/** The public address of an event photo, or null if the path isn't inside that event's folder. */
export function eventPhotoUrl(supabaseUrl: string, path: string | null | undefined, eventId?: string): string | null {
  if (!path || path.length > 140 || !/^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,80}$/i.test(path)) return null;
  if (eventId && !path.startsWith(`${eventId}/`)) return null;
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${EVENT_PHOTO_BUCKET}/${path}`;
}

/** A new photo file name inside the event's folder: a random token plus the time. */
export function eventPhotoPath(eventId: string, token: string, now: number = Date.now()): string {
  const clean = token.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 32);
  if (clean.length < 16) throw new Error('photo token too short');
  return `${eventId}/${clean}-${now}.jpg`;
}

/** The resize that keeps a photo's shape with its longest side at most `max` pixels (no upscaling). */
export function fitWithin(width: number, height: number, max: number = EVENT_PHOTO_MAX): { width: number; height: number } {
  const w = Math.max(1, Math.round(width || 1));
  const h = Math.max(1, Math.round(height || 1));
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "MAY" and "1": the date block on event cards (local time). */
export function dateBlock(iso: string): { month: string; day: string } {
  const d = new Date(iso);
  return { month: MONTHS[d.getMonth()].toUpperCase(), day: String(d.getDate()) };
}

/** "Fri, May 1", "May 1-3, 2031" or "May 30 - Jun 2" (local time). The year shows when it isn't this year. */
export function eventDates(startIso: string, endIso: string, now: Date = new Date()): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const year = (d: Date) => (d.getFullYear() !== now.getFullYear() ? `, ${d.getFullYear()}` : '');
  const sameDay = s.toDateString() === e.toDateString();
  if (sameDay || e < s) return `${DAYS[s.getDay()]}, ${MONTHS[s.getMonth()]} ${s.getDate()}${year(s)}`;
  if (s.getFullYear() !== e.getFullYear()) {
    return `${MONTHS[s.getMonth()]} ${s.getDate()}, ${s.getFullYear()} - ${MONTHS[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
  }
  if (s.getMonth() === e.getMonth()) return `${MONTHS[s.getMonth()]} ${s.getDate()}-${e.getDate()}${year(e)}`;
  return `${MONTHS[s.getMonth()]} ${s.getDate()} - ${MONTHS[e.getMonth()]} ${e.getDate()}${year(e)}`;
}

/** "8:00 AM" (local). */
export function clock(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "8:00 AM" or "8:00 - 11:30 PM"-style range for an agenda item. */
export function agendaTime(item: Pick<AgendaItem, 'starts_at' | 'ends_at'>): string {
  if (!item.ends_at) return clock(item.starts_at);
  return `${clock(item.starts_at)} - ${clock(item.ends_at)}`;
}

/** Where the event stands now: upcoming, happening now, over, or cancelled. */
export function eventPhase(e: { starts_at: string; ends_at: string; status: string }, now: Date = new Date()): 'upcoming' | 'now' | 'over' | 'cancelled' {
  if (e.status === 'cancelled') return 'cancelled';
  const t = now.getTime();
  if (t > Date.parse(e.ends_at)) return 'over';
  if (t >= Date.parse(e.starts_at)) return 'now';
  return 'upcoming';
}

export type AgendaDay = { key: string; title: string; items: AgendaItem[] };

/** The agenda by day ("Friday, May 1"), in time order; each day keeps its items in time order. */
export function agendaByDay(items: AgendaItem[]): AgendaDay[] {
  const sorted = [...items].sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.title.localeCompare(b.title));
  const days: AgendaDay[] = [];
  for (const it of sorted) {
    const d = new Date(it.starts_at);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    let day = days[days.length - 1];
    if (!day || day.key !== key) {
      day = { key, title: `${LONG_DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`, items: [] };
      days.push(day);
    }
    day.items.push(it);
  }
  return days;
}

/** The days an event covers (local midnight of each), for agenda day chips. At most MAX_EVENT_DAYS + 1. */
export function eventDays(startIso: string, endIso: string): Date[] {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const out: Date[] = [];
  const d = new Date(s.getFullYear(), s.getMonth(), s.getDate());
  const last = new Date(e.getFullYear(), e.getMonth(), e.getDate());
  while (d <= last && out.length <= MAX_EVENT_DAYS) {
    out.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** "Fri May 1" for a day chip. */
export function dayChip(d: Date): string {
  return `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** "12 Going", "1 Going · 3 Interested" style count line (no names). */
export function rsvpLine(r: { going: number; interested: number }): string {
  const parts: string[] = [];
  if (r.going) parts.push(`${r.going.toLocaleString(coreLocale())} Going`);
  if (r.interested) parts.push(`${r.interested.toLocaleString(coreLocale())} Interested`);
  return parts.length ? parts.join(', ') : tc('Be the first to say you’re going');
}

export type EventForm = {
  title: string; details: string; startDay: Date | null; startMinutes: number | null; endDay: Date | null; endMinutes: number | null;
  locationName: string; locationAddress: string; lat: number | null; lng: number | null; state: string | null;
  websiteUrl: string; visibility: EventVisibility;
};

/** Checks the form and returns the server's fields, or the first problem in plain words. */
export function eventPayload(f: EventForm, now: Date = new Date()): { ok: true; payload: Record<string, unknown> } | { ok: false; error: string } {
  const title = f.title.trim();
  if (title.length < 2) return { ok: false, error: tc('Give the event a name.') };
  if (title.length > 100) return { ok: false, error: tc('Keep the name under 100 characters.') };
  if (!f.startDay) return { ok: false, error: tc('Pick the day the event starts.') };
  const start = at(f.startDay, f.startMinutes ?? 9 * 60);
  const end = at(f.endDay ?? f.startDay, f.endMinutes ?? (f.endDay && !sameDate(f.endDay, f.startDay) ? 17 * 60 : Math.max(f.startMinutes ?? 9 * 60, 17 * 60)));
  if (end < start) return { ok: false, error: tc('The event can’t end before it starts.') };
  if (end.getTime() - start.getTime() > MAX_EVENT_DAYS * 86400000) return { ok: false, error: tc('An event can last up to {MAX_EVENT_DAYS} days.', { MAX_EVENT_DAYS }) };
  if (end.getTime() < now.getTime() - 86400000) return { ok: false, error: tc('Pick dates that haven’t passed.') };
  if (!f.locationName.trim()) return { ok: false, error: tc('Say where the event is: a venue, park or town.') };
  if (f.details.length > 5000) return { ok: false, error: tc('Keep the details under 5,000 characters.') };
  const web = f.websiteUrl.trim();
  if (web && !/^(https?:\/\/)?[^\s/$.?#][^\s]*\.[^\s]{2,}$/i.test(web)) return { ok: false, error: tc('Check the website address.') };
  return {
    ok: true,
    payload: {
      title, details: f.details.trim(), starts_at: start.toISOString(), ends_at: end.toISOString(),
      location_name: f.locationName.trim(), location_address: f.locationAddress.trim(),
      lat: f.lat, lng: f.lng, state: f.state, website_url: web, visibility: f.visibility,
    },
  };
}

function at(day: Date, minutes: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60);
}
function sameDate(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** A local Date at the given minutes after midnight on `day`. */
export const atMinutesOf = at;

/** Minutes after local midnight. */
export function minutesOf(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

/** A friendly message for a server refusal. */
export function friendlyEventError(message: string): string {
  if (/save_event|events_list|event_detail|rider_events|schema cache|does not exist|PGRST202/i.test(message)) return EVENTS_NOT_SWITCHED_ON;
  if (/event not found/i.test(message)) return tc('We couldn’t find that event. It may have been removed, or the link is wrong.');
  const clean = message.replace(/^.*?ERROR:\s*/i, '').trim();
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1).replace(/([^.!?])$/, '$1.') : tc('Something went wrong.');
}

/** What the RSVP buttons say and do. */
export function nextRsvp(current: Rsvp | null, tapped: Rsvp): Rsvp | null {
  return current === tapped ? null : tapped;
}

/** Upcoming events first (soonest first), then the ones that are over (latest first). */
export function sortCards(cards: EventCard[], now: Date = new Date()): EventCard[] {
  const t = now.getTime();
  const live = cards.filter((c) => Date.parse(c.ends_at) >= t).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = cards.filter((c) => Date.parse(c.ends_at) < t).sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  return [...live, ...past];
}

/** "Moab, UT · 12 mi" style place line for a card. */
export function cardPlace(c: Pick<EventCard, 'location_name' | 'state' | 'distance_mi'>): string {
  const where = c.state && !c.location_name.includes(c.state) ? `${c.location_name}, ${c.state}` : c.location_name;
  if (c.distance_mi == null) return where;
  return tc('{where}, {v} away', { where, v: c.distance_mi < 1 ? 'under 1 mi' : `${Math.round(c.distance_mi).toLocaleString(coreLocale())} mi` });
}

/** Riders who can be picked as a co-host or ride manager: friends and ride mates, once each, not me. */
export function pickablePeople(friends: Person[], mates: Person[], me: string | null | undefined, exclude: string[] = []): Person[] {
  const seen = new Set<string>([...(me ? [me] : []), ...exclude]);
  const out: Person[] = [];
  for (const p of [...friends, ...mates]) {
    if (!p.id || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push({ id: p.id, name: p.name?.trim() || tc('Rider') });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
