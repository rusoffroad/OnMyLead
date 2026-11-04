/**
 * Social (2.0, migration 20261102900000_social_hub.sql): likes, comments and posts on the Feed, the
 * Social area, rider profiles and sharing to other apps. This file turns the server's rows into
 * what the screens say and holds the limits, so they're tested without a phone.
 */
import { badgeTitle, HONOR_BY_KEY, isHonor } from './badges';
import { feedLine, feedStat, parseFeed, type FeedItem } from './feed';
import { METERS_PER_MILE } from './geo';

import { coreLocale, tc } from './i18n';
/** Longest post and comment, in characters (the database checks the same). */
export const POST_MAX = 500;
export const COMMENT_MAX = 500;

/** Storage bucket for post photos (public read, owner-only write, 1 MB cap). */
export const POST_PHOTO_BUCKET = 'rider-posts';
/** Post photos are saved at most this many pixels on their long side, as JPEG at POST_PHOTO_QUALITY. */
export const POST_PHOTO_MAX = 1280;
export const POST_PHOTO_QUALITY = 0.7;
/** Never upload more than this (the bucket refuses anything over 1 MB). */
export const POST_PHOTO_MAX_BYTES = 900 * 1024;

export type CommentPreview = { id: string; authorId: string; authorName: string; body: string; at: string };

export type SocialItem = FeedItem & {
  /** Stable key for likes and comments; null for group ride invites (no likes or comments). */
  key: string | null;
  /** A post's text. */
  body: string | null;
  /** A post's photo address, or null. */
  photoUrl: string | null;
  likeCount: number;
  commentCount: number;
  liked: boolean;
  /** The latest two comments, oldest first. */
  comments: CommentPreview[];
  /** The signed-in rider's own item. */
  mine: boolean;
  /** The rider has OnMyLead Pro (the Pro tag next to their name). */
  actorPro: boolean;
};

export type Comment = { id: string; authorId: string; authorName: string; body: string; at: string; mine: boolean; canDelete: boolean };

export type FriendRelationName = 'self' | 'friends' | 'sent' | 'received' | 'none';

