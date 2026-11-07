// Store fixtures with ten riders spread out along a longer route (2.1 marketing shots of the live map). Pick with FIXTURES=spread.
import * as f from './fixtures.mjs';
const RIDE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ME = '11111111-1111-4111-8111-111111111111';
const U = (n) => `00000000-0000-4000-8000-00000000000${n}`;
// A longer winding trail so ten riders sit well apart on the map.
const route = [
  [-109.5700, 38.5660], [-109.5610, 38.5700], [-109.5560, 38.5770], [-109.5470, 38.5800], [-109.5420, 38.5870],
  [-109.5330, 38.5900], [-109.5280, 38.5970], [-109.5190, 38.6000], [-109.5140, 38.6070], [-109.5050, 38.6100],
  [-109.5000, 38.6170], [-109.4910, 38.6200], [-109.4860, 38.6270],
];
const at = (x) => { const i = Math.floor(x), t = x - i, a = route[i], b = route[Math.min(i + 1, route.length - 1)]; return { lat: a[1] + (b[1] - a[1]) * t, lng: a[0] + (b[0] - a[0]) * t }; };
const now = Date.now();
const extra = { [U(7)]: 'Jess', [U(8)]: 'Cody', [U(9)]: 'Luke' };
const base = f.tables.ride_members.find((m) => m.ride_id === RIDE && m.user_id === U(3));
const members = [...f.tables.ride_members, ...Object.entries(extra).map(([user_id, name]) => ({ ...base, user_id, role: 'rider', profiles: { display_name: name, photo_url: null } }))];
const spots = [[U(1), 11.5], [U(3), 10.3], [U(4), 9.1], [U(9), 7.9], [ME, 6.7], [U(5), 5.5], [U(7), 4.3], [U(6), 3.1], [U(8), 1.9], [U(2), 0.6]];
const positions = spots.map(([user_id, x]) => ({ user_id, ...at(x), speed_mps: 6, heading_deg: 70, last_moved_at: new Date(now - 15000).toISOString(), recorded_at: new Date(now - 15000).toISOString() }));
export const tables = {
  ...f.tables,
  ride_members: members,
  positions_latest: positions,
  profiles: [...f.tables.profiles, ...Object.entries(extra).map(([id, display_name]) => ({ id, display_name, photo_url: null }))],
  rider_statuses: [],
  ride_private_details: f.tables.ride_private_details.map((d) => ({ ...d, route_geojson: { type: 'Feature', geometry: { type: 'LineString', coordinates: route }, properties: { source: 'drawn' } }, waypoints: route })),
};
export const rpcs = f.rpcs;
export const session = f.session;
export const localTrails = f.localTrails;
export const avatarFile = f.avatarFile;
