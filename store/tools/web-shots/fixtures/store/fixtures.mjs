// Store screenshots 2.0: the badge leaderboard fixtures (social, Founder, badges) plus public events.
import * as b from '../badge-leaderboard/fixtures.mjs';
import * as e from '../event-or-ride/fixtures.mjs';
export const tables = b.tables;
export const rpcs = { ...b.rpcs, events_list: e.rpcs.events_list };
export const session = b.session;
export const localTrails = b.localTrails;
export const avatarFile = b.avatarFile;
