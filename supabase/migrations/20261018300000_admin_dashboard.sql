-- Admin Dashboard (onmylead.com/admin): the read and write functions behind the Overview, Users,
-- Pro Trials, Rides, Reports, Settings and Audit Log pages.
--
-- Builds on 20261018000000_pro_entitlements.sql (admin_users, entitlement_grants,
-- app_store_subscriptions, app_store_events, app_settings, admin_audit_log,
-- account_deletion_requests, ride_creations, profiles.last_active_at, require_admin()) and
-- 20261018200000_reports.sql (reports).
--
-- Rules every function here follows:
-- * The first statement is require_admin(), which raises 42501 unless the caller is in
--   admin_users AND signed in with an authenticator code (aal2).
-- * Nothing returns positions, tracks, the exact meeting point (ride_private_details), emergency
--   contacts or VINs. Rides show their public area label and state only.
-- * Every write adds a row to admin_audit_log with the before and after values.
-- * Suspending, reactivating and deleting accounts go through the admin-api edge function, which
--   needs the Auth admin API; it logs through admin_log().

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- One row per account with its plan, for lists and counts. Admin wins over everything, then a
-- paid Apple subscription, then a complimentary grant, then a live trial. Admin only, like the rest.
create or replace function admin_account_states()
returns table (
  user_id uuid, label text, pro_source text, pro_until timestamptz,
  trial_id uuid, trial_starts_at timestamptz, trial_ends_at timestamptz, trial_state text,
  comp_id uuid, comp_until timestamptz,
  apple_status text, apple_product text, apple_expires_at timestamptz, apple_auto_renew boolean,
  is_admin boolean, suspended boolean, deletion_requested boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  return query
  select p.id,
    case when a.user_id is not null then 'Admin'
         when s.live then 'Pro'
         when c.id is not null then 'Pro'
         when t.id is not null and t.revoked_at is null and t.starts_at <= now() and t.ends_at > now() then 'Pro Trial'
         else 'Free' end,
    case when a.user_id is not null then 'admin'
         when s.live then 'apple'
         when c.id is not null then 'comp'
         when t.id is not null and t.revoked_at is null and t.starts_at <= now() and t.ends_at > now() then 'trial'
         else null end,
    case when a.user_id is not null then null
         when s.live then coalesce(s.grace_until, s.expires_at)
         when c.id is not null then c.ends_at
         when t.id is not null and t.revoked_at is null and t.ends_at > now() then t.ends_at
         else null end,
    t.id, t.starts_at, t.ends_at,
    case when t.id is null then 'none'
         when t.revoked_at is not null then 'revoked'
         when t.ends_at > now() then 'active'
         else 'expired' end,
    c.id, c.ends_at,
    s.status, s.product_id, s.expires_at, s.auto_renew,
    a.user_id is not null,
    coalesce(u.banned_until > now(), false),
    exists (select 1 from account_deletion_requests d where d.user_id = p.id and d.handled_at is null)
  from profiles p
  left join auth.users u on u.id = p.id
  left join admin_users a on a.user_id = p.id
  left join lateral (
    select g.* from entitlement_grants g
    where g.user_id = p.id and g.source = 'trial' order by g.created_at desc limit 1) t on true
  left join lateral (
    select g.* from entitlement_grants g
    where g.user_id = p.id and g.source = 'comp' and g.revoked_at is null and g.starts_at <= now()
      and (g.ends_at is null or g.ends_at > now())
    order by g.ends_at desc nulls first limit 1) c on true
  left join lateral (
    select x.*, (x.status in ('active', 'grace', 'billing_retry')
                 and coalesce(x.grace_until, x.expires_at, 'infinity'::timestamptz) > now()) as live
    from app_store_subscriptions x where x.user_id = p.id
    order by (x.status in ('active', 'grace', 'billing_retry')) desc, x.expires_at desc nulls last limit 1) s on true;
end;
$$;
revoke execute on function admin_account_states() from public, anon, authenticated;

-- Log an admin action. Pages call it for actions they take elsewhere (the edge function logs
-- with the service role through the same function).
create or replace function admin_log(p_action text, p_target_type text default null, p_target_id text default null,
  p_before jsonb default null, p_after jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform require_admin();
  if p_action is null or p_action !~ '^[a-z_.]{3,60}$' then raise exception 'bad action name'; end if;
  perform log_admin_action(p_action, p_target_type, p_target_id, p_before, p_after);
end;
$$;

-- For the dashboard's sign-in gate: true when this session may use the dashboard.
-- Never raises, so the gate can tell "not an admin" from "needs the authenticator code".
create or replace function admin_session()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  return jsonb_build_object(
    'is_admin', coalesce(is_admin(auth.uid()), false),
    'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'));
end;
$$;

-- ---------------------------------------------------------------------------
-- Overview
-- ---------------------------------------------------------------------------
create or replace function admin_overview(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
begin
  perform require_admin();
  p_from := coalesce(p_from, '-infinity'); p_to := coalesce(p_to, 'infinity');
  with st as (select * from admin_account_states())
  select jsonb_build_object(
    'users_total', (select count(*) from profiles),
    'users_new', (select count(*) from profiles where created_at >= p_from and created_at < p_to),
    'dau', (select count(*) from profiles where last_active_at >= now() - interval '1 day'),
    'mau', (select count(*) from profiles where last_active_at >= now() - interval '30 days'),
    'free', (select count(*) from st where label = 'Free'),
    'trial', (select count(*) from st where label = 'Pro Trial'),
    'paid', (select count(*) from st where pro_source = 'apple'),
    'comp', (select count(*) from st where pro_source = 'comp'),
    'admins', (select count(*) from st where is_admin),
    'trials_active', (select count(*) from st where trial_state = 'active'),
    'trials_started', (select count(*) from entitlement_grants where source = 'trial' and starts_at >= p_from and starts_at < p_to),
    'rides_live', (select count(*) from rides where status = 'live'),
    'rides_upcoming', (select count(*) from rides where status = 'scheduled' and meet_at >= now()),
    'rides_completed', (select count(*) from rides where status = 'ended' and coalesce(ended_at, meet_at) >= p_from and coalesce(ended_at, meet_at) < p_to),
    'rides_created', (select count(*) from ride_creations where created_at >= p_from and created_at < p_to),
    'ride_joins', (select count(*) from ride_members where role <> 'organizer' and status = 'joined' and created_at >= p_from and created_at < p_to),
    -- Monthly recurring revenue from live paid subscriptions (annual divided by 12), in milli-units.
    'mrr_milli', (select coalesce(sum(case when product_id like '%annual%' then price_milli / 12 else price_milli end), 0)
                  from app_store_subscriptions
                  where environment = 'Production' and status in ('active', 'grace', 'billing_retry')
                    and coalesce(grace_until, expires_at, 'infinity'::timestamptz) > now()),
    'subs_new', (select count(*) from app_store_events where type = 'SUBSCRIBED' and received_at >= p_from and received_at < p_to),
    'subs_cancelled', (select count(*) from app_store_events
                       where ((type = 'DID_CHANGE_RENEWAL_STATUS' and subtype = 'AUTO_RENEW_DISABLED') or type in ('EXPIRED', 'REFUND', 'REVOKE'))
                         and received_at >= p_from and received_at < p_to),
    'promo_redemptions', (select count(*) from app_store_events
                          where type in ('SUBSCRIBED', 'OFFER_REDEEMED') and received_at >= p_from and received_at < p_to
                            and (payload #>> '{transaction,offerType}' = '3' or payload ->> 'offerType' = '3' or type = 'OFFER_REDEEMED')),
    'store_errors', (select count(*) from app_store_events where error is not null and received_at >= p_from and received_at < p_to),
    'trial_conversion', admin_trial_conversion(p_from, p_to),
    'reports_open', (select count(*) from reports where status in ('open', 'reviewing')),
    'deletions_pending', (select count(*) from account_deletion_requests where handled_at is null),
    'recent', (select coalesce(jsonb_agg(r order by r.at desc), '[]') from (
        (select 'signup' as kind, p.created_at as at, p.display_name as label, p.id::text as target_id
           from profiles p order by p.created_at desc limit 8)
        union all
        (select 'ride', r.created_at, r.name, r.id::text from rides r order by r.created_at desc limit 8)
        union all
        (select 'report', x.created_at, x.reason, x.id::text from reports x order by x.created_at desc limit 5)
        union all
        (select 'admin', l.created_at, l.action, l.target_id from admin_audit_log l order by l.created_at desc limit 5)
        union all
        (select 'store_error', e.received_at, coalesce(e.type, 'App Store') || ': ' || left(e.error, 120), e.original_transaction_id
           from app_store_events e where e.error is not null order by e.received_at desc limit 5)
      ) r)
  ) into v;
  return v;
end;
$$;

-- Trials that ended (expired, not revoked) inside the window, and how many of those accounts
-- have ever had a paid Apple subscription.
create or replace function admin_trial_conversion(p_from timestamptz default null, p_to timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_ended int; v_paid int;
begin
  perform require_admin();
  select count(*), count(*) filter (where exists (
           select 1 from app_store_subscriptions s where s.user_id = g.user_id and s.environment = 'Production'))
    into v_ended, v_paid
  from entitlement_grants g
  where g.source = 'trial' and g.revoked_at is null and g.ends_at <= now()
    and g.ends_at >= coalesce(p_from, '-infinity') and g.ends_at < coalesce(p_to, 'infinity');
  return jsonb_build_object('ended', v_ended, 'paid', v_paid,
    'rate', case when v_ended = 0 then null else round(v_paid::numeric / v_ended, 4) end);
end;
$$;

-- Counts per day, week or month for the Overview and Analytics charts.
create or replace function admin_timeseries(p_metric text, p_from timestamptz, p_to timestamptz, p_bucket text default 'day')
returns table (t timestamptz, v bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  if p_bucket not in ('day', 'week', 'month') then raise exception 'bucket must be day, week or month'; end if;
  if p_metric not in ('signups', 'rides_created', 'ride_joins', 'rides_completed', 'trials_started', 'active_users') then
    raise exception 'unknown metric %', p_metric;
  end if;
  if p_from is null or p_to is null or p_to <= p_from then raise exception 'bad date range'; end if;
  if p_to - p_from > interval '3 years' then raise exception 'date range too long'; end if;
  return query
  with buckets as (
    select generate_series(date_trunc(p_bucket, p_from at time zone 'UTC'), p_to at time zone 'UTC', ('1 ' || p_bucket)::interval) as b
  ), pts as (
    select date_trunc(p_bucket, x.at at time zone 'UTC') as b, x.who
    from (
      select created_at as at, id as who from profiles where p_metric = 'signups'
      union all select created_at, ride_id from ride_creations where p_metric = 'rides_created'
      union all select created_at, user_id from ride_members where p_metric = 'ride_joins' and role <> 'organizer' and status = 'joined'
      union all select coalesce(ended_at, meet_at), id from rides where p_metric = 'rides_completed' and status = 'ended'
      union all select starts_at, id from entitlement_grants where p_metric = 'trials_started' and source = 'trial'
      union all select created_at, user_id from events where p_metric = 'active_users' and user_id is not null
    ) x
    where x.at >= p_from and x.at < p_to
  )
  select (b.b at time zone 'UTC'),
         case when p_metric = 'active_users' then (select count(distinct p.who) from pts p where p.b = b.b)
              else (select count(*) from pts p where p.b = b.b) end
  from buckets b order by b.b;
end;
$$;

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
-- p_filter: all, free, trial, pro, paid, comp, admin, suspended, deletion, reported.
create or replace function admin_users(p_q text default null, p_filter text default 'all', p_page int default 0, p_page_size int default 50)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_rows jsonb; v_total bigint; v_q text := nullif(btrim(coalesce(p_q, '')), '');
begin
  perform require_admin();
  p_page_size := least(greatest(coalesce(p_page_size, 50), 1), 200);
  p_page := greatest(coalesce(p_page, 0), 0);
  with st as (select * from admin_account_states()),
  f as (
    select p.id, p.display_name, u.email, p.created_at, p.last_active_at, st.label, st.pro_source, st.pro_until,
           st.trial_state, st.trial_ends_at, st.is_admin, st.suspended, st.deletion_requested,
           (select count(*) from rides r where r.organizer_id = p.id) as rides_created,
           (select count(*) from ride_members m where m.user_id = p.id and m.status = 'joined') as rides_joined,
           (select count(*) from reports x where x.reported_user_id = p.id) as reports
    from profiles p
    join st on st.user_id = p.id
    left join auth.users u on u.id = p.id
    where (v_q is null or p.display_name ilike '%' || v_q || '%' or u.email ilike '%' || v_q || '%' or p.id::text = v_q)
      and case coalesce(p_filter, 'all')
        when 'all' then true
        when 'free' then st.label = 'Free'
        when 'trial' then st.label = 'Pro Trial'
        when 'pro' then st.label in ('Pro', 'Pro Trial')
        when 'paid' then st.pro_source = 'apple'
        when 'comp' then st.pro_source = 'comp'
        when 'admin' then st.is_admin
        when 'suspended' then st.suspended
        when 'deletion' then st.deletion_requested
        when 'reported' then exists (select 1 from reports x where x.reported_user_id = p.id and x.status in ('open', 'reviewing'))
        else false end
  )
  select (select count(*) from f),
         coalesce((select jsonb_agg(to_jsonb(f) order by f.created_at desc)
                   from (select * from f order by created_at desc offset p_page * p_page_size limit p_page_size) f), '[]')
    into v_total, v_rows;
  return jsonb_build_object('rows', v_rows, 'total', v_total);
end;
$$;

create or replace function admin_user(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
begin
  perform require_admin();
  if not exists (select 1 from profiles where id = p_id) then raise exception 'user not found'; end if;
  select jsonb_build_object(
    'profile', (select jsonb_build_object(
        'id', p.id, 'display_name', p.display_name, 'email', u.email, 'photo_url', p.photo_url,
        'experience_level', p.experience_level, 'riding_types', p.riding_types, 'region', p.region,
        'created_at', p.created_at, 'last_active_at', p.last_active_at,
        'email_confirmed_at', u.email_confirmed_at, 'last_sign_in_at', u.last_sign_in_at, 'banned_until', u.banned_until)
      from profiles p left join auth.users u on u.id = p.id where p.id = p_id),
    'state', (select to_jsonb(s) from admin_account_states() s where s.user_id = p_id),
    'admin', (select jsonb_build_object('granted_at', a.granted_at, 'note', a.note) from admin_users a where a.user_id = p_id),
    'grants', coalesce((select jsonb_agg(jsonb_build_object(
        'id', g.id, 'source', g.source, 'starts_at', g.starts_at, 'ends_at', g.ends_at, 'revoked_at', g.revoked_at,
        'note', g.note, 'created_at', g.created_at) order by g.created_at desc)
      from entitlement_grants g where g.user_id = p_id), '[]'),
    'subscriptions', coalesce((select jsonb_agg(jsonb_build_object(
        'product_id', s.product_id, 'status', s.status, 'expires_at', s.expires_at, 'auto_renew', s.auto_renew,
        'environment', s.environment, 'offer_id', s.offer_id, 'updated_at', s.updated_at) order by s.updated_at desc)
      from app_store_subscriptions s where s.user_id = p_id), '[]'),
    'rides_created_this_month', (select count(*) from ride_creations c
      where c.user_id = p_id and c.created_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'),
    'ride_counts', (select jsonb_build_object(
        'organized', count(*) filter (where m.role = 'organizer'),
        'joined', count(*) filter (where m.role <> 'organizer'),
        'leader', count(*) filter (where m.role = 'leader'),
        'sweep', count(*) filter (where m.role = 'sweep'),
        'completed', count(*) filter (where r.status = 'ended'))
      from ride_members m join rides r on r.id = m.ride_id where m.user_id = p_id and m.status = 'joined'),
    'rides', coalesce((select jsonb_agg(x order by x.meet_at desc) from (
        select r.id, r.name, r.meet_at, r.status, r.visibility, m.role, r.meet_area_label, r.meet_state
        from ride_members m join rides r on r.id = m.ride_id
        where m.user_id = p_id and m.status = 'joined' order by r.meet_at desc limit 25) x), '[]'),
    'vehicles', coalesce((select jsonb_agg(jsonb_build_object(
        'id', v.id, 'kind', v.kind, 'year', v.year, 'make', v.make, 'model', v.model, 'trim', v.trim,
        'nickname', v.nickname, 'photo_url', v.photo_url, 'created_at', v.created_at) order by v.created_at)
      from vehicles v where v.owner_id = p_id), '[]'),
    'groups', (select count(*) from riding_groups g where g.owner_id = p_id),
    'deletion_request', (select jsonb_build_object('requested_at', d.requested_at, 'reason', d.reason, 'handled_at', d.handled_at)
      from account_deletion_requests d where d.user_id = p_id),
    'reports_about', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
        select r.id, r.kind, r.reason, r.details, r.status, r.created_at, r.ride_id, rd.name as ride_name,
               rp.display_name as reporter_name
        from reports r left join rides rd on rd.id = r.ride_id left join profiles rp on rp.id = r.reporter_id
        where r.reported_user_id = p_id or rd.organizer_id = p_id order by r.created_at desc limit 50) x), '[]'),
    'reports_by', (select count(*) from reports r where r.reporter_id = p_id),
    'audit', coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at desc) from (
        select l.id, l.action, l.created_at, l.before, l.after from admin_audit_log l
        where l.target_id = p_id::text order by l.created_at desc limit 25) l), '[]')
  ) into v;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pro Trials
-- ---------------------------------------------------------------------------
-- p_filter: active, expiring (ends within 7 days), expired, revoked, all; comp lists complimentary grants.
create or replace function admin_trials(p_filter text default 'active', p_page int default 0, p_page_size int default 50)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_rows jsonb; v_total bigint;
begin
  perform require_admin();
  p_page_size := least(greatest(coalesce(p_page_size, 50), 1), 200);
  p_page := greatest(coalesce(p_page, 0), 0);
  if p_filter not in ('active', 'expiring', 'expired', 'revoked', 'all', 'comp') then raise exception 'unknown filter'; end if;
  with f as (
    select g.id, g.user_id, g.source, g.starts_at, g.ends_at, g.revoked_at, g.note, g.created_at,
           p.display_name, u.email,
           exists (select 1 from app_store_subscriptions s where s.user_id = g.user_id and s.environment = 'Production') as paid
    from entitlement_grants g join profiles p on p.id = g.user_id left join auth.users u on u.id = g.user_id
    where case p_filter
      when 'comp' then g.source = 'comp'
      when 'all' then g.source = 'trial'
      when 'active' then g.source = 'trial' and g.revoked_at is null and g.ends_at > now()
      when 'expiring' then g.source = 'trial' and g.revoked_at is null and g.ends_at > now() and g.ends_at <= now() + interval '7 days'
      when 'expired' then g.source = 'trial' and g.revoked_at is null and g.ends_at <= now()
      when 'revoked' then g.source = 'trial' and g.revoked_at is not null end
  )
  select (select count(*) from f),
         coalesce((select jsonb_agg(to_jsonb(x) order by x.ends_at nulls last) from (
           select * from f order by
             case when p_filter in ('expired', 'revoked', 'comp') then null else f.ends_at end asc nulls last,
             f.ends_at desc nulls first
           offset p_page * p_page_size limit p_page_size) x), '[]')
    into v_total, v_rows;
  return jsonb_build_object('rows', v_rows, 'total', v_total);
end;
$$;

create or replace function admin_trial_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  return jsonb_build_object(
    'active', (select count(*) from entitlement_grants where source = 'trial' and revoked_at is null and ends_at > now()),
    'expiring', (select count(*) from entitlement_grants where source = 'trial' and revoked_at is null and ends_at > now() and ends_at <= now() + interval '7 days'),
    'expired', (select count(*) from entitlement_grants where source = 'trial' and revoked_at is null and ends_at <= now()),
    'comp_active', (select count(*) from entitlement_grants where source = 'comp' and revoked_at is null and (ends_at is null or ends_at > now())),
    'conversion_all', admin_trial_conversion(null, null),
    'conversion_90d', admin_trial_conversion(now() - interval '90 days', null),
    'settings', (select coalesce(jsonb_object_agg(key, value), '{}') from app_settings where key in ('trial_days', 'auto_trial')));
end;
$$;

-- ---------------------------------------------------------------------------
-- Rides (public details only)
-- ---------------------------------------------------------------------------
-- p_status: all, upcoming, live, completed, cancelled, reported.
create or replace function admin_rides(p_q text default null, p_status text default 'all', p_page int default 0, p_page_size int default 50)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_rows jsonb; v_total bigint; v_q text := nullif(btrim(coalesce(p_q, '')), '');
begin
  perform require_admin();
  p_page_size := least(greatest(coalesce(p_page_size, 50), 1), 200);
  p_page := greatest(coalesce(p_page, 0), 0);
  with f as (
    select r.id, r.name, r.status, r.visibility, r.join_policy, r.meet_at, r.created_at, r.ended_at,
           r.meet_area_label, r.meet_state, r.difficulty, r.invite_code, r.organizer_id,
           p.display_name as organizer_name,
           (select count(*) from ride_members m where m.ride_id = r.id and m.status = 'joined' and m.left_at is null) as riders,
           (select count(*) from reports x where x.ride_id = r.id and x.status in ('open', 'reviewing')) as open_reports
    from rides r join profiles p on p.id = r.organizer_id
    where (v_q is null or r.name ilike '%' || v_q || '%' or p.display_name ilike '%' || v_q || '%'
           or r.meet_area_label ilike '%' || v_q || '%' or r.invite_code = upper(v_q) or r.id::text = v_q)
      and case coalesce(p_status, 'all')
        when 'all' then true
        when 'upcoming' then r.status = 'scheduled'
        when 'live' then r.status = 'live'
        when 'completed' then r.status = 'ended'
        when 'cancelled' then r.status = 'cancelled'
        when 'reported' then exists (select 1 from reports x where x.ride_id = r.id)
        else false end
  )
  select (select count(*) from f),
         coalesce((select jsonb_agg(to_jsonb(x) order by
                     case when p_status = 'upcoming' then x.meet_at end asc,
                     case when p_status <> 'upcoming' then x.meet_at end desc) from (
           select * from f order by
             case when p_status = 'upcoming' then f.meet_at end asc,
             case when p_status <> 'upcoming' then f.meet_at end desc
           offset p_page * p_page_size limit p_page_size) x), '[]')
    into v_total, v_rows;
  return jsonb_build_object('rows', v_rows, 'total', v_total);
end;
$$;

create or replace function admin_ride(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
begin
  perform require_admin();
  if not exists (select 1 from rides where id = p_id) then raise exception 'ride not found'; end if;
  select jsonb_build_object(
    'ride', (select jsonb_build_object(
        'id', r.id, 'name', r.name, 'description', r.description, 'status', r.status, 'visibility', r.visibility,
        'join_policy', r.join_policy, 'meet_at', r.meet_at, 'depart_at', r.depart_at, 'expected_finish_at', r.expected_finish_at,
        'started_at', r.started_at, 'ended_at', r.ended_at, 'created_at', r.created_at,
        'meet_area_label', r.meet_area_label, 'meet_state', r.meet_state, 'destination_label', r.destination_label,
        'difficulty', r.difficulty, 'experience_level', r.experience_level, 'vehicle_types', r.vehicle_types,
        'max_riders', r.max_riders, 'max_vehicles', r.max_vehicles, 'route_miles', r.route_miles,
        'invite_code', r.invite_code, 'organizer_id', r.organizer_id, 'organizer_name', p.display_name)
      from rides r join profiles p on p.id = r.organizer_id where r.id = p_id),
    'members', coalesce((select jsonb_agg(jsonb_build_object(
        'user_id', m.user_id, 'display_name', p.display_name, 'role', m.role, 'status', m.status,
        'joined_at', m.created_at, 'left_at', m.left_at) order by m.created_at)
      from ride_members m join profiles p on p.id = m.user_id where m.ride_id = p_id), '[]'),
    'activity', jsonb_build_object(
      'messages', (select count(*) from ride_messages where ride_id = p_id),
      'has_route', (select d.route_geojson is not null from ride_private_details d where d.ride_id = p_id)),
    'reports', coalesce((select jsonb_agg(jsonb_build_object(
        'id', x.id, 'kind', x.kind, 'reason', x.reason, 'details', x.details, 'status', x.status,
        'created_at', x.created_at, 'reporter_name', rp.display_name, 'reported_user_id', x.reported_user_id) order by x.created_at desc)
      from reports x left join profiles rp on rp.id = x.reporter_id where x.ride_id = p_id), '[]'),
    'audit', coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at desc) from (
        select l.id, l.action, l.created_at from admin_audit_log l where l.target_id = p_id::text order by l.created_at desc limit 25) l), '[]')
  ) into v;
  return v;
