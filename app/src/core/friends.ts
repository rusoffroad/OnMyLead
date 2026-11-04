/**
 * Friends (migration 20261101800000_friends.sql): add a rider as a friend, see friends who are Out
 * Riding near you, and message them.
 *
 * The rules live in the database: a request goes to a rider you already know (ridden with, or in
 * a riding group with), one you can see Out Riding, one you've messaged, or anyone who shares
 * their friend link with you. Nobody can search for riders by name. Blocking ends a friendship.
 * Friends count as riders you know, so they see each other in Out Riding (whole miles only, the
 * same as before) and can message each other any time. This file holds the words the screens use.
 */

import { SHARE_CODE_MAX, SHARE_CODE_MIN } from './share-code';

import { tc } from './i18n';
/** 'friends', 'sent' (I asked them) or 'received' (they asked me). */
export type FriendStatus = 'friends' | 'sent' | 'received';

export type Friend = {
  user_id: string;
  display_name: string;
  photo_url: string | null;
  status: FriendStatus;
  /** When we became friends, or when the request was sent. */
  since: string;
  /** In my Out Riding list right now (I have to be Out Riding too). */
  out_now: boolean;
  /** Whole miles while out_now; 0 means under a mile. */
  miles: number | null;
  spot: string | null;
  riding_types: string[] | null;
};

export type FriendSuggestion = {
  user_id: string;
  display_name: string;
  photo_url: string | null;
  reason: string;
};

/** Where a friend link stands for me: 'self', 'friends', 'sent', 'received' or 'none'. */
export type FriendRelation = 'self' | 'friends' | 'sent' | 'received' | 'none';

export type FriendPreview = {
  user_id: string;
  display_name: string;
  photo_url: string | null;
  relation: FriendRelation;
};

/** What sending a request did: asked them, became friends (they'd asked me), or nothing new. */
export type RequestResult = 'requested' | 'accepted' | 'already';

const byName = (a: { display_name: string }, b: { display_name: string }) =>
  a.display_name.localeCompare(b.display_name, undefined, { sensitivity: 'base' });

/** The Friends screen's sections: requests to answer, friends (out riding first), requests I sent. */
export function splitFriends(list: Friend[]): { received: Friend[]; friends: Friend[]; sent: Friend[] } {
  const received = list.filter((f) => f.status === 'received').sort((a, b) => Date.parse(b.since) - Date.parse(a.since));
  const friends = list
    .filter((f) => f.status === 'friends')
    .sort((a, b) => Number(b.out_now) - Number(a.out_now) || (a.miles ?? 999) - (b.miles ?? 999) || byName(a, b));
  const sent = list.filter((f) => f.status === 'sent').sort(byName);
  return { received, friends, sent };
}

/** Where I stand with one rider, from my friends list. */
export function relationTo(list: Pick<Friend, 'user_id' | 'status'>[], userId: string | null | undefined, me?: string | null): FriendRelation {
  if (!userId) return 'none';
  if (me && userId === me) return 'self';
  return list.find((f) => f.user_id === userId)?.status ?? 'none';
}

/** The ids of my friends (accepted only), for marking them in other lists. */
export function friendIds(list: Pick<Friend, 'user_id' | 'status'>[]): Set<string> {
  return new Set(list.filter((f) => f.status === 'friends').map((f) => f.user_id));
}

/** The button a rider row shows: "Add Friend", "Requested", "Accept Request" or "Friends". */
export function friendButtonLabel(relation: FriendRelation): string {
  switch (relation) {
    case 'friends': return tc('Friends');
    case 'sent': return tc('Requested');
    case 'received': return tc('Accept Friend Request');
    default: return tc('Add Friend');
  }
}

/** The line on the Groups tab: "3 Friends, 1 Out Riding", "1 Friend Request". */
export function friendsLine(list: Friend[]): string {
  const { received, friends } = splitFriends(list);
  const parts: string[] = [];
  if (received.length) parts.push(`${received.length} Friend ${received.length === 1 ? 'Request' : 'Requests'}`);
  if (friends.length) {
    const out = friends.filter((f) => f.out_now).length;
    parts.push(`${friends.length} ${friends.length === 1 ? 'Friend' : 'Friends'}${out ? `, ${out} Out Riding` : ''}`);
  }
  return parts.join(' · ') || tc('Add riders you know as friends');
}

/** What a sent request did, in words. */
export function requestResultLine(result: RequestResult, name: string): string {
  if (result === 'accepted') return tc('You and {name} are friends now.', { name });
  if (result === 'already') return tc('You’ve already asked {name}.', { name });
  return tc('Friend request sent to {name}.', { name });
}

/** https://onmylead.com/friend/CODE, or null without a web address. */
export function friendLink(webUrl: string | null | undefined, code: string): string | null {
  return webUrl ? `${webUrl.replace(/\/+$/, '')}/friend/${encodeURIComponent(code)}` : null;
}

export function friendInviteMessage(code: string, link: string | null): string {
  return ['Add me as a friend on OnMyLead, so we can see when each other is out riding and message.', link ? link : `Friend code: ${code}`].join('\n');
}

/**
 * A friend code from whatever was typed or pasted: the code itself, or a whole friend link.
 * Made-up codes are 10 of 0-9 and A-F (spaces and dashes typed inside one are ignored); riders
 * can also choose their own, like MOAB-RIDER (core/share-code.ts). Null when it can't be one.
 */
export function readFriendCode(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  const fromLink = s.match(/\/friend\/([0-9a-z-]{4,20})(?![0-9a-z-])/i);
  if (fromLink) return fromLink[1].toUpperCase();
  const made = s.replace(/[\s-]/g, '').toUpperCase();
  if (/^[0-9A-F]{10}$/.test(made)) return made;
  const typed = s.replace(/\s+/g, '').toUpperCase();
  return typed.length >= SHARE_CODE_MIN && typed.length <= SHARE_CODE_MAX && /^[A-Z0-9]+(-[A-Z0-9]+)*$/.test(typed) ? typed : null;
}

export const FRIENDS_NOT_SWITCHED_ON = 'Friends isn’t switched on yet. It starts working with the next server update.';

/** True when the database doesn't have the Friends update yet. */
export function friendsNotSwitchedOn(message: string | null | undefined, code?: string | null): boolean {
  if (code && ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(code)) return true;
  return (
    !!message
    && /friend/i.test(message)
    && /does not exist|schema cache|could not find|relation|function/i.test(message)
  );
}

/** Turn a database error into something a rider can act on. */
export function friendlyFriendError(message: string): string {
  if (friendsNotSwitchedOn(message)) return FRIENDS_NOT_SWITCHED_ON;
  if (/network request failed|failed to fetch|fetch failed|network error/i.test(message)) return tc('No signal. Check your connection and try again.');
  if (/friend_you_blocked/i.test(message)) return tc('You blocked this rider. Unblock them from You, Blocked Riders to add them.');
  if (/friend_daily_limit.*this week/i.test(message)) return tc('You already asked this rider this week.');
  if (/friend_daily_limit/i.test(message)) return tc('You’ve sent a lot of friend requests today. Try again tomorrow.');
  if (/friend_link_not_found/i.test(message)) return tc('This friend link doesn’t work anymore. Ask for a new one.');
  if (/friend_request_not_found/i.test(message)) return tc('This request isn’t there anymore.');
  if (/add yourself/i.test(message)) return tc('That’s your own friend link.');
  if (/friend_not_allowed/i.test(message)) return tc('You can add riders you’ve ridden with or see Out Riding. For anyone else, share your friend link.');
  return message;
}
