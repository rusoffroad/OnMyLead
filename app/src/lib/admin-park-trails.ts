/**
 * Data for the Admin Dashboard's Park Trails page: admin_park_trails() and
 * admin_set_park_trail_hidden() in migration 20261104180000_park_trails.sql. The server refuses
 * every call unless the caller is an admin with an authenticator session.
 */
import { adminRpc } from './admin';

export type AdminParkRow = {
  park_osm_id: number;
  park_name: string;
  park_state: string | null;
  park_website: string | null;
  lines: number;
  trails: number;
  hidden: number;
  trail_m: number | null;
  imported_at: string;
};

export type AdminParkLine = {
  id: string;
  name: string | null;
  level: number | null;
  kind: 'trail' | 'road';
  closed: boolean;
  oneway: boolean;
  surface: string | null;
  length_m: number;
  source_id: number;
  hidden: boolean;
};

export type AdminParkTrails = { parks: AdminParkRow[]; lines: AdminParkLine[] };

export const parkTrails = (park: number | null, search = '') =>
  adminRpc<AdminParkTrails>('admin_park_trails', { p_park: park, p_search: search });

export const setParkTrailHidden = (id: string, hidden: boolean) =>
  adminRpc<null>('admin_set_park_trail_hidden', { p_trail: id, p_hidden: hidden });
