// Data access for the Admin Dashboard (onmylead.com/admin). Every call goes through the signed-in
// admin's own session: the admin_* database functions check is_admin() and the authenticator
// code (aal2) themselves, so nothing here is trusted for access control.
import { useCallback, useEffect, useState } from 'react';

import { supabase } from './supabase';

export type AdminErrorCode = 'not_admin' | 'mfa_required' | 'not_switched_on' | 'failed';

export class AdminError extends Error {
  code: AdminErrorCode;
  constructor(code: AdminErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

function toAdminError(e: { code?: string; message?: string } | null | undefined): AdminError {
  const msg = e?.message ?? 'Something went wrong.';
  if (e?.code === '42501' || /admin only/i.test(msg)) {
    return /two-factor|aal2/i.test(msg) ? new AdminError('mfa_required', 'Enter your authenticator code to continue.') : new AdminError('not_admin', 'This account is not an admin.');
  }
  // The function or table isn't there yet: the server update hasn't been applied.
  if (e?.code === 'PGRST202' || e?.code === '42883' || e?.code === '42P01') {
    return new AdminError('not_switched_on', 'This part of the dashboard is not switched on yet. It needs the server update.');
  }
  return new AdminError('failed', msg);
}

export async function adminRpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args ?? {});
  if (error) throw toAdminError(error);
  return data as T;
}

/** Calls an admin edge function with the session's token. */
export async function adminFn<T>(fn: 'admin-api' | 'admin-integrations', action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body: { action, ...body } });
  if (error) {
    // FunctionsHttpError carries the response; our functions answer { error: "..." }.
    let message = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      const j = ctx ? await ctx.json() : null;
      if (j?.error) message = j.error;
    } catch {
      // keep the generic message
    }
    if (/admin only/i.test(message)) throw new AdminError('not_admin', 'This account is not an admin.');
    if (/two-factor/i.test(message)) throw new AdminError('mfa_required', 'Enter your authenticator code to continue.');
    if (/not found|404/i.test(message) && /function/i.test(message)) throw new AdminError('not_switched_on', 'This action is not switched on yet. It needs the server update.');
    throw new AdminError('failed', message);
  }
  return data as T;
}

/**
 * Loads data for a page and loads again when deps change or reload() is called. A response that
 * arrives after the page moved on is dropped.
 */
