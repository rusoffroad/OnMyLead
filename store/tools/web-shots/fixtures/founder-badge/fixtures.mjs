// Brand Ambassador screenshots: the social fixtures plus badges for "me" and an ambassador Feed item.
import * as s from '../social/fixtures.mjs';
const ME = '11111111-1111-4111-8111-111111111111';
const U = (n) => `00000000-0000-4000-8000-00000000000${n}`;
const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
const mine = [
  { badge: 'founder', level: 1, earned_at: ago(3), seen: false },
  { badge: 'ambassador', level: 1, earned_at: ago(5), seen: true },
  { badge: 'trail_boss', level: 1, earned_at: ago(9000), seen: true },
  { badge: 'trail_boss', level: 2, earned_at: ago(3000), seen: true },
  { badge: 'crew_rider', level: 1, earned_at: ago(9000), seen: true },
  { badge: 'mile_eater', level: 1, earned_at: ago(5000), seen: true },
];
const ambItem = { group_id: null, group_name: null, body: null, photo_path: null, like_count: 18, comment_count: 2, liked: true, comments: [], mine: false, actor_pro: true, title: null,
  item_key: `badge:${U(1)}:ambassador:1`, kind: 'badge', actor_id: U(1), actor_name: 'Dusty', at: ago(20), detail: { badge: 'ambassador', level: 1 } };
export const tables = {
  ...s.tables,
  rider_badges: [
    { user_id: ME, badge: 'founder', level: 1 },
    { user_id: ME, badge: 'ambassador', level: 1 },
    { user_id: U(1), badge: 'ambassador', level: 1 },
    { user_id: U(1), badge: 'trail_boss', level: 3 },
    { user_id: U(2), badge: 'crew_rider', level: 2 },
  ],
};
export const rpcs = {
  ...s.rpcs,
  my_badges: { stats: { trail_boss: 12, tail_gunner: 0, crew_rider: 7, mile_eater: 412, trailblazer: 0, mapmaker: 0, trail_scout: 2 }, badges: mine },
  social_feed: [ambItem, ...s.items],
  home_feed: [{ kind: 'badge', actor_id: U(1), actor_name: 'Dusty', actor_photo: null, at: ago(20), title: null, detail: { badge: 'ambassador', level: 1 } }],
  mark_badges_seen: null,
};
export const session = s.session;
export const localTrails = s.localTrails;
export const avatarFile = s.avatarFile;
