// Store screenshots 3.0: the ten-rider spread (spread.mjs, or CLOSE=1 for the bunched-up group) plus events with cover photos (the
// website's own trail photos, app/public/showcase/photos). Pick with FIXTURES=v3.
import * as spread from './spread.mjs';
import * as close from './fixtures.mjs';
// CLOSE=1: the riders bunched up (fixtures.mjs), for Ride Mode with its buttons open and no gap alerts.
const f = process.env.CLOSE ? close : spread;
const covers = { 'Moab Spring Rally': ['Moab Fall Rally', 'dunes.webp'], 'Red Rock Poker Run': ['Red Rock Poker Run', 'dust.webp'], 'La Sal Loop Weekend': ['La Sal Loop Weekend', 'quads.webp'] };
const events = (f.rpcs.events_list || []).map((e) => {
  const [title, photo] = covers[e.title] || [e.title, null];
  return { ...e, title, cover_path: photo ? `${e.id}/${photo}` : null };
});
export const tables = f.tables;
// Home: Out Riding Now has two friends out, and the How Did You Find Us card is already answered.
const ago = (s) => new Date(Date.now() - s * 1000).toISOString();
const U = (n) => `00000000-0000-4000-8000-00000000000${n}`;
const nearby = [
  { user_id: U(1), display_name: 'Dusty', photo_url: null, miles: 3, spot: 'Sand Flats Rd', known: true, since: ago(2400), riding_types: ['sxs'] },
  { user_id: U(5), display_name: 'Tank', photo_url: null, miles: 15, spot: 'Gemini Bridges', known: true, since: ago(5400), riding_types: ['4x4'] },
];
const out = (n, name, spot, s) => ({ item_key: `out:${U(n)}`, kind: 'out', actor_id: U(n), actor_name: name, at: ago(s), title: spot, detail: {}, group_id: null, group_name: null, body: null, photo_path: null, like_count: 0, comment_count: 0, liked: false, comments: [], mine: false, actor_pro: true });
// NO_OUT=1 leaves them out (the Social shot).
const feed = [...(process.env.NO_OUT ? [] : [out(1, 'Dusty', 'Sand Flats Rd', 2400), out(5, 'Tank', 'Gemini Bridges', 5400)]), ...(f.rpcs.social_feed || [])];
export const rpcs = { ...f.rpcs, events_list: events, my_found_us_answered: true, nearby_riders: nearby, social_feed: feed };
export const session = f.session;
export const localTrails = f.localTrails;
export const avatarFile = f.avatarFile;
