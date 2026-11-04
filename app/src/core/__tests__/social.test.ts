import { describe, expect, it } from 'vitest';

import { tapTarget } from '../push-tap';
import { inboxLook, notificationKey } from '../inbox';
import {
  canShareOut, commentsLabel, fitWithin, friendlySocialError, isItemKey, isOwnFile, isTransientError, itemHref, likesLine, nextQuality, parseComment, parseProfile,
  parseSocial, postPhotoPath, postPhotoUrl, shareHeadline, shareSubline, shareText, sinceLine, socialNotSwitchedOn, statLine, toggleLike,
} from '../social';

const URL = 'https://x.supabase.co';
const ANN = '00000000-0000-0000-0000-000000000ee1';
const row = (o: Record<string, unknown>) => ({
  item_key: `post:${'1'.repeat(8)}-1111-1111-1111-${'1'.repeat(12)}`, kind: 'post', actor_id: ANN, actor_name: 'Ann', at: '2026-11-03T10:00:00Z',
  title: null, detail: {}, group_id: null, group_name: null, body: 'Great day', photo_path: null,
  like_count: 2, comment_count: 1, liked: true, comments: [{ id: 'c1', author_id: 'u2', author_name: 'Ben', body: 'Nice', at: '2026-11-03T10:05:00Z' }],
  mine: false, actor_pro: true, ...o,
});

describe('social feed rows', () => {
  it('parses posts, likes, comments and the Pro tag', () => {
    const [p] = parseSocial([row({})], URL);
    expect(p).toMatchObject({ kind: 'post', body: 'Great day', likeCount: 2, commentCount: 1, liked: true, actorPro: true, mine: false });
    expect(p.comments).toEqual([{ id: 'c1', authorId: 'u2', authorName: 'Ben', body: 'Nice', at: '2026-11-03T10:05:00Z' }]);
  });
  it('builds post photo addresses only for the author’s own folder', () => {
    expect(parseSocial([row({ photo_path: `${ANN}/abc-1.jpg` })], URL)[0].photoUrl).toBe(`${URL}/storage/v1/object/public/rider-posts/${ANN}/abc-1.jpg`);
    expect(parseSocial([row({ photo_path: 'someone-else/abc.jpg' })], URL)[0].photoUrl).toBeNull();
    expect(postPhotoUrl(URL, ANN, 'https://evil.example/x.jpg')).toBeNull();
    expect(isOwnFile(ANN, `${ANN}/a/b.jpg`)).toBe(false);
  });
  it('skips malformed rows and posts without a key, keeps group invites without one', () => {
    expect(parseSocial([null, { kind: 'nope' }, row({ item_key: null })], URL)).toEqual([]);
    const g = parseSocial([row({ kind: 'group', item_key: null, title: 'Moab', detail: { code: 'ABC' } })], URL);
    expect(g).toHaveLength(1);
    expect(g[0].key).toBeNull();
    expect(parseSocial('x', URL)).toEqual([]);
  });
  it('parses comments and profiles', () => {
    expect(parseComment([{ id: 'c', author_id: 'u', author_name: '', body: 'hi', at: 't', mine: true, can_delete: true }, { id: 'x' }]))
      .toEqual([{ id: 'c', authorId: 'u', authorName: 'Rider', body: 'hi', at: 't', mine: true, canDelete: true }]);
    expect(parseProfile({ id: ANN, name: 'Ann', relation: 'weird', can_see: true, pro: true, rides: 3, miles: '120.5' }))
      .toMatchObject({ relation: 'none', canSee: true, pro: true, rides: 3, miles: 120.5, badges: null });
    expect(parseProfile(null)).toBeNull();
  });
});

describe('likes and comments', () => {
  it('says who likes it', () => {
    expect(likesLine(0, false)).toBe('Be the first to like this');
    expect(likesLine(1, true)).toBe('You like this');
    expect(likesLine(2, true)).toBe('You and 1 other like this');
    expect(likesLine(5, true)).toBe('You and 4 others like this');
    expect(likesLine(1, false, 'Ben')).toBe('Ben likes this');
    expect(likesLine(1200, false)).toBe('1,200 likes');
  });
  it('labels comments', () => {
    expect(commentsLabel(0)).toBe('Comment');
    expect(commentsLabel(1)).toBe('1 Comment');
    expect(commentsLabel(12)).toBe('12 Comments');
  });
  it('toggles a like optimistically, never below zero', () => {
    expect(toggleLike({ liked: false, likeCount: 2 })).toEqual({ liked: true, likeCount: 3 });
    expect(toggleLike({ liked: true, likeCount: 0 })).toEqual({ liked: false, likeCount: 0 });
  });
  it('accepts only keys the server makes', () => {
    expect(isItemKey(`badge:${ANN}:crew_rider:1`)).toBe(true);
    expect(isItemKey(`ride:${ANN}:${ANN}`)).toBe(true);
    expect(isItemKey('post:../../etc')).toBe(false);
    expect(isItemKey(42)).toBe(false);
    expect(itemHref(`badge:${ANN}:crew_rider:1`)).toBe(`/social/item?key=badge%3A${ANN}%3Acrew_rider%3A1`);
  });
});

