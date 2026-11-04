/**
 * Data for the Admin Dashboard's Places to Ride page (Scout): admin_riding_spots() and
 * admin_save_riding_spot() in migration 20261104170000_riding_spots.sql. The server refuses every
 * call unless the caller is an admin with an authenticator session.
 */
import type { SpotKind, SpotSource } from '@/core/spots';
import { adminRpc } from './admin';

export type SpotStatus = 'live' | 'pending' | 'hidden';
export type SpotFilter = 'all' | SpotStatus;

export type AdminSpotRow = {
  id: string;
  source: SpotSource;
  source_id: string;
  name: string;
  kind: SpotKind;
  lat: number;
  lng: number;
  state: string | null;
  area_name: string | null;
  description: string | null;
  website: string | null;
  status: SpotStatus;
  edited_by_admin: boolean;
  suggestion_note: string | null;
  created_at: string;
  updated_at: string;
  /** Who suggested it (rider suggestions only). Riders never see this. */
  rider: string | null;
  email: string | null;
};

export type AdminSpotsPage = { total: number; rows: AdminSpotRow[]; counts: Record<SpotStatus, number> };

/** page is 0-based here; the server counts from 1. */
export const spots = (status: SpotFilter, search: string, page: number, size = 30) =>
  adminRpc<AdminSpotsPage>('admin_riding_spots', { p_status: status, p_search: search, p_page: page + 1, p_size: size });

export type SpotFields = Partial<Pick<AdminSpotRow, 'name' | 'kind' | 'lat' | 'lng' | 'state' | 'area_name' | 'description' | 'website' | 'status'>>;

/** Approve, hide, fix, or (with a null id) add a place. */
export const saveSpot = (id: string | null, fields: SpotFields) =>
  adminRpc<string>('admin_save_riding_spot', { p_id: id, p_fields: fields });