export function useAdminData<T>(load: () => Promise<T>, deps: unknown[]) {
  const key = JSON.stringify(deps);
  const [nonce, setNonce] = useState(0);
  const want = `${key}#${nonce}`;
  const [state, setState] = useState<{ for: string | null; data: T | null; error: AdminError | null }>({ for: null, data: null, error: null });

  useEffect(() => {
    let current = true;
    load().then(
      (data) => current && setState({ for: want, data, error: null }),
      (e) => current && setState((s) => ({
        for: want,
        data: s.data,
        error: e instanceof AdminError ? e : new AdminError('failed', String((e as Error)?.message ?? e)),
      })),
    );
    return () => {
      current = false;
    };
    // load is a fresh closure every render; deps (through want) say when it changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data: state.data, error: state.for === want ? state.error : null, loading: state.for !== want, reload };
}

// ---------------------------------------------------------------------------
// Typed calls. Shapes match supabase/migrations/20261018300000_admin_dashboard.sql.
// ---------------------------------------------------------------------------
export type Page<T> = { rows: T[]; total: number };
export type PlanLabel = 'Free' | 'Pro Trial' | 'Pro' | 'Admin';

export type AdminSession = { is_admin: boolean; aal: string };
export const adminSession = () => adminRpc<AdminSession>('admin_session');

export type Overview = {
  users_total: number; users_new: number; dau: number; mau: number;
  free: number; trial: number; paid: number; comp: number; admins: number;
  trials_active: number; trials_started: number;
  rides_live: number; rides_upcoming: number; rides_completed: number; rides_created: number; ride_joins: number;
  mrr_milli: number; subs_new: number; subs_cancelled: number; promo_redemptions: number; store_errors: number;
  trial_conversion: Conversion;
  reports_open: number; deletions_pending: number;
  recent: { kind: 'signup' | 'ride' | 'report' | 'admin' | 'store_error'; at: string; label: string | null; target_id: string | null }[];
};
export type Conversion = { ended: number; paid: number; rate: number | null };
export const overview = (from: string, to: string) => adminRpc<Overview>('admin_overview', { p_from: from, p_to: to });

export type Metric = 'signups' | 'rides_created' | 'ride_joins' | 'rides_completed' | 'trials_started' | 'active_users';
export const timeseries = (metric: Metric, from: string, to: string, bucket: 'day' | 'week' | 'month') =>
  adminRpc<{ t: string; v: number }[]>('admin_timeseries', { p_metric: metric, p_from: from, p_to: to, p_bucket: bucket });

export type UserRow = {
  id: string; display_name: string; email: string | null; created_at: string; last_active_at: string | null;
  label: PlanLabel; pro_source: 'admin' | 'apple' | 'comp' | 'trial' | null; pro_until: string | null;
  trial_state: 'none' | 'active' | 'expired' | 'revoked'; trial_ends_at: string | null;
  is_admin: boolean; suspended: boolean; deletion_requested: boolean;
  rides_created: number; rides_joined: number; reports: number;
};
export type UserFilter = 'all' | 'free' | 'trial' | 'pro' | 'paid' | 'comp' | 'admin' | 'suspended' | 'deletion' | 'reported';
export const users = (q: string, filter: UserFilter, page: number, pageSize = 50) =>
  adminRpc<Page<UserRow>>('admin_users', { p_q: q || null, p_filter: filter, p_page: page, p_page_size: pageSize });

export type Grant = { id: string; source: 'trial' | 'comp'; starts_at: string; ends_at: string | null; revoked_at: string | null; note: string | null; created_at: string };
export type ReportRow = {
  id: string; kind: 'ride' | 'rider'; reason: string; details: string | null; status: ReportStatus; created_at: string;
  resolved_at?: string | null; resolution_note?: string | null;
  ride_id: string | null; ride_name: string | null; ride_status?: string | null;
  reported_user_id: string | null; reported_name?: string | null;
  reporter_id?: string | null; reporter_name: string | null; reports_on_user?: number;
};
export type ReportStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed';
export type AuditRow = { id: number; actor_id?: string; actor_name?: string | null; action: string; target_type?: string | null; target_id?: string | null; before?: unknown; after?: unknown; created_at: string };

export type UserDetail = {
  profile: {
    id: string; display_name: string; email: string | null; photo_url: string | null; experience_level: string | null;
    riding_types: string[]; region: string | null; created_at: string; last_active_at: string | null;
    email_confirmed_at: string | null; last_sign_in_at: string | null; banned_until: string | null;
  };
  state: Pick<UserRow, 'label' | 'pro_source' | 'pro_until' | 'trial_state' | 'trial_ends_at' | 'is_admin' | 'suspended' | 'deletion_requested'> & {
    trial_id: string | null; trial_starts_at: string | null; comp_id: string | null; comp_until: string | null;
    apple_status: string | null; apple_product: string | null; apple_expires_at: string | null; apple_auto_renew: boolean | null;
  };
  admin: { granted_at: string; note: string | null } | null;
  grants: Grant[];
  subscriptions: { product_id: string; status: string; expires_at: string | null; auto_renew: boolean | null; environment: string; offer_id: string | null; updated_at: string }[];
  rides_created_this_month: number;
  ride_counts: { organized: number; joined: number; leader: number; sweep: number; completed: number };
  rides: { id: string; name: string; meet_at: string; status: string; visibility: string; role: string; meet_area_label: string | null; meet_state: string | null }[];
  vehicles: { id: string; kind: string; year: number | null; make: string | null; model: string | null; trim: string | null; nickname: string | null; photo_url: string | null; created_at: string }[];
  groups: number;
  deletion_request: { requested_at: string; reason: string | null; handled_at: string | null } | null;
  reports_about: ReportRow[];
  reports_by: number;
  audit: AuditRow[];
};
export const user = (id: string) => adminRpc<UserDetail>('admin_user', { p_id: id });

export type TrialRow = Grant & { user_id: string; display_name: string; email: string | null; paid: boolean };
export type TrialFilter = 'active' | 'expiring' | 'expired' | 'revoked' | 'all' | 'comp';
export const trials = (filter: TrialFilter, page: number, pageSize = 50) =>
  adminRpc<Page<TrialRow>>('admin_trials', { p_filter: filter, p_page: page, p_page_size: pageSize });
export type TrialStats = {
  active: number; expiring: number; expired: number; comp_active: number;
  conversion_all: Conversion; conversion_90d: Conversion;
  settings: { trial_days?: number; auto_trial?: boolean };
};
export const trialStats = () => adminRpc<TrialStats>('admin_trial_stats');

export type RideStatus = 'scheduled' | 'live' | 'ended' | 'cancelled';
export type RideRow = {
  id: string; name: string; status: RideStatus; visibility: 'public' | 'unlisted' | 'private'; join_policy: string;
  meet_at: string; created_at: string; ended_at: string | null; meet_area_label: string | null; meet_state: string | null;
  difficulty: string | null; invite_code: string; organizer_id: string; organizer_name: string; riders: number; open_reports: number;
};
export type RideFilter = 'all' | 'upcoming' | 'live' | 'completed' | 'cancelled' | 'reported';
export const rides = (q: string, status: RideFilter, page: number, pageSize = 50) =>
  adminRpc<Page<RideRow>>('admin_rides', { p_q: q || null, p_status: status, p_page: page, p_page_size: pageSize });
export type RideDetail = {
  ride: Omit<RideRow, 'riders' | 'open_reports'> & {
    description: string | null; depart_at: string | null; expected_finish_at: string | null; started_at: string | null;
    destination_label: string | null; experience_level: string | null; vehicle_types: string[];
    max_riders: number | null; max_vehicles: number | null; route_miles: number | null;
  };
  members: { user_id: string; display_name: string; role: string; status: string; joined_at: string; left_at: string | null }[];
  activity: { messages: number; has_route: boolean | null };
  reports: ReportRow[];
  audit: AuditRow[];
};
export const ride = (id: string) => adminRpc<RideDetail>('admin_ride', { p_id: id });
export const removeRide = (id: string, reason: string) => adminRpc<void>('admin_remove_ride', { p_id: id, p_reason: reason });

export const reports = (status: 'open' | 'resolved' | 'dismissed' | 'all', page: number, pageSize = 50) =>
  adminRpc<Page<ReportRow>>('admin_reports', { p_status: status, p_page: page, p_page_size: pageSize });
export const resolveReport = (id: string, status: ReportStatus, note?: string) =>
  adminRpc<void>('admin_resolve_report', { p_id: id, p_status: status, p_note: note ?? null });

export type ContactStatus = 'new' | 'replied' | 'closed';
export type ContactRow = {
  id: string; created_at: string; source: 'website' | 'app'; topic: string; name: string | null; email: string; message: string;
  user_id: string | null; user_name: string | null; platform: string | null; app_version: string | null;
  status: ContactStatus; emailed_at: string | null; email_note: string | null; handled_at: string | null;
};
// Shapes match supabase/migrations/20261023000000_contact_messages.sql.
export const contactMessages = (status: ContactStatus | 'all', page: number, pageSize = 50) =>
  adminRpc<Page<ContactRow> & { new: number }>('admin_contact_messages', { p_status: status, p_page: page, p_page_size: pageSize });
export const setContactStatus = (id: string, status: ContactStatus) =>
  adminRpc<void>('admin_set_contact_status', { p_id: id, p_status: status });

export type FeaturePlan = { feature: string; min_plan: 'free' | 'pro'; free_monthly_allowance: number | null };
export type SettingsData = { settings: Record<string, { value: unknown; updated_at: string }>; feature_plans: FeaturePlan[] };
export const settings = () => adminRpc<SettingsData>('admin_settings');
export const setFeaturePlan = (feature: string, minPlan: 'free' | 'pro', allowance: number | null) =>
  adminRpc<void>('admin_set_feature_plan', { p_feature: feature, p_min_plan: minPlan, p_allowance: allowance });

export const audit = (q: string, page: number, pageSize = 50) =>
  adminRpc<Page<AuditRow>>('admin_audit', { p_q: q || null, p_page: page, p_page_size: pageSize });

// Writes owned by the foundation migration (20261018000000_pro_entitlements.sql).
export const setSetting = (key: string, value: unknown) => adminRpc<void>('admin_set_setting', { p_key: key, p_value: value });
export const grantComp = (userId: string, endsAt: string | null, note: string) =>
  adminRpc<void>('admin_grant_comp', { p_user: userId, p_ends_at: endsAt, p_note: note });
export const revokeGrant = (grantId: string) => adminRpc<void>('admin_revoke_grant', { p_grant: grantId });
export const extendTrial = (userId: string, days: number) => adminRpc<void>('admin_extend_trial', { p_user: userId, p_days: days });

// Account actions through the admin-api edge function.
export const suspendUser = (userId: string, reason: string) => adminFn<{ ok: boolean }>('admin-api', 'suspend', { user_id: userId, reason });
export const reactivateUser = (userId: string) => adminFn<{ ok: boolean }>('admin-api', 'reactivate', { user_id: userId });
export const deleteUser = (userId: string, reason: string) => adminFn<{ ok: boolean }>('admin-api', 'delete_user', { user_id: userId, reason });