end;
$$;

-- Remove a ride that breaks the rules. Its riders get the usual "ride deleted" notice, and its
-- public details are kept in the audit log. Open reports about it are marked resolved.
create or replace function admin_remove_ride(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb;
begin
  perform require_admin();
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'a reason is required'; end if;
  select jsonb_build_object('name', name, 'status', status, 'visibility', visibility, 'meet_at', meet_at,
           'meet_area_label', meet_area_label, 'organizer_id', organizer_id, 'description', description)
    into v_before from rides where id = p_id for update;
  if v_before is null then raise exception 'ride not found'; end if;
  update reports set status = 'resolved', resolved_at = now(), resolved_by = auth.uid(),
         resolution_note = coalesce(resolution_note, 'Ride removed: ' || btrim(p_reason))
   where ride_id = p_id and status in ('open', 'reviewing');
  delete from rides where id = p_id;
  perform log_admin_action('ride.remove', 'ride', p_id::text, v_before, jsonb_build_object('reason', btrim(p_reason)));
end;
$$;

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
-- p_status: open (open + reviewing), resolved, dismissed, all.
create or replace function admin_reports(p_status text default 'open', p_page int default 0, p_page_size int default 50)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_rows jsonb; v_total bigint;
begin
  perform require_admin();
  p_page_size := least(greatest(coalesce(p_page_size, 50), 1), 200);
  p_page := greatest(coalesce(p_page, 0), 0);
  with f as (
    select x.id, x.kind, x.reason, x.details, x.status, x.created_at, x.resolved_at, x.resolution_note,
           x.ride_id, rd.name as ride_name, rd.status as ride_status,
           x.reported_user_id, ru.display_name as reported_name,
           x.reporter_id, rp.display_name as reporter_name,
           (select count(*) from reports y where y.reported_user_id is not null and y.reported_user_id = x.reported_user_id) as reports_on_user
    from reports x
    left join rides rd on rd.id = x.ride_id
    left join profiles ru on ru.id = x.reported_user_id
    left join profiles rp on rp.id = x.reporter_id
    where case coalesce(p_status, 'open')
      when 'open' then x.status in ('open', 'reviewing')
      when 'all' then true
      else x.status = p_status end
  )
  select (select count(*) from f),
         coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
           select * from f order by created_at desc offset p_page * p_page_size limit p_page_size) x), '[]')
    into v_total, v_rows;
  return jsonb_build_object('rows', v_rows, 'total', v_total);
