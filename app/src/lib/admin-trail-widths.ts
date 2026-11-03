/**
 * Data for the Admin Dashboard's Trail Widths page: admin_trail_widths() and
 * admin_set_trail_width_status() in migration 20261103200000_trail_widths.sql. The server refuses
 * every call unless the caller is an admin with an authenticator session.
 */
import { adminRpc } from './admin';

export type WidthStatus = 'public' | 'removed';
export type WidthFilter = 'all' | WidthStatus;

export type AdminWidthRow = {
  id: string;
  source: 'mvum' | 'fsclosed' | 'blm' | 'osm';
  line_key: string | null;
  name: string | null;
  lat: number;
  lng: number;
  width_in: number;
  status: WidthStatus;
  created_at: string;
  updated_at: string;
  user_id: string;
  rider: string;
  email: string | null;
  /** What riders see for that line now (public entries only). */
  shown: { width_in: number | null; count: number } | null;
};

export type AdminWidthsPage = { total: number; rows: AdminWidthRow[]; counts: Record<WidthStatus, number> };

/** page is 0-based here; the server counts from 1. */
export const widths = (status: WidthFilter, search: string, page: number, size = 30) =>
  adminRpc<AdminWidthsPage>('admin_trail_widths', { p_status: status, p_search: search, p_page: page + 1, p_size: size });

export const setWidthStatus = (id: string, status: WidthStatus) =>
  adminRpc<null>('admin_set_trail_width_status', { p_id: id, p_status: status });
