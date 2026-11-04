// Badge leaderboard screenshots: the Founder fixtures plus a leaderboard, its areas and my settings.
import * as f from '../founder-badge/fixtures.mjs';
const ME = '11111111-1111-4111-8111-111111111111';
const U = (n) => `00000000-0000-4000-8000-00000000000${n}`;
const row = (place, user_id, name, levels, gold, silver, bronze, state, badges, me = false) => ({ place, user_id, name, levels, gold, silver, bronze, country: 'US', state, me, badges });
const rows = [
  row(1, U(1), 'Dusty', 17, 5, 1, 0, 'UT', [{ badge: 'ambassador', level: 1 }, { badge: 'trail_boss', level: 3 }]),
  row(2, U(2), 'Rae', 14, 3, 2, 1, 'CO', [{ badge: 'crew_rider', level: 3 }]),
  row(3, U(4), 'Big Mike', 12, 2, 3, 0, 'TX', [{ badge: 'mile_eater', level: 3 }]),
  row(4, U(5), 'Tango', 9, 1, 2, 2, 'AZ', [{ badge: 'tail_gunner', level: 3 }]),
  row(5, ME, 'Chris', 8, 1, 2, 1, 'TX', [{ badge: 'founder', level: 1 }, { badge: 'trail_boss', level: 2 }], true),
  row(6, U(6), 'Lucky', 6, 0, 3, 0, 'UT', [{ badge: 'crew_rider', level: 2 }]),
  row(7, '00000000-0000-4000-8000-000000000017', 'Wrench', 4, 0, 1, 2, 'NV', [{ badge: 'trail_scout', level: 2 }]),
  row(8, '00000000-0000-4000-8000-000000000018', 'Mudflap', 3, 0, 0, 3, 'TX', [{ badge: 'crew_rider', level: 1 }]),
];
export const tables = f.tables;
export const rpcs = {
  ...f.rpcs,
  badge_leaderboard: { total: 214, rows, me: rows[4] },
  badge_leaderboard_areas: [
    { country: 'US', riders: 201, states: [{ state: 'TX', riders: 48 }, { state: 'UT', riders: 31 }, { state: 'CO', riders: 27 }, { state: 'AZ', riders: 22 }, { state: 'NV', riders: 9 }] },
    { country: 'CA', riders: 9, states: [{ state: 'BC', riders: 5 }, { state: 'AB', riders: 4 }] },
    { country: 'AU', riders: 4, states: [{ state: 'QLD', riders: 4 }] },
  ],
  my_leaderboard_settings: { country: 'US', state: null, shown: true, chosen: false },
};
export const session = f.session;
export const localTrails = f.localTrails;
export const avatarFile = f.avatarFile;