describe('photos stay small', () => {
  it('fits a photo within 1280 px without enlarging', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1280, height: 960 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 960, height: 1280 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
  it('steps quality down until the file fits, then gives up', () => {
    expect(nextQuality(0.7, 100_000, 200_000)).toBe(0.7);
    expect(nextQuality(0.7, 300_000, 200_000)).toBe(0.55);
    expect(nextQuality(0.4, 300_000, 200_000)).toBeNull();
  });
  it('names post photos in the author’s folder', () => {
    expect(postPhotoPath(ANN, 'ABCDEF0123456789abcdef', 5)).toBe(`${ANN}/abcdef0123456789abcdef-5.jpg`);
    expect(() => postPhotoPath(ANN, 'short')).toThrow();
  });
});

describe('sharing to other apps', () => {
  const base = parseSocial([row({})], URL)[0];
  it('shares your own activity and public trails only, never Out Riding or invites', () => {
    expect(canShareOut({ kind: 'post', mine: true })).toBe(true);
    expect(canShareOut({ kind: 'post', mine: false })).toBe(false);
    expect(canShareOut({ kind: 'ride', mine: false })).toBe(false);
    expect(canShareOut({ kind: 'trail', mine: false })).toBe(true);
    expect(canShareOut({ kind: 'out', mine: true })).toBe(false);
    expect(canShareOut({ kind: 'group', mine: true })).toBe(false);
  });
  it('writes the card and caption in first person with the link', () => {
    const ride = { ...base, kind: 'ride' as const, mine: true, title: 'Black Bear Pass', miles: 84, riders: 7, body: null };
    expect(shareHeadline(ride)).toBe('84 Miles');
    expect(shareSubline(ride)).toBe('on Black Bear Pass with 6 riders');
    expect(shareText(ride, 'https://onmylead.com')).toBe('I rode Black Bear Pass, 84 mi with 6 riders.\n\nRide with me on OnMyLead: https://onmylead.com');
    const badge = { ...base, kind: 'badge' as const, mine: true, badge: { badge: 'crew_rider' as const, level: 1 as const }, body: null };
    expect(shareText(badge, 'L')).toMatch(/^I earned the .+ badge\.\n\nRide with me on OnMyLead: L$/);
    const amb = { ...badge, badge: { badge: 'ambassador' as const, level: 1 as const } };
    expect(shareHeadline(amb)).toBe('Brand Ambassador');
    expect(shareSubline(amb)).toBe('Given by OnMyLead');
    expect(shareText(amb, 'L')).toBe('I am an OnMyLead Brand Ambassador.\n\nRide with me on OnMyLead: L');
    expect(shareText({ ...amb, mine: false, actorName: 'Tony' }, 'L')).toMatch(/^Tony is an OnMyLead Brand Ambassador\./);
    const founder = { ...badge, badge: { badge: 'founder' as const, level: 1 as const } };
    expect(shareHeadline(founder)).toBe('OnMyLead Founder');
    expect(shareText(founder, 'L')).toMatch(/^I founded OnMyLead\./);
    expect(shareText({ ...base, mine: true }, 'L')).toBe('Great day\n\nRide with me on OnMyLead: L');
  });
});

describe('profiles and notifications', () => {
  it('shows totals and since', () => {
    expect(statLine({ rides: 1, miles: 84.26, badges: 3 })).toEqual([
      { value: '1', label: 'Ride' }, { value: '84', label: 'Miles' }, { value: '3', label: 'Badges' },
    ]);
    expect(sinceLine('2026-10-14T00:00:00Z')).toBe('Riding since Oct 2026');
    expect(sinceLine(null)).toBeNull();
  });
  it('opens likes and comments on the item', () => {
    const key = `post:${ANN}`;
    expect(tapTarget({ type: 'feed_comment', key })).toBe(`/social/item?key=${encodeURIComponent(key)}`);
    expect(tapTarget({ type: 'feed_like', key })).toBe(`/social/item?key=${encodeURIComponent(key)}`);
    expect(inboxLook({ kind: 'feed_like', data: {} })).toEqual({ icon: 'heart', tone: 'social' });
    expect(notificationKey({ type: 'feed_comment', key })).toBe(`feed_comment:${key}`);
  });
  it('knows when the server has no Social yet', () => {
    expect(socialNotSwitchedOn('Could not find the function public.social_feed in the schema cache')).toBe(true);
    expect(socialNotSwitchedOn('', 'PGRST202')).toBe(true);
    expect(socialNotSwitchedOn('permission denied')).toBe(false);
  });
});

describe('errors riders see', () => {
  it('turns a cancelled or dropped request into a retry line, and hides native exceptions', () => {
    expect(isTransientError('fetch failed: UnexpectedException: cancelled (at ExpoModulesCore/Promise.swift:56).')).toBe(true);
    expect(friendlySocialError('fetch failed: UnexpectedException: cancelled (at ExpoModulesCore/Promise.swift:56).')).toBe('No signal. Check your connection and tap Retry.');
    expect(friendlySocialError('Network request failed')).toBe('No signal. Check your connection and tap Retry.');
    expect(friendlySocialError('UnexpectedException: something odd (at Foo.swift:1)')).toBe('Something went wrong. Try again.');
    expect(friendlySocialError('P0001: you were blocked')).toBe('You were blocked.');
    expect(isTransientError('P0001: that ride was cancelled')).toBe(false);
    expect(friendlySocialError('P0001: that ride was cancelled')).toBe('That ride was cancelled.');
    expect(isTransientError('The request timed out.')).toBe(true);
    expect(isTransientError('Network request timed out')).toBe(true);
    expect(isTransientError('Request cancelled')).toBe(true);
    expect(isTransientError('P0001: that invite timed out')).toBe(false);
    expect(isTransientError('canceling statement due to statement timeout')).toBe(false);
    expect(friendlySocialError('')).toBe('Something went wrong. Try again.');
  });
});