export type RiderProfile = {
  id: string;
  name: string;
  me: boolean;
  blocked: boolean;
  relation: FriendRelationName;
  /** Whether their activity (timeline, totals) is visible to you. */
  canSee: boolean;
  /** Has OnMyLead Pro (the Pro tag). */
  pro: boolean;
  since: string | null;
  follows: boolean;
  rides: number | null;
  miles: number | null;
  badges: number | null;
  posts: number | null;
  friends: number | null;
};

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
const int = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : 0);
const numOrNull = (v: unknown) => (v == null ? null : typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILE = /^[A-Za-z0-9._-]{1,80}$/;

/** True when `path` is a file in this rider's own folder (the same rule the database checks). */
export function isOwnFile(userId: string, path: string | null | undefined): path is string {
  if (!path || path.length > 120 || !UUID.test(userId)) return false;
  const slash = path.indexOf('/');
  if (slash < 0 || path.slice(0, slash) !== userId) return false;
  return FILE.test(path.slice(slash + 1));
}

/** The public address of a post photo, or null when the path isn't the author's own. */
export function postPhotoUrl(supabaseUrl: string, authorId: string, path: string | null | undefined): string | null {
  if (!isOwnFile(authorId, path)) return null;
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${POST_PHOTO_BUCKET}/${path}`;
}

/** A new file name for a post photo: the author's folder, a random token and the time. */
export function postPhotoPath(userId: string, token: string, now: number = Date.now()): string {
  const clean = token.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 32);
  if (clean.length < 16) throw new Error('photo token too short');
  return `${userId}/${clean}-${now}.jpg`;
}

/** The size to shrink a photo to so its long side is at most `max` (never enlarged). */
export function fitWithin(width: number, height: number, max: number = POST_PHOTO_MAX): { width: number; height: number } {
  const w = Math.max(1, Math.round(width || 1));
  const h = Math.max(1, Math.round(height || 1));
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/** The next JPEG quality to try when a saved photo is still over the size cap, or null to give up. */
export function nextQuality(quality: number, bytes: number, maxBytes: number): number | null {
  if (bytes <= maxBytes) return quality;
  const next = Math.round((quality - 0.15) * 100) / 100;
  return next >= 0.3 ? next : null;
}

function parseComments(v: unknown): CommentPreview[] {
  if (!Array.isArray(v)) return [];
  const out: CommentPreview[] = [];
  for (const c of v) {
    if (!c || typeof c !== 'object') continue;
    const o = c as Record<string, unknown>;
    if (!str(o.id) || !str(o.author_id) || !str(o.body)) continue;
    out.push({ id: o.id as string, authorId: o.author_id as string, authorName: str(o.author_name) ?? 'Rider', body: o.body as string, at: str(o.at) ?? '' });
  }
  return out;
}

/** Server rows (social_feed, rider_timeline, feed_item) to items; anything malformed is skipped. */
export function parseSocial(rows: unknown, supabaseUrl: string): SocialItem[] {
  if (!Array.isArray(rows)) return [];
  const out: SocialItem[] = [];
  for (const r of rows) {
    const item = parseFeed([r])[0];
    if (!item) continue;
    const o = r as Record<string, unknown>;
    const key = str(o.item_key);
    if (item.kind === 'post' && !key) continue;
    out.push({
      ...item,
      key,
      body: str(o.body),
      photoUrl: postPhotoUrl(supabaseUrl, item.actorId, str(o.photo_path)),
      likeCount: int(o.like_count),
      commentCount: int(o.comment_count),
      liked: o.liked === true,
      comments: parseComments(o.comments),
      mine: o.mine === true,
      actorPro: o.actor_pro === true,
    });
  }
  return out;
}

export function parseComment(rows: unknown): Comment[] {
  if (!Array.isArray(rows)) return [];
  const out: Comment[] = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    if (!str(o.id) || !str(o.author_id) || !str(o.body)) continue;
    out.push({
      id: o.id as string, authorId: o.author_id as string, authorName: str(o.author_name) ?? 'Rider', body: o.body as string,
      at: str(o.at) ?? '', mine: o.mine === true, canDelete: o.can_delete === true,
    });
  }
  return out;
}

const RELATIONS: FriendRelationName[] = ['self', 'friends', 'sent', 'received', 'none'];

export function parseProfile(v: unknown): RiderProfile | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!str(o.id)) return null;
  return {
    id: o.id as string,
    name: str(o.name) ?? tc('Rider'),
    me: o.me === true,
    blocked: o.blocked === true,
    relation: RELATIONS.includes(o.relation as FriendRelationName) ? (o.relation as FriendRelationName) : 'none',
    canSee: o.can_see === true,
    pro: o.pro === true,
    since: str(o.since),
    follows: o.follows === true,
    rides: numOrNull(o.rides),
    miles: numOrNull(o.miles),
    badges: numOrNull(o.badges),
    posts: numOrNull(o.posts),
    friends: numOrNull(o.friends),
  };
}

/** "Liked by you and 3 others", "Liked by Ben", "Be the first to like this". */
export function likesLine(count: number, liked: boolean, firstName?: string | null): string {
  const n = Math.max(0, Math.round(count));
  if (n === 0) return tc('Be the first to like this');
  if (liked) return n === 1 ? tc('You like this') : tc('You and {v} {v2} like this', { v: n - 1, v2: n - 1 === 1 ? 'other' : 'others' });
  if (n === 1) return firstName ? tc('{firstName} likes this', { firstName }) : tc('1 like');
  return `${n.toLocaleString(coreLocale())} likes`;
}

/** "1 Comment", "12 Comments", "Comment". */
export function commentsLabel(count: number): string {
  const n = Math.max(0, Math.round(count));
  return n === 0 ? tc('Comment') : `${n.toLocaleString(coreLocale())} ${n === 1 ? 'Comment' : 'Comments'}`;
}

/** Optimistic like toggle: the item as it looks right after the tap. */
export function toggleLike<T extends Pick<SocialItem, 'liked' | 'likeCount'>>(item: T): T {
  return { ...item, liked: !item.liked, likeCount: Math.max(0, item.likeCount + (item.liked ? -1 : 1)) };
}

/** What a Social card says after the name. Posts have their text in the card instead. */
export function socialLine(item: FeedItem): string {
  if (item.kind === 'post') return 'posted';
  return feedLine(item);
}

/** The Social screen's tabs. */
export type SocialTab = 'activity' | 'friends' | 'mine';
export const SOCIAL_TABS: { value: SocialTab; label: string }[] = [
  { value: 'activity', label: 'Activity' },
  { value: 'friends', label: 'Friends' },
  { value: 'mine', label: 'My Posts' },
];

/** Where to open an item on its own (likes, comments): /social/item?key=... */
export function itemHref(key: string): string {
  return `/social/item?key=${encodeURIComponent(key)}`;
}

/** A rider's profile page. */
export function profileHref(userId: string): string {
  return `/social/rider/${userId}`;
}

/** True for a key the server could have made (used before opening a link or notification). */
export function isItemKey(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 160 && /^(post|trail|ride|badge|out):[0-9a-f-]{36}(:[a-z0-9_-]{1,40}){0,2}$/i.test(v);
}

// ---------------------------------------------------------------------------
// Sharing to Facebook, Instagram, X and other apps
// ---------------------------------------------------------------------------

/**
 * Whether this item can be shared outside OnMyLead: your own activity, and trails other riders
 * shared with everyone. Other riders' posts, rides and badges are theirs to share, and group ride
 * invites are private. Out Riding is never shared (it says where you are right now).
 */
export function canShareOut(item: Pick<FeedItem, 'kind'> & { mine: boolean }): boolean {
  if (item.kind === 'group' || item.kind === 'out') return false;
  if (item.kind === 'trail') return true;
  return item.mine;
}

const miles = (mi: number) => (mi >= 10 ? Math.round(mi).toLocaleString(coreLocale()) : (Math.round(mi * 10) / 10).toString());

/** The big words on the share card, e.g. "84 Miles", "Mile Eater Gold", "Black Bear Pass". */
export function shareHeadline(item: FeedItem & { body?: string | null }): string {
  switch (item.kind) {
    case 'ride':
      return item.miles != null && item.miles > 0 ? `${miles(item.miles)} Miles` : item.title ?? tc('Ride Done');
    case 'badge':
      return item.badge ? badgeTitle(item.badge) : tc('New Badge');
    case 'trail':
      return item.title ?? tc('New Trail');
    default:
      return tc('Ride Report');
  }
}

/** The smaller line under the headline (never a place more exact than a ride or trail name). */
export function shareSubline(item: FeedItem & { body?: string | null }): string {
  switch (item.kind) {
    case 'ride': {
      const others = item.riders != null ? Math.max(0, Math.round(item.riders) - 1) : 0;
      const where = item.title ? `on ${item.title}` : 'on a group ride';
      return others > 0 ? `${where} with ${others} ${others === 1 ? 'rider' : 'riders'}` : where;
    }
    case 'badge':
      return item.badge && isHonor(item.badge.badge) ? tc('Given by OnMyLead') : tc('Badge earned on OnMyLead');
    case 'trail': {
      const len = item.lengthM != null && item.lengthM > 0 ? `${miles(item.lengthM / METERS_PER_MILE)} mi custom trail` : 'Custom trail';
      return tc('{len} on OnMyLead', { len });
    }
    default:
      return item.body ?? '';
  }
}

/**
 * The text that goes with the share (the caption, or the whole share where an app takes no
 * picture). First person for your own things. Always ends with the OnMyLead link.
 */
export function shareText(item: FeedItem & { body?: string | null; mine: boolean }, link: string): string {
  const who = item.mine ? 'I' : item.actorName;
  let text: string;
  switch (item.kind) {
    case 'ride': {
      const stat = feedStat(item);
      const others = item.riders != null ? Math.max(0, Math.round(item.riders) - 1) : 0;
      text = `${who} rode ${item.title ?? 'with my group'}${stat ? `, ${stat}` : ''}${others > 0 ? ` with ${others} ${others === 1 ? 'rider' : 'riders'}` : ''}.`;
      break;
    }
    case 'badge':
      text = item.badge && isHonor(item.badge.badge)
        ? `${who} ${HONOR_BY_KEY[item.badge.badge].share[item.mine ? 0 : 1]}.`
        : `${who} earned the ${shareHeadline(item)} badge.`;
      break;
    case 'trail':
      text = item.mine ? `I mapped a trail: ${item.title ?? 'a custom trail'}.` : `Check out ${item.title ?? 'this trail'}, mapped by ${item.actorName}.`;
      break;
    default:
      text = (item.body ?? '').trim();
  }
  const tag = 'Ride with me on OnMyLead';
  return [text, `${tag}: ${link}`].filter(Boolean).join('\n\n');
}

/** "posted 3 photos" style counts for the profile header. */
export function statLine(p: Pick<RiderProfile, 'rides' | 'miles' | 'badges'>): { value: string; label: string }[] {
  return [
    { value: (p.rides ?? 0).toLocaleString(coreLocale()), label: p.rides === 1 ? tc('Ride') : tc('Rides') },
    { value: miles(p.miles ?? 0), label: tc('Miles') },
    { value: (p.badges ?? 0).toLocaleString(coreLocale()), label: p.badges === 1 ? tc('Badge') : tc('Badges') },
  ];
}

/** "Riding since Oct 2026". */
export function sinceLine(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return tc('Riding since {v}', { v: new Date(t).toLocaleDateString(coreLocale(), { month: 'short', year: 'numeric' }) });
}

export const SOCIAL_NOT_SWITCHED_ON = 'Likes, comments and posts start with the next server update.';

/** True when the database doesn't have the Social update yet. */
export function socialNotSwitchedOn(message: string | null | undefined, code?: string | null): boolean {
  return code === 'PGRST202' || code === '42883' || code === '42P01'
    || (/social_feed|rider_timeline|feed_item|set_feed_like|add_feed_comment|create_rider_post|rider_profile/.test(message ?? '')
      && /does not exist|could not find|schema cache/i.test(message ?? ''));
}

/**
 * A request that never got an answer: no signal, or iOS cancelled it (the app was sent to the
 * background mid-request, or the network changed: "fetch failed: UnexpectedException: cancelled").
 * Worth one quiet retry, and never worth showing as it is.
 */
export function isTransientError(message: string | null | undefined): boolean {
  // Anchored to how the fetch layer words it, so a server message about a cancelled ride isn't retried.
  return /network request failed|failed to fetch|fetch failed|network error|load failed|UnexpectedException: cancelled|^(request )?(cancelled|timed? ?out)\b/i
    .test(message ?? '');
}

/** What a Social screen says when a call fails: never a raw exception. */
export function friendlySocialError(message: string | null | undefined, tc: (s: string) => string = (s) => s): string {
  if (isTransientError(message)) return tc('No signal. Check your connection and tap Retry.');
  const m = (message ?? '').replace(/^[A-Z0-9]+: /, '');
  // Technical text (a native exception, a stack location) is not for riders.
  if (!m || /exception|\.swift|\.kt|\bat \w+\//i.test(m)) return tc('Something went wrong. Try again.');
  return m.charAt(0).toUpperCase() + m.slice(1) + (/[.!?]$/.test(m) ? '' : '.');
}
