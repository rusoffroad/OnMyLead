/**
 * The home screen Feed (migration 20261102300000_home_feed.sql): what friends, riders you follow
 * and your riding groups have been up to. This file turns the server's rows into what the Feed
 * says, and holds the choices on the Customize sheet. Pure, so it is tested without a phone.
 */
import { badgeTitle, HONOR_BY_KEY, isBadgeKey, isHonor, type BadgeKey, type BadgeLevel } from './badges';
import { METERS_PER_MILE } from './geo';

import { coreLocale, tc } from './i18n';
export type FeedKind = 'out' | 'ride' | 'badge' | 'trail' | 'group' | 'post';
export type ShowFrom = 'friends' | 'follows' | 'groups';
export type ShareWith = 'friends' | 'followers' | 'nobody';

export type FeedItem = {
  kind: FeedKind;
  actorId: string;
  actorName: string;
  actorPhoto: string | null;
  at: string;
  /** Ride, trail or group ride name; null for a private ride the viewer wasn't on. */
  title: string | null;
  miles: number | null;
  riders: number | null;
  badge: { badge: BadgeKey; level: BadgeLevel } | null;
  lengthM: number | null;
  rideId: string | null;
  /** Invite code of a group ride post, to open it. */
  rideCode: string | null;
  trailId: string | null;
  meetAt: string | null;
  groupId: string | null;
  groupName: string | null;
};

export type FeedSettings = { showFrom: ShowFrom; kinds: FeedKind[]; shareWith: ShareWith };

export const ALL_KINDS: FeedKind[] = ['post', 'out', 'ride', 'badge', 'trail', 'group'];
export const DEFAULT_FEED_SETTINGS: FeedSettings = { showFrom: 'groups', kinds: ALL_KINDS, shareWith: 'friends' };

/** The Customize sheet, in the order it shows. */
export const SHOW_FROM_CHOICES: { value: ShowFrom; label: string; detail: string }[] = [
  { value: 'friends', label: 'Friends', detail: 'Riders you’ve added as friends' },
  { value: 'follows', label: 'Friends and Riders I Follow', detail: 'Leaders you follow, even if they don’t follow back' },
  { value: 'groups', label: 'Friends, Follows and My Groups', detail: 'Adds rides posted to your riding groups' },
];
export const KIND_CHOICES: { value: FeedKind; label: string }[] = [
  { value: 'post', label: 'Posts' },
  { value: 'out', label: 'Friends Out Riding' },
  { value: 'ride', label: 'Finished Rides' },
  { value: 'badge', label: 'Badges Earned' },
  { value: 'trail', label: 'Trails Shared' },
  { value: 'group', label: 'Group Rides Posted' },
];
export const SHARE_WITH_CHOICES: { value: ShareWith; label: string; detail: string }[] = [
  { value: 'friends', label: 'Friends Only', detail: 'Only riders you’re friends with' },
  { value: 'followers', label: 'Friends and Followers', detail: 'Also riders who follow you' },
  { value: 'nobody', label: 'Nobody', detail: 'Your rides, badges and trails stay off everyone’s feed' },
];

const isKind = (v: unknown): v is FeedKind => typeof v === 'string' && (ALL_KINDS as string[]).includes(v);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);

/** Server rows (home_feed) to feed items; anything malformed is skipped. */
export function parseFeed(rows: unknown): FeedItem[] {
  if (!Array.isArray(rows)) return [];
  const out: FeedItem[] = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    if (!isKind(o.kind) || !str(o.actor_id) || !str(o.at)) continue;
    const d = (o.detail && typeof o.detail === 'object' ? o.detail : {}) as Record<string, unknown>;
    const level = num(d.level);
    const badge = o.kind === 'badge' && isBadgeKey(d.badge) && (level === 1 || level === 2 || level === 3)
      ? { badge: d.badge, level: level as BadgeLevel } : null;
    if (o.kind === 'badge' && !badge) continue;
    out.push({
      kind: o.kind,
      actorId: o.actor_id as string,
      actorName: str(o.actor_name) ?? 'Rider',
      actorPhoto: str(o.actor_photo),
      at: o.at as string,
      title: str(o.title),
      miles: num(d.miles),
      riders: num(d.riders),
      badge,
      lengthM: num(d.length_m),
      rideId: str(d.ride_id),
      rideCode: str(d.code),
      trailId: str(d.trail_id),
      meetAt: str(d.meet_at),
      groupId: str(o.group_id),
      groupName: str(o.group_name),
    });
  }
  return out;
}

