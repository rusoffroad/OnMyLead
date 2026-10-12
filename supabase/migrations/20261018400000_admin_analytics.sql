-- Admin Dashboard: subscriptions, revenue, promo codes, analytics, app health and CSV exports.
--
-- Read-only views over data other migrations own:
--   20261018000000_pro_entitlements.sql  entitlement_grants, app_store_subscriptions, app_store_events,
--                                        ride_creations, admin_users, require_admin(), log_admin_action()
--   20261018300000_admin_dashboard.sql   admin_log(), admin_timeseries() (signups, rides_created,
--                                        active_users, trials_started, ride_joins)
-- Every function starts with require_admin() (admin + authenticator session), never returns a
-- position, track or meeting point, and never writes Apple's billing state. The only writes here are
-- audit log entries: admin_log_export() for each CSV download and admin_log_integration() for
-- App Store Connect actions, both through log_admin_action().
--
-- Money comes from Apple's signed notifications as the App Store functions store them
-- (/mnt/project-files/onmylead/pro/app-store-events.md): each charged transaction (SUBSCRIBED,
-- DID_RENEW or OFFER_REDEEMED with a price above zero) counts once by its transactionId, at the
-- customer price in its own currency, before Apple's commission and taxes. REFUND takes that
-- transaction's price off again and REFUND_REVERSED puts it back. The app's own verify calls
-- (APP_VERIFY) never count. Sandbox and real purchases are kept apart by p_env.

-- ---------------------------------------------------------------------------
-- Helpers (not callable by the app)
-- ---------------------------------------------------------------------------

-- The UTC start of each bucket from p_from up to (not including) p_to.
create or replace function admin_buckets(p_from timestamptz, p_to timestamptz, p_bucket text)
returns table (bucket_start timestamptz) language sql immutable set search_path = public as $$
  select g at time zone 'UTC'
  from generate_series(
    date_trunc(p_bucket, p_from at time zone 'UTC'),
    (p_to - interval '1 microsecond') at time zone 'UTC',
    ('1 ' || p_bucket)::interval) g
$$;

-- Every charge, refund and refund reversal Apple reported, one row per transaction.
create or replace function admin_charges(p_env text)
returns table (transaction_id text, original_transaction_id text, at timestamptz, type text, kind text,
  price_milli bigint, currency text, offer_type int, offer_id text, user_id uuid)
-- Security invoker: it only works inside the admin_* functions below, which run as the owner.
language sql stable set search_path = public as $$
  with t as (
    select e.received_at, e.type, e.payload -> 'transaction' as tx, e.original_transaction_id as otid
    from app_store_events e
    where e.notification_uuid is not null and e.error is null
      and e.type in ('SUBSCRIBED', 'DID_RENEW', 'OFFER_REDEEMED', 'REFUND', 'REFUND_REVERSED')
      and e.payload #>> '{transaction,environment}' = p_env
      and e.payload #>> '{transaction,transactionId}' is not null
  ), c as (
    (select distinct on (tx ->> 'transactionId') tx ->> 'transactionId' as tid, coalesce(tx ->> 'originalTransactionId', otid) as otid,
       received_at, type, 'charge' as kind, (tx ->> 'price')::bigint as price, coalesce(tx ->> 'currency', 'USD') as cur,
       (tx ->> 'offerType')::int as ot, tx ->> 'offerIdentifier' as oid
     from t where type in ('SUBSCRIBED', 'DID_RENEW', 'OFFER_REDEEMED') and coalesce((tx ->> 'price')::bigint, 0) > 0
     order by tx ->> 'transactionId', received_at)
    union all
    (select distinct on (tx ->> 'transactionId', type) tx ->> 'transactionId', coalesce(tx ->> 'originalTransactionId', otid),
       received_at, type, case type when 'REFUND' then 'refund' else 'refund_reversed' end, coalesce((tx ->> 'price')::bigint, 0),
       coalesce(tx ->> 'currency', 'USD'), (tx ->> 'offerType')::int, tx ->> 'offerIdentifier'
     from t where type in ('REFUND', 'REFUND_REVERSED')
     order by tx ->> 'transactionId', type, received_at)
  )
  select c.tid, c.otid, c.received_at, c.type, c.kind, c.price, c.cur, c.ot, c.oid, s.user_id
  from c left join app_store_subscriptions s on s.original_transaction_id = c.otid