end;
$$;

create or replace function admin_resolve_report(p_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb;
begin
  perform require_admin();
  if p_status not in ('reviewing', 'resolved', 'dismissed', 'open') then raise exception 'bad status'; end if;
  select jsonb_build_object('status', status, 'resolution_note', resolution_note) into v_before
    from reports where id = p_id for update;
  if v_before is null then raise exception 'report not found'; end if;
  update reports set status = p_status,
         resolved_at = case when p_status in ('resolved', 'dismissed') then now() end,
         resolved_by = case when p_status in ('resolved', 'dismissed') then auth.uid() end,
         resolution_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), resolution_note)
   where id = p_id;
  perform log_admin_action('report.' || p_status, 'report', p_id::text, v_before,
          jsonb_build_object('status', p_status, 'note', nullif(btrim(coalesce(p_note, '')), '')));
end;
$$;

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
create or replace function admin_settings()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  return jsonb_build_object(
    'settings', coalesce((select jsonb_object_agg(key, jsonb_build_object('value', value, 'updated_at', updated_at)) from app_settings), '{}'),
    'feature_plans', coalesce((select jsonb_agg(to_jsonb(f) order by f.feature) from feature_plans f), '[]'));
end;
$$;

-- Subscription entitlement configuration: which plan a gated feature needs, and the Free
-- allowance for ride creation. Only the feature keys the app gates can change; safety features
-- are never in feature_plans, so they cannot be put behind Pro from here.
create or replace function admin_set_feature_plan(p_feature text, p_min_plan text, p_allowance int default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb;
begin
  perform require_admin();
  if p_feature not in ('create_ride', 'import_gpx', 'offline_maps', 'saved_groups', 'create_poll', 'ride_history',
                       'advanced_trip_planning', 'advanced_stats', 'premium_ride_cards') then
    raise exception 'this feature cannot be configured here';
  end if;
  if p_min_plan not in ('free', 'pro') then raise exception 'plan must be free or pro'; end if;
  if p_allowance is not null and (p_allowance < 0 or p_allowance > 1000) then raise exception 'allowance must be 0 to 1000'; end if;
  if p_feature = 'create_ride' and p_min_plan = 'pro' and p_allowance is null then
    raise exception 'ride creation needs a Free allowance';
  end if;
  select to_jsonb(f) into v_before from feature_plans f where feature = p_feature for update;
  if v_before is null then raise exception 'unknown feature'; end if;
  update feature_plans set min_plan = p_min_plan, free_monthly_allowance = p_allowance where feature = p_feature;
  perform log_admin_action('feature_plan.set', 'feature', p_feature, v_before,
          jsonb_build_object('feature', p_feature, 'min_plan', p_min_plan, 'free_monthly_allowance', p_allowance));
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit Log
-- ---------------------------------------------------------------------------
create or replace function admin_audit(p_q text default null, p_page int default 0, p_page_size int default 50)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_rows jsonb; v_total bigint; v_q text := nullif(btrim(coalesce(p_q, '')), '');
begin
  perform require_admin();
  p_page_size := least(greatest(coalesce(p_page_size, 50), 1), 200);
  p_page := greatest(coalesce(p_page, 0), 0);
  with f as (
    select l.id, l.actor_id, a.display_name as actor_name, l.action, l.target_type, l.target_id, l.before, l.after, l.created_at
    from admin_audit_log l left join profiles a on a.id = l.actor_id
    where v_q is null or l.action ilike '%' || v_q || '%' or l.target_id = v_q or l.target_type ilike v_q
  )
  select (select count(*) from f),
         coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id desc) from (
           select * from f order by created_at desc, id desc offset p_page * p_page_size limit p_page_size) x), '[]')
    into v_total, v_rows;
  return jsonb_build_object('rows', v_rows, 'total', v_total);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: dashboard functions are callable by signed-in users (require_admin() decides);