export function parseFeedSettings(row: unknown): FeedSettings {
  const o = (Array.isArray(row) ? row[0] : row) as Record<string, unknown> | null | undefined;
  if (!o || typeof o !== 'object') return DEFAULT_FEED_SETTINGS;
  const showFrom = SHOW_FROM_CHOICES.some((c) => c.value === o.show_from) ? (o.show_from as ShowFrom) : DEFAULT_FEED_SETTINGS.showFrom;
  const shareWith = SHARE_WITH_CHOICES.some((c) => c.value === o.share_with) ? (o.share_with as ShareWith) : DEFAULT_FEED_SETTINGS.shareWith;
  const kinds = Array.isArray(o.kinds) ? ALL_KINDS.filter((k) => (o.kinds as unknown[]).includes(k)) : DEFAULT_FEED_SETTINGS.kinds;
  return { showFrom, kinds, shareWith };
}

/** Switch one kind on or off, keeping the sheet's order. */
export function toggleKind(kinds: FeedKind[], kind: FeedKind): FeedKind[] {
  const on = new Set(kinds);
  if (on.has(kind)) on.delete(kind);
  else on.add(kind);
  return ALL_KINDS.filter((k) => on.has(k));
}

const miles = (mi: number) => (mi >= 10 ? Math.round(mi).toLocaleString(coreLocale()) : (Math.round(mi * 10) / 10).toString());

/** What one post says after the rider's name, e.g. "rode Black Bear Pass with 6 riders". */
export function feedLine(item: FeedItem): string {
  switch (item.kind) {
    case 'out':
      return item.title ? tc('is out riding at {title}', { title: item.title }) : tc('is out riding right now');
    case 'ride': {
      const others = item.riders != null ? Math.max(0, Math.round(item.riders) - 1) : 0;
      const what = item.title ? `rode ${item.title}` : 'finished a ride';
      return others > 0 ? `${what} with ${others} ${others === 1 ? 'rider' : 'riders'}` : what;
    }
    case 'badge':
      if (item.badge && isHonor(item.badge.badge)) return HONOR_BY_KEY[item.badge.badge].feed;
      return item.badge ? `earned ${badgeTitle(item.badge)}` : tc('earned a badge');
    case 'trail':
      return item.title ? tc('shared a trail, {title}', { title: item.title }) : tc('shared a trail');
    case 'post':
      return 'posted';
    case 'group':
      return item.groupName ? tc('posted a ride to {groupName}{v}', { groupName: item.groupName, v: item.title ? `, ${item.title}` : '' }) : tc('posted a group ride{v}', { v: item.title ? `, ${item.title}` : '' });
  }
}

/** The small numbers under a post: miles for a ride, length for a trail. */
export function feedStat(item: FeedItem): string | null {
  if (item.kind === 'ride' && item.miles != null && item.miles > 0) return `${miles(item.miles)} mi`;
  if (item.kind === 'trail' && item.lengthM != null && item.lengthM > 0) return tc('{v} mi long', { v: miles(item.lengthM / METERS_PER_MILE) });
  return null;
}

/** "Just now", "40 min ago", "3 hours ago", "Yesterday", "4 days ago", or "Oct 12". */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const mins = Math.floor((now.getTime() - t) / 60_000);
  if (mins < 1) return tc('Just now');
  if (mins < 60) return tc('{mins} min ago', { mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return tc('Yesterday');
  if (days < 7) return tc('{days} days ago', { days });
  return new Date(t).toLocaleDateString(coreLocale(), { month: 'short', day: 'numeric' });
}

/** Out riding posts always come first (they're happening now), then newest first. */
export function sortFeed<T extends FeedItem>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.kind === 'out') !== (b.kind === 'out') ? (a.kind === 'out' ? -1 : 1) : Date.parse(b.at) - Date.parse(a.at));
}

export const FEED_NOT_SWITCHED_ON = 'Your feed starts with the next server update.';

/** True when the database doesn't have the feed update yet. */
export function feedNotSwitchedOn(message: string | null | undefined, code?: string | null): boolean {
  return code === 'PGRST202' || code === '42883' || code === '42P01' || /home_feed|my_feed_settings|set_feed_settings|rider_feed_settings/.test(message ?? '') && /does not exist|could not find|schema cache/i.test(message ?? '');
}

/** Where tapping a post goes, or null when it has nowhere to go. */
export function feedHref(item: FeedItem): string | null {
  if (item.kind === 'group' && item.rideCode) return `/r/${item.rideCode}`;
  if (item.kind === 'trail' && item.trailId) return `/nav/public/${item.trailId}`;
  if (item.kind === 'out') return '/out-riding';
  return null;
}
