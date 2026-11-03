/**
 * The home screen Feed and its settings (core/feed, migration 20261102300000_home_feed.sql).
 * Until the migration runs every call fails soft: the Feed says it starts with the next server
 * update, and the rest of the home screen works as before.
 */
import {
  DEFAULT_FEED_SETTINGS, feedNotSwitchedOn, parseFeed, parseFeedSettings, sortFeed, type FeedItem, type FeedSettings,
} from '@/core/feed';
import type { SocialItem } from '@/core/social';
import { track } from './analytics';
import { socialFeed, SocialOffError } from './social';
import { supabase } from './supabase';

export class FeedOffError extends Error {}

type Res = { data: unknown; error: { message: string; code?: string } | null };

function check(res: Res): unknown {
  if (res.error) {
    if (feedNotSwitchedOn(res.error.message, res.error.code)) throw new FeedOffError(res.error.message);
    throw new Error(res.error.message);
  }
  return res.data;
}

/**
 * The home Feed with likes and comments (social_feed, 2.0 Social). A server with the home feed
 * but not yet the Social update gets the plain feed (home_feed), with no likes or comments.
 */
export async function homeFeed(limit = 20): Promise<SocialItem[]> {
  try {
    return sortFeed(await socialFeed(limit));
  } catch (e) {
    if (!(e instanceof SocialOffError)) throw e;
  }
  const plain = sortFeed(parseFeed(check(await supabase.rpc('home_feed', { p_limit: limit }))));
  return plain.map((f: FeedItem) => ({ ...f, key: null, body: null, photoUrl: null, likeCount: 0, commentCount: 0, liked: false, comments: [], mine: false, actorPro: false }));
}

export async function myFeedSettings(): Promise<FeedSettings> {
  try {
    return parseFeedSettings(check(await supabase.rpc('my_feed_settings')));
  } catch (e) {
    if (e instanceof FeedOffError) return DEFAULT_FEED_SETTINGS;
    throw e;
  }
}

export async function saveFeedSettings(s: FeedSettings): Promise<void> {
  check(await supabase.rpc('set_feed_settings', { p_show_from: s.showFrom, p_kinds: s.kinds, p_share_with: s.shareWith }));
  track('feed_settings_saved', { show_from: s.showFrom, kinds: s.kinds.length, share_with: s.shareWith });
}
