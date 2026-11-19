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
  /** 4.0 place details (migration 20261119100000_places_to_ride.sql); missing on an older server. */
  address?: string | null;
  phone?: string | null;
  /** One line per day range. */
  hours?: string | null;
  fees?: string | null;
  season?: string | null;
  details_source?: string | null;
  details_checked?: string | null;
  /** Rider reviews showing on the place. */
  reviews?: number;
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

export type SpotFields = Partial<Pick<AdminSpotRow,
  'name' | 'kind' | 'lat' | 'lng' | 'state' | 'area_name' | 'description' | 'website' | 'status' | 'address' | 'phone' | 'hours' | 'fees' | 'season' | 'details_source'>>;

/** Approve, hide, fix, or (with a null id) add a place. */
export const saveSpot = (id: string | null, fields: SpotFields) =>
  adminRpc<string>('admin_save_riding_spot', { p_id: id, p_fields: fields });

// ---- Activities (4.0): which activities each place serves (migration 20261121300000) ---------

/** id -> activities for the places on screen. Places from before Activities are ['offroad']. */
export const spotActivities = (ids: string[]) =>
  adminRpc<Record<string, string[]>>('admin_riding_spot_activities', { p_ids: ids });

export const setSpotActivities = (id: string, activities: string[]) =>
  adminRpc<null>('admin_set_riding_spot_activities', { p_id: id, p_activities: activities });

// ---- Rider reviews of places (4.0) ----------------------------------------------------------

export type ReviewStatus = 'live' | 'hidden';
export type AdminPlaceReview = {
  id: string;
  spot_id: string;
  spot_name: string;
  stars: number;
  body: string | null;
  photos: string[];
  status: ReviewStatus;
  created_at: string;
  updated_at: string;
  user_id: string;
  rider: string;
  email: string | null;
};
export type AdminPlaceReviewsPage = { total: number; rows: AdminPlaceReview[]; counts: Record<ReviewStatus, number> };

/** page is 0-based here; the server counts from 1. */
export const placeReviews = (status: 'all' | ReviewStatus, page: number, size = 30) =>
  adminRpc<AdminPlaceReviewsPage>('admin_riding_spot_reviews', { p_status: status, p_page: page + 1, p_size: size });

/** Hide a review that breaks the rider rules, or put it back. Logged in the audit log. */
export const setPlaceReviewStatus = (id: string, status: ReviewStatus) =>
  adminRpc<null>('admin_set_riding_spot_review_status', { p_id: id, p_status: status });