$$;

-- Each offer-code redemption: the first transaction of a subscription that carried the offer,
-- free or paid.
create or replace function admin_offer_redemptions(p_env text)
returns table (original_transaction_id text, offer_id text, redeemed_at timestamptz, product_id text, user_id uuid)
language sql stable set search_path = public as $$
  select distinct on (r.otid, r.oid) r.otid, r.oid, r.received_at, r.product, s.user_id
  from (
    select coalesce(e.payload #>> '{transaction,originalTransactionId}', e.original_transaction_id) as otid,
      e.payload #>> '{transaction,offerIdentifier}' as oid, e.received_at, e.payload #>> '{transaction,productId}' as product
    from app_store_events e
    where e.notification_uuid is not null and e.error is null
      and e.payload #>> '{transaction,environment}' = p_env
      and e.payload #>> '{transaction,offerType}' = '3'
      and e.payload #>> '{transaction,offerIdentifier}' is not null
  ) r
  left join app_store_subscriptions s on s.original_transaction_id = r.otid
  order by r.otid, r.oid, r.received_at
$$;

create or replace function admin_check_bucket(p_bucket text) returns text
language plpgsql immutable as $$
begin
  if p_bucket not in ('day', 'week', 'month') then raise exception 'bucket must be day, week or month'; end if;
  return p_bucket;
end;
$$;

-- Plan from the product id, so new product ids still sort into month or year by name.
create or replace function admin_plan_of(p_product text) returns text
language sql immutable as $$
  select case when p_product ilike '%annual%' or p_product ilike '%year%' then 'annual'
              when p_product ilike '%month%' then 'monthly' else 'other' end
$$;

-- ---------------------------------------------------------------------------
-- Access check for the admin-integrations edge function
-- ---------------------------------------------------------------------------
create or replace function admin_analytics_ping()
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Subscriptions
-- ---------------------------------------------------------------------------

-- Everyone's plan right now, and Apple subscriptions by state, plus monthly recurring revenue.
create or replace function admin_subscription_summary(p_env text default 'Production')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  result jsonb;
begin
  perform require_admin();
  with s as (
    select * from app_store_subscriptions where environment = p_env
  ), people as (
    -- The same order my_entitlements() uses: admin, then paid, then complimentary, then trial.
    select p.id,
      case when is_admin(p.id) then 'admin'
           when has_paid_pro(p.id) then 'paid'
           when (live_grant(p.id, 'comp')).id is not null then 'comp'
           when (live_grant(p.id, 'trial')).id is not null then 'trial'
           else 'free' end as plan
    from profiles p
  )
  select jsonb_build_object(
    'environment', p_env,
    'users', (select count(*) from people),
    'free', (select count(*) from people where plan = 'free'),
    'trial', (select count(*) from people where plan = 'trial'),
    'comp', (select count(*) from people where plan = 'comp'),
    'paid', (select count(*) from people where plan = 'paid'),
    'admin', (select count(*) from people where plan = 'admin'),
    'trials_ended', (select count(*) from entitlement_grants where source = 'trial' and (revoked_at is not null or ends_at <= now())),
    'subscriptions', jsonb_build_object(
      'active', (select count(*) from s where status = 'active'),
      'monthly', (select count(*) from s where status in ('active', 'grace', 'billing_retry') and admin_plan_of(product_id) = 'monthly'),
      'annual', (select count(*) from s where status in ('active', 'grace', 'billing_retry') and admin_plan_of(product_id) = 'annual'),
      'cancelled', (select count(*) from s where status in ('active', 'grace') and auto_renew is false),
      'grace', (select count(*) from s where status = 'grace'),
      'billing_retry', (select count(*) from s where status = 'billing_retry'),
      'expired', (select count(*) from s where status = 'expired'),
      'refunded', (select count(*) from s where status = 'refunded'),
      'revoked', (select count(*) from s where status = 'revoked'),
      'renewing_7d', (select count(*) from s where status = 'active' and auto_renew is not false and expires_at between now() and now() + interval '7 days'),
      'ending_7d', (select count(*) from s where status in ('active', 'grace') and auto_renew is false and expires_at between now() and now() + interval '7 days')),
    -- Paying subscriptions only (grace counts: Apple is still collecting), annual spread over 12.
    'mrr', coalesce((
      select jsonb_agg(jsonb_build_object('currency', currency, 'mrr_milli', mrr, 'subscriptions', n) order by mrr desc)
      from (
        select coalesce(currency, 'USD') as currency, count(*) as n,
          sum(case when admin_plan_of(product_id) = 'annual' then coalesce(price_milli, 0) / 12 else coalesce(price_milli, 0) end)::bigint as mrr
        from s where status in ('active', 'grace')
        group by 1) m), '[]'::jsonb),
    'errors_7d', (select count(*) from app_store_events where error is not null and received_at > now() - interval '7 days'),
    'last_event_at', (select max(received_at) from app_store_events)
  ) into result;
  return result;
end;
$$;

-- Apple subscriptions, newest change first, with who holds them.
create or replace function admin_subscriptions(
  p_filter text default 'all', p_q text default null, p_env text default 'Production',
  p_page int default 0, p_page_size int default 50)
returns table (
  original_transaction_id text, user_id uuid, display_name text, email text, product_id text, plan text,
  status text, auto_renew boolean, expires_at timestamptz, grace_until timestamptz, offer_type int,
  offer_id text, price_milli bigint, currency text, environment text, updated_at timestamptz,
  first_seen_at timestamptz, total bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  return query
  select s.original_transaction_id, s.user_id, p.display_name, u.email::text, s.product_id, admin_plan_of(s.product_id),
    s.status, s.auto_renew, s.expires_at, s.grace_until, s.offer_type, s.offer_id, s.price_milli, s.currency,
    s.environment, s.updated_at,
    (select min(e.received_at) from app_store_events e where e.original_transaction_id = s.original_transaction_id),
    count(*) over ()
  from app_store_subscriptions s
  left join profiles p on p.id = s.user_id
  left join auth.users u on u.id = s.user_id
  where s.environment = p_env
    and case coalesce(p_filter, 'all')
      when 'all' then true
      when 'paying' then s.status in ('active', 'grace')
      when 'cancelled' then s.status in ('active', 'grace') and s.auto_renew is false
      when 'billing' then s.status in ('grace', 'billing_retry')
      when 'ended' then s.status in ('expired', 'refunded', 'revoked')
      when 'renewing_soon' then s.status = 'active' and s.auto_renew is not false and s.expires_at between now() and now() + interval '7 days'
      when 'offer_code' then exists (select 1 from admin_offer_redemptions(p_env) o where o.original_transaction_id = s.original_transaction_id)
      else s.status = p_filter end
    and (p_q is null or p_q = ''
      or p.display_name ilike '%' || p_q || '%' or u.email ilike '%' || p_q || '%'
      or s.original_transaction_id = p_q or s.user_id::text = p_q)
  order by s.updated_at desc
  limit least(greatest(p_page_size, 1), 200) offset greatest(p_page, 0) * least(greatest(p_page_size, 1), 200);
end;
$$;

-- What Apple told us about one subscription, oldest first. Raw payloads stay out.
create or replace function admin_subscription_history(p_original_transaction_id text)
returns table (received_at timestamptz, type text, subtype text, error text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  return query
  select e.received_at, e.type, e.subtype, e.error from app_store_events e
  where e.original_transaction_id = p_original_transaction_id
  order by e.received_at;
end;
$$;

-- Notifications or verifications that failed (bad signature, unknown user, and so on).
create or replace function admin_subscription_errors(p_days int default 30, p_limit int default 100)
returns table (received_at timestamptz, type text, subtype text, original_transaction_id text, error text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  return query
  select e.received_at, e.type, e.subtype, e.original_transaction_id, e.error from app_store_events e
  where e.error is not null and e.received_at > now() - make_interval(days => greatest(p_days, 1))
  order by e.received_at desc limit least(greatest(p_limit, 1), 500);
end;
$$;

-- Complimentary Pro grants, live ones first. Granting and revoking go through the foundation's
-- admin_grant_comp() and admin_revoke_grant(), which write the audit log.
create or replace function admin_comp_grants(p_include_ended boolean default false)
returns table (id uuid, user_id uuid, display_name text, email text, starts_at timestamptz, ends_at timestamptz,
  revoked_at timestamptz, note text, created_at timestamptz, live boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  return query
  select g.id, g.user_id, p.display_name, u.email::text, g.starts_at, g.ends_at, g.revoked_at, g.note, g.created_at,
    (g.revoked_at is null and g.starts_at <= now() and (g.ends_at is null or g.ends_at > now()))
  from entitlement_grants g
  left join profiles p on p.id = g.user_id
  left join auth.users u on u.id = g.user_id
  where g.source = 'comp'
    and (p_include_ended or (g.revoked_at is null and (g.ends_at is null or g.ends_at > now())))
  order by 10 desc, g.created_at desc
  limit 500;
end;
$$;

-- Find one person to grant complimentary Pro to, by name or email.
create or replace function admin_find_people(p_q text)
returns table (id uuid, display_name text, email text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  if p_q is null or length(trim(p_q)) < 2 then return; end if;
  return query
  select p.id, p.display_name, u.email::text, p.created_at
  from profiles p left join auth.users u on u.id = p.id
  where p.display_name ilike '%' || trim(p_q) || '%' or u.email ilike '%' || trim(p_q) || '%' or p.id::text = trim(p_q)
  order by p.created_at desc limit 10;
end;
$$;

-- Gross sales per bucket and currency: new paid subscriptions, renewals and refunds.
create or replace function admin_revenue_series(
  p_from timestamptz, p_to timestamptz, p_bucket text default 'day', p_env text default 'Production')
returns table (bucket_start timestamptz, currency text, gross_milli bigint, refunds_milli bigint,
  new_subscriptions bigint, renewals bigint, refunds bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  perform admin_check_bucket(p_bucket);
  return query
  with ev as (
    select date_trunc(p_bucket, c.at at time zone 'UTC') at time zone 'UTC' as b, c.currency as cur, c.type, c.kind, c.price_milli as price
    from admin_charges(p_env) c
    where c.at >= p_from and c.at < p_to
  ), currencies as (
    select distinct ev.cur from ev union select 'USD'
  )
  select bk.bucket_start, cu.cur,
    coalesce(sum(ev.price) filter (where ev.kind = 'charge'), 0)::bigint,
    coalesce(sum(case ev.kind when 'refund' then ev.price when 'refund_reversed' then -ev.price end), 0)::bigint,
    count(ev.kind) filter (where ev.kind = 'charge' and ev.type = 'SUBSCRIBED'),
    count(ev.kind) filter (where ev.kind = 'charge' and ev.type = 'DID_RENEW'),
    count(ev.kind) filter (where ev.kind = 'refund')
  from admin_buckets(p_from, p_to, p_bucket) bk
  cross join currencies cu
  left join ev on ev.b = bk.bucket_start and ev.cur = cu.cur
  group by 1, 2 order by 1, 2;
end;
$$;

-- ---------------------------------------------------------------------------
-- Analytics
-- ---------------------------------------------------------------------------

-- Totals for a date range: growth, riding, Pro, and the most used features.
create or replace function admin_analytics_summary(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  result jsonb;
begin
  perform require_admin();
  with trials as (
    select g.user_id from entitlement_grants g where g.source = 'trial' and g.starts_at >= p_from and g.starts_at < p_to
  ), charges as (
    select * from admin_charges('Production') where kind = 'charge'
  )
  select jsonb_build_object(
    'signups', (select count(*) from profiles where created_at >= p_from and created_at < p_to),
    'users_total', (select count(*) from profiles where created_at < p_to),
    'active_users', (select count(*) from (
        select user_id from events where user_id is not null and created_at >= p_from and created_at < p_to
        union select id from profiles where last_active_at >= p_from and last_active_at < p_to) a),
    'rides_created', (select count(*) from ride_creations where created_at >= p_from and created_at < p_to),
    'rides_completed', (select count(*) from rides where status = 'ended' and ended_at >= p_from and ended_at < p_to),
    'rides_cancelled', (select count(*) from rides where status = 'cancelled' and created_at >= p_from and created_at < p_to),
    'ride_joins', (select count(*) from ride_members where status = 'joined' and role <> 'organizer' and created_at >= p_from and created_at < p_to),
    'messages', (select count(*) from ride_messages where created_at >= p_from and created_at < p_to),
    'trials_started', (select count(*) from trials),
    -- Of the trials that started in the range, how many have paid at least once since.
    'trials_converted', (select count(*) from trials t where exists (select 1 from charges c where c.user_id = t.user_id)),
    'paid_starts', (select count(*) from charges c where c.type = 'SUBSCRIBED' and c.at >= p_from and c.at < p_to),
    'top_features', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', n, 'users', u) order by n desc)
        from (select name, count(*) as n, count(distinct user_id) as u from events
              where created_at >= p_from and created_at < p_to group by name order by 2 desc limit 15) f), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

-- Series that admin_timeseries() (the shell's migration) does not cover, zero-filled per bucket:
-- rides_completed, messages, paid_starts, trial_conversions, or feature:<event name>.
create or replace function admin_analytics_series(p_metric text, p_from timestamptz, p_to timestamptz, p_bucket text default 'day')
returns table (bucket_start timestamptz, value bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  perform admin_check_bucket(p_bucket);
  if p_metric not in ('rides_completed', 'messages', 'paid_starts', 'trial_conversions') and p_metric not like 'feature:%' then
    raise exception 'unknown metric %', p_metric;
  end if;
  return query
  with t as (
    select r.ended_at as at from rides r where p_metric = 'rides_completed' and r.status = 'ended' and r.ended_at >= p_from and r.ended_at < p_to
    union all
    select m.created_at from ride_messages m where p_metric = 'messages' and m.created_at >= p_from and m.created_at < p_to
    union all
    select c.at from admin_charges('Production') c
      where p_metric = 'paid_starts' and c.kind = 'charge' and c.type = 'SUBSCRIBED' and c.at >= p_from and c.at < p_to
    union all
    -- A trial rider's first payment, on the day it happened.
    select min(c.at) from entitlement_grants g
      join admin_charges('Production') c on c.user_id = g.user_id and c.kind = 'charge'
      where p_metric = 'trial_conversions' and g.source = 'trial'
      group by g.user_id having min(c.at) >= p_from and min(c.at) < p_to
    union all
    select ev.created_at from events ev where p_metric like 'feature:%' and ev.name = substr(p_metric, 9)
      and ev.created_at >= p_from and ev.created_at < p_to
  )
  select bk.bucket_start, count(t.at)
  from admin_buckets(p_from, p_to, p_bucket) bk
  left join t on date_trunc(p_bucket, t.at at time zone 'UTC') at time zone 'UTC' = bk.bucket_start
  group by 1 order by 1;
end;
$$;

-- Trials grouped by the week (or month) they started: how many are still running, ended,
-- and have paid at least once.
create or replace function admin_trial_cohorts(p_from timestamptz, p_to timestamptz, p_bucket text default 'week')
returns table (cohort_start timestamptz, trials bigint, running bigint, ended bigint, converted bigint, revoked bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  perform admin_check_bucket(p_bucket);
  return query
  with payers as (select distinct c.user_id from admin_charges('Production') c where c.kind = 'charge' and c.user_id is not null)
  select date_trunc(p_bucket, g.starts_at at time zone 'UTC') at time zone 'UTC',
    count(*),
    count(*) filter (where g.revoked_at is null and (g.ends_at is null or g.ends_at > now())),
    count(*) filter (where g.revoked_at is null and g.ends_at <= now()),
    count(*) filter (where g.user_id in (select user_id from payers)),
    count(*) filter (where g.revoked_at is not null)
  from entitlement_grants g
  where g.source = 'trial' and g.starts_at >= p_from and g.starts_at < p_to
  group by 1 order by 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- Promo codes (Apple offer codes; campaigns themselves live in App Store Connect)
-- ---------------------------------------------------------------------------

-- How each offer performed: redemptions, who still subscribes, who went on to pay full price
-- (a later charge without an offer), and the sales from those subscriptions since redeeming.
create or replace function admin_promo_performance(p_env text default 'Production')
returns table (offer_id text, offer_type int, redemptions bigint, paying_now bigint, renewed bigint,
  ended bigint, revenue_milli bigint, first_redeemed_at timestamptz, last_redeemed_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  return query
  with r as (
    select * from admin_offer_redemptions(p_env)
  ), ch as (
    select * from admin_charges(p_env)
  ), per as (
    select r.offer_id, r.original_transaction_id, r.redeemed_at, s.status,
      exists (select 1 from ch where ch.original_transaction_id = r.original_transaction_id and ch.kind = 'charge'
              and ch.offer_type is null and ch.at > r.redeemed_at) as full_price,
      coalesce((select sum(case ch.kind when 'charge' then ch.price_milli when 'refund' then -ch.price_milli else ch.price_milli end)
                from ch where ch.original_transaction_id = r.original_transaction_id and ch.at >= r.redeemed_at and ch.currency = 'USD'), 0) as usd
    from r left join app_store_subscriptions s on s.original_transaction_id = r.original_transaction_id
  )
  select per.offer_id, 3, count(*),
    count(*) filter (where per.status in ('active', 'grace')),
    count(*) filter (where per.full_price),
    count(*) filter (where per.status in ('expired', 'refunded', 'revoked')),
    sum(per.usd)::bigint, min(per.redeemed_at), max(per.redeemed_at)
  from per group by per.offer_id order by 3 desc;
end;
$$;

-- Latest offer-code redemptions, newest first.
create or replace function admin_promo_redemptions(p_q text default null, p_env text default 'Production', p_limit int default 100)
returns table (redeemed_at timestamptz, offer_id text, offer_type int, product_id text, status text,
  user_id uuid, display_name text, email text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  return query
  select r.redeemed_at, r.offer_id, 3, coalesce(r.product_id, s.product_id), s.status, r.user_id, p.display_name, u.email::text
  from admin_offer_redemptions(p_env) r
  left join app_store_subscriptions s on s.original_transaction_id = r.original_transaction_id
  left join profiles p on p.id = r.user_id
  left join auth.users u on u.id = r.user_id
  where p_q is null or p_q = '' or r.offer_id ilike '%' || p_q || '%' or p.display_name ilike '%' || p_q || '%' or u.email ilike '%' || p_q || '%'
  order by r.redeemed_at desc limit least(greatest(p_limit, 1), 1000);
end;
$$;

-- ---------------------------------------------------------------------------
-- App health (server side; crashes come from Sentry through the edge function)
-- ---------------------------------------------------------------------------
create or replace function admin_health()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  result jsonb;
  push_calls jsonb := null;
  vault_ok jsonb := null;
  cron_runs jsonb := null;
begin
  perform require_admin();

  -- Responses to the push webhook calls pg_net made in the last day (pg_net keeps about 6 hours).
  if to_regclass('net._http_response') is not null then
    execute $q$select jsonb_build_object(
        'total', count(*),
        'ok', count(*) filter (where status_code between 200 and 299),
        'failed', count(*) filter (where status_code is null or status_code >= 300 or timed_out),
        'last_at', max(created),
        'last_error', (select coalesce(error_msg, status_code::text) from net._http_response
                        where status_code is null or status_code >= 300 or timed_out order by created desc limit 1))
      from net._http_response where created > now() - interval '1 day'$q$ into push_calls;
  end if;

  -- Names only: is the push hook wired up?
  if to_regclass('vault.decrypted_secrets') is not null then
    execute $q$select jsonb_build_object(
        'push_url', exists (select 1 from vault.decrypted_secrets where name = 'onmylead_push_url'),
        'push_secret', exists (select 1 from vault.decrypted_secrets where name = 'onmylead_push_secret'))$q$ into vault_ok;
  end if;

  -- Scheduled jobs (trial reminders) when pg_cron is on.
  if to_regclass('cron.job_run_details') is not null then
    execute $q$select coalesce(jsonb_agg(r order by r->>'last_run' desc), '[]'::jsonb) from (
        select jsonb_build_object('job', j.jobname, 'schedule', j.schedule, 'active', j.active,
          'last_run', max(d.start_time), 'failed_24h', count(*) filter (where d.status = 'failed' and d.start_time > now() - interval '1 day'),
          'last_status', (select d2.status from cron.job_run_details d2 where d2.jobid = j.jobid order by d2.start_time desc limit 1)) r
        from cron.job j left join cron.job_run_details d on d.jobid = j.jobid group by j.jobid, j.jobname, j.schedule, j.active) x$q$ into cron_runs;
  end if;

  select jsonb_build_object(
    'checked_at', now(),
    'database', jsonb_build_object('ok', true, 'size_bytes', pg_database_size(current_database())),
    'push', jsonb_build_object(
      'tokens', (select count(*) from push_tokens),
      'tokens_ios', (select count(*) from push_tokens where platform = 'ios'),
      'tokens_android', (select count(*) from push_tokens where platform = 'android'),
      'tokens_fresh_30d', (select count(*) from push_tokens where updated_at > now() - interval '30 days'),
      'hook', vault_ok,
      'calls_24h', push_calls),
    'subscriptions', jsonb_build_object(
      'last_event_at', (select max(received_at) from app_store_events),
      'events_24h', (select count(*) from app_store_events where received_at > now() - interval '1 day'),
      'errors_24h', (select count(*) from app_store_events where error is not null and received_at > now() - interval '1 day'),
      'errors_7d', (select count(*) from app_store_events where error is not null and received_at > now() - interval '7 days')),
    'activity', jsonb_build_object(
      'active_24h', (select count(*) from profiles where last_active_at > now() - interval '1 day'),
      'events_24h', (select count(*) from events where created_at > now() - interval '1 day'),
      'live_rides', (select count(*) from rides where status = 'live')),
    'jobs', cron_runs
  ) into result;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- CSV exports: the page builds the file from the functions above; this records who took what.
-- ---------------------------------------------------------------------------
create or replace function admin_log_export(p_kind text, p_from timestamptz, p_to timestamptz, p_rows int)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform require_admin();
  if p_kind not in ('user_growth', 'revenue', 'conversion', 'ride_activity', 'trial_performance', 'promo_performance') then
    raise exception 'unknown export %', p_kind;
  end if;
  perform log_admin_action('export_csv', 'export', p_kind, null,
    jsonb_build_object('from', p_from, 'to', p_to, 'rows', p_rows));
end;
$$;

-- What the admin-integrations edge function changed or handed out in App Store Connect,
-- recorded with the admin's own session before the result is returned.
create or replace function admin_log_integration(p_action text, p_target_type text, p_target_id text, p_after jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform require_admin();
  if p_action not in ('asc.generate_offer_codes', 'asc.download_offer_codes') then
    raise exception 'unknown action %', p_action;
  end if;
  perform log_admin_action(p_action, p_target_type, p_target_id, null, p_after);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: callable by signed-in users, and each one refuses anyone but an admin with an
-- authenticator session. Helpers stay private.
-- ---------------------------------------------------------------------------
revoke all on function admin_buckets(timestamptz, timestamptz, text) from public, anon, authenticated;
revoke all on function admin_charges(text) from public, anon, authenticated;
revoke all on function admin_offer_redemptions(text) from public, anon, authenticated;
revoke all on function admin_check_bucket(text) from public, anon, authenticated;
revoke all on function admin_plan_of(text) from public, anon, authenticated;
revoke all on function admin_analytics_ping() from public, anon;
revoke all on function admin_subscription_summary(text) from public, anon;
revoke all on function admin_subscriptions(text, text, text, int, int) from public, anon;
revoke all on function admin_subscription_history(text) from public, anon;
revoke all on function admin_subscription_errors(int, int) from public, anon;
revoke all on function admin_comp_grants(boolean) from public, anon;
revoke all on function admin_find_people(text) from public, anon;
revoke all on function admin_revenue_series(timestamptz, timestamptz, text, text) from public, anon;
revoke all on function admin_analytics_summary(timestamptz, timestamptz) from public, anon;
revoke all on function admin_analytics_series(text, timestamptz, timestamptz, text) from public, anon;
revoke all on function admin_trial_cohorts(timestamptz, timestamptz, text) from public, anon;
revoke all on function admin_promo_performance(text) from public, anon;
revoke all on function admin_promo_redemptions(text, text, int) from public, anon;
revoke all on function admin_health() from public, anon;
revoke all on function admin_log_export(text, timestamptz, timestamptz, int) from public, anon;
revoke all on function admin_log_integration(text, text, text, jsonb) from public, anon;
grant execute on function admin_analytics_ping(), admin_subscription_summary(text),
  admin_subscriptions(text, text, text, int, int), admin_subscription_history(text),
  admin_subscription_errors(int, int), admin_comp_grants(boolean), admin_find_people(text),
  admin_revenue_series(timestamptz, timestamptz, text, text), admin_analytics_summary(timestamptz, timestamptz),
  admin_analytics_series(text, timestamptz, timestamptz, text), admin_trial_cohorts(timestamptz, timestamptz, text),
  admin_promo_performance(text), admin_promo_redemptions(text, text, int), admin_health(),
  admin_log_export(text, timestamptz, timestamptz, int), admin_log_integration(text, text, text, jsonb)
  to authenticated;