-- admin_account_states stays internal.
-- ---------------------------------------------------------------------------
revoke execute on function
  admin_log(text, text, text, jsonb, jsonb), admin_session(), admin_overview(timestamptz, timestamptz),
  admin_trial_conversion(timestamptz, timestamptz), admin_timeseries(text, timestamptz, timestamptz, text),
  admin_users(text, text, int, int), admin_user(uuid), admin_trials(text, int, int), admin_trial_stats(),
  admin_rides(text, text, int, int), admin_ride(uuid), admin_remove_ride(uuid, text),
  admin_reports(text, int, int), admin_resolve_report(uuid, text, text), admin_settings(),
  admin_set_feature_plan(text, text, int), admin_audit(text, int, int)
from public, anon;
grant execute on function
  admin_log(text, text, text, jsonb, jsonb), admin_session(), admin_overview(timestamptz, timestamptz),
  admin_trial_conversion(timestamptz, timestamptz), admin_timeseries(text, timestamptz, timestamptz, text),
  admin_users(text, text, int, int), admin_user(uuid), admin_trials(text, int, int), admin_trial_stats(),
  admin_rides(text, text, int, int), admin_ride(uuid), admin_remove_ride(uuid, text),
  admin_reports(text, int, int), admin_resolve_report(uuid, text, text), admin_settings(),
  admin_set_feature_plan(text, text, int), admin_audit(text, int, int)
to authenticated;
