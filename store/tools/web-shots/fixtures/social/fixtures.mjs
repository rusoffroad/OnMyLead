import * as base from '../profile-photos/fixtures.mjs';
const now = Date.now();
const ago = (min) => new Date(now - min * 60000).toISOString();
const ME = '11111111-1111-4111-8111-111111111111';
const U = (n) => `00000000-0000-4000-8000-00000000000${n}`;
const FREE = process.env.FREE === '1';
const c = (id, author_id, author_name, body, min, extra = {}) => ({ id: `c000000${id}-0000-4000-8000-000000000000`, author_id, author_name, body, at: ago(min), mine: author_id === ME, can_delete: author_id === ME, ...extra });
const item = (o) => ({ group_id: null, group_name: null, body: null, photo_path: null, like_count: 0, comment_count: 0, liked: false, comments: [], mine: false, actor_pro: false, title: null, detail: {}, ...o });
const POST = 'a0000001-0000-4000-8000-000000000000';
export const items = [
  item({ item_key: `post:${POST}`, kind: 'post', actor_id: U(1), actor_name: 'Dusty', at: ago(42), actor_pro: true,
    body: 'Fins and Things this morning. Sand was firm after the rain, and the big step on the third fin went fine with a spotter. Lunch at the overlook. Who’s in for Saturday?',
    photo_path: `${U(1)}/post-1730600000000.jpg`, like_count: 14, comment_count: 5, liked: true,
    comments: [c(1, U(2), 'Kayla', 'That light! Count me in for Saturday.', 30), c(2, U(5), 'Tank', 'Bringing the winch this time 😂', 12)] }),
  item({ item_key: `ride:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:${U(2)}`, kind: 'ride', actor_id: U(2), actor_name: 'Kayla', at: ago(60 * 5), actor_pro: true,
    title: 'Slickrock Saturday', detail: { miles: 38.4, riders: 7, ride_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, like_count: 9, comment_count: 2,
    comments: [c(3, U(4), 'Mia', 'Great pace today, thanks for sweeping!', 200)] }),
  item({ item_key: `badge:${U(4)}:mile_eater:2`, kind: 'badge', actor_id: U(4), actor_name: 'Mia', at: ago(60 * 20), detail: { badge: 'mile_eater', level: 2 }, like_count: 22, comment_count: 0 }),
  item({ item_key: `trail:b0000001-0000-4000-8000-000000000000`, kind: 'trail', actor_id: U(6), actor_name: 'Big Red', at: ago(60 * 30), actor_pro: true,
    title: 'Poison Spider Mesa', detail: { length_m: 22800, trail_id: 'b0000001-0000-4000-8000-000000000000' }, like_count: 6, comment_count: 1,
    comments: [c(4, U(1), 'Dusty', 'The waterfall obstacle is no joke. Lockers recommended.', 60 * 28)] }),
  item({ item_key: `ride:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb:${ME}`, kind: 'ride', actor_id: ME, actor_name: 'Chris', at: ago(60 * 48), mine: true, actor_pro: !FREE,
    title: 'Gemini Bridges Family Ride', detail: { miles: 24.1, riders: 9 }, like_count: 11, comment_count: 3 }),
];
const comments = [
  c(1, U(2), 'Kayla', 'That light! Count me in for Saturday.', 30),
  c(5, U(6), 'Big Red', 'Was the slickrock wet at the top or just the sand?', 25),
  c(6, U(1), 'Dusty', 'Dry up top. Just the low spots had puddles.', 22),
  c(7, ME, 'Chris', 'I’ll bring the radios. Channel 7?', 18),
  c(2, U(5), 'Tank', 'Bringing the winch this time 😂', 12),
];
export const tables = base.tables;
export const rpcs = {
  ...base.rpcs,
  my_entitlements: FREE ? [{ plan: 'free', status: 'none', source: null, expires_at: null }] : base.rpcs.my_entitlements,
  social_feed: items,
  home_feed: [],
  rider_timeline: items.filter((i) => i.actor_id === (process.env.TL || ME)),
  feed_item: [items[0]],
  feed_item_comments: comments,
  feed_item_likes: [{ user_id: U(2), name: 'Kayla' }, { user_id: U(5), name: 'Tank' }, { user_id: ME, name: 'Chris' }, { user_id: U(6), name: 'Big Red' }],
  rider_profile: { id: U(1), name: 'Dusty', me: false, blocked: false, relation: 'friends', can_see: true, pro: true, since: '2026-10-02T00:00:00Z', follows: true, rides: 31, miles: 1284, badges: 9, posts: 12, friends: 23 },
  my_friends: [
    { user_id: U(1), display_name: 'Dusty', status: 'friends', photo_url: null, out_now: true, since: ago(9000) },
    { user_id: U(2), display_name: 'Kayla', status: 'friends', photo_url: null, out_now: false, since: ago(9000) },
    { user_id: U(4), display_name: 'Mia', status: 'friends', photo_url: null, out_now: false, since: ago(9000) },
    { user_id: U(5), display_name: 'Tank', status: 'friends', photo_url: null, out_now: true, since: ago(9000) },
    { user_id: U(6), display_name: 'Big Red', status: 'friends', photo_url: null, out_now: false, since: ago(9000) },
  ],
  my_friend_requests: [],
  my_ride_name: 'Chris',
  my_rider_agreement: { version: 1 },
  public_app_settings: [],
};
export const session = base.session;
export const localTrails = [];
export const avatarFile = (p) => (p.includes('post-') ? 'post1' : base.avatarFile(p));
