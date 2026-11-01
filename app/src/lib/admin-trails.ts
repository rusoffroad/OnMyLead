/**
 * Data for the Admin Dashboard's Rider Trails page: admin_trails(), admin_set_trail_status() and
 * admin_set_trail_rules() in migration 20261101600000_nav_trails.sql. The server refuses every
 * call unless the caller is an admin with an authenticator session.
 */
import { adminRpc } from './admin';

export type TrailStatus = 'public' | 'hidden' | 'removed';
export type TrailFilter = 'all' | TrailStatus;

export type AdminTrailRow = {
  id: string;
  name: string;
  mapper: string;
  owner_id: string;
  owner_email: string | null;
  description: string | null;
  difficulty: string;
  vehicles: string[];
  length_m: number;
  photos: string[];
  status: TrailStatus;
  hidden_at: string | null;
  hidden_reason: 'ratings' | 'admin' | null;
  restored_at: string | null;
  rating_count: number;
  good_count: number;
  bad_count: number;
  average: number | null;
  quality_count: number;
  quality: number | null;
  start: { lat: number | null; lng: number | null };
  created_at: string;
  notes: { score: number | null; note: string; at: string }[];
};

export type TrailRulesRow = { min_bad: number; bad_share: number; updated_at: string | null };

export type AdminTrailsPage = {
  total: number;
  rows: AdminTrailRow[];
  counts: Record<TrailStatus, number>;
  rules: TrailRulesRow | null;
};

/** page is 0-based here; the server counts from 1. */
export const trails = (status: TrailFilter, search: string, page: number, size = 30) =>
  adminRpc<AdminTrailsPage>('admin_trails', { p_status: status, p_search: search, p_page: page + 1, p_size: size });

export const setTrailStatus = (id: string, status: TrailStatus) =>
  adminRpc<null>('admin_set_trail_status', { p_trail: id, p_status: status });

export const setTrailRules = (minBad: number, badShare: number) =>
  adminRpc<null>('admin_set_trail_rules', { p_min_bad: minBad, p_bad_share: badShare });
