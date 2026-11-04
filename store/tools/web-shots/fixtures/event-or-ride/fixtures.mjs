// Event-or-Public-Ride explainer screenshots: the social fixtures plus a few public events.
import * as s from '../social/fixtures.mjs';
const day = (d, h = 9) => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(h, 0, 0, 0); return x.toISOString(); };
const ev = (i, title, d, len, place, st, going, rides, agenda) => ({
  id: `e0000000-0000-4000-8000-00000000000${i}`, share_code: `EV${i}`, title, starts_at: day(d), ends_at: day(d + len, 17),
  location_name: place, state: st, lat: 38.57, lng: -109.55, status: 'scheduled', visibility: 'public', hidden: false,
  cover_path: null, going, rides, agenda, mine: null, i_host: false, distance_mi: 4 + i * 7,
});
const events = [
  ev(1, 'Moab Spring Rally', 9, 2, 'Moab, UT', 'UT', 84, 5, 12),
  ev(2, 'Red Rock Poker Run', 16, 0, 'Green River, UT', 'UT', 31, 1, 4),
  ev(3, 'La Sal Loop Weekend', 23, 1, 'La Sal, UT', 'UT', 22, 3, 6),
];
export const tables = s.tables;
export const rpcs = { ...s.rpcs, events_list: events };
export const session = s.session;
export const localTrails = s.localTrails;
export const avatarFile = s.avatarFile;
