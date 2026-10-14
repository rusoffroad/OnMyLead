-- Google Play Billing for OnMyLead Pro, and one Pro state for both stores.
--
--   * play_subscriptions holds each Google Play subscription (one row per purchase token), written
--     only by the play-verify and play-notifications edge functions after they have read the
--     purchase from the Google Play Developer API. The phone's own word never counts.
--   * play_orders holds each order Google charged (first purchase and every renewal) so the
--     Admin Dashboard's revenue covers Google Play next to the App Store. Refunds are marked on
--     the order.
--   * play_events logs every Real-time Developer Notification and verify call, like
--     app_store_events does for Apple.
--   * store_subscriptions is both stores in one shape. has_paid_pro(), my_entitlements() and the
--     Admin Dashboard read it, so a rider who subscribed on either store is Pro on every device.
--   * my_entitlements() keeps every key it had (old iPhone builds read 'apple'), and adds
--     pro_source 'google', a 'google' object, 'store_subscription' (the paid one, either store)
--     and 'open_subscriptions' (every subscription that hasn't ended, for the guard that stops
--     a rider paying on both stores).
--
-- Additive: three new tables, one view, and new versions of existing functions with the same
-- names and arguments. admin_account_states, admin_charges, admin_offer_redemptions and
-- admin_subscriptions gain a store column at the end (dropped and recreated; nothing outside
-- the admin functions calls them, and the dashboard reads columns by name).

-- ---------------------------------------------------------------------------
-- 1. Google Play subscriptions, orders and notifications.
-- ---------------------------------------------------------------------------
create table play_subscriptions (
  purchase_token text primary key,
  user_id uuid references profiles (id) on delete set null,
  product_id text not null,
  base_plan_id text,
  -- The same names as app_store_subscriptions, plus Google's paused and pending states.
  -- billing_retry is Google's "on hold" (no access); grace still has access until grace_until.
  status text not null check (status in ('active', 'grace', 'billing_retry', 'paused', 'pending', 'expired', 'revoked', 'refunded')),
  expires_at timestamptz,
  grace_until timestamptz,
  auto_renew boolean,
  -- 3 with the code when a Google Play promo code was used at signup (Apple's number for an
  -- offer code), 1 for any other Play offer.
  offer_type int,
  offer_id text,
  price_milli bigint,
  currency text,
  -- Purchases by Play license testers are 'Sandbox', like Apple's.
  environment text not null check (environment in ('Sandbox', 'Production')),
  -- The subscription this one replaced (a plan change or a resubscribe); that one is ended.
  linked_purchase_token text,
  latest_order_id text,
  acknowledged boolean,
  started_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index on play_subscriptions (user_id);
alter table play_subscriptions enable row level security;
create policy play_subscriptions_own on play_subscriptions for select to authenticated using (user_id = auth.uid());
revoke all on play_subscriptions from anon, authenticated;
grant select on play_subscriptions to authenticated;

create table play_orders (
  order_id text primary key,
  purchase_token text not null,
  product_id text not null,
  kind text not null check (kind in ('purchase', 'renewal')),
  price_milli bigint not null default 0,
  currency text not null default 'USD',
  offer_type int,
  offer_id text,
  environment text not null check (environment in ('Sandbox', 'Production')),
  charged_at timestamptz not null default now(),
  refunded_at timestamptz,
  created_at timestamptz not null default now()
);
create index on play_orders (purchase_token);
create index on play_orders (charged_at);
alter table play_orders enable row level security;
revoke all on play_orders from anon, authenticated;

create table play_events (
  id bigint generated always as identity primary key,
  -- Pub/Sub's message id for a notification; null for the app's own verify calls.
  message_id text unique,
  notification_type int,
  type text,
  purchase_token text,
  order_id text,
  payload jsonb,
  error text,
  received_at timestamptz not null default now()
);
create index on play_events (received_at desc);
create index on play_events (purchase_token);
alter table play_events enable row level security;
revoke all on play_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Both stores in one shape.
-- ---------------------------------------------------------------------------
create view store_subscriptions with (security_invoker = true) as
  select 'apple'::text as store, a.original_transaction_id as subscription_id, a.user_id, a.product_id, a.status,
    a.expires_at, a.grace_until, a.auto_renew, a.offer_type, a.offer_id, a.price_milli, a.currency, a.environment,
    a.updated_at, a.created_at
  from app_store_subscriptions a
  union all
  select 'google', g.purchase_token, g.user_id, g.product_id, g.status,
    g.expires_at, g.grace_until, g.auto_renew, g.offer_type, g.offer_id, g.price_milli, g.currency, g.environment,
    g.updated_at, g.created_at
  from play_subscriptions g;
revoke all on store_subscriptions from anon, authenticated;

-- Gives Pro right now: active and not past its end, or in a grace period that hasn't ended.
-- billing_retry (Google: on hold), paused and pending never do.
create or replace function subscription_gives_pro(p_status text, p_expires_at timestamptz, p_grace_until timestamptz)
returns boolean language sql stable set search_path = public as $$
  select (p_status = 'active' and (p_expires_at is null or p_expires_at > now()))
      or (p_status in ('grace', 'billing_retry') and p_grace_until > now());
$$;

-- Not over yet, even if it isn't giving Pro this minute (a payment problem, a pause, a pending
-- payment). A rider with one of these on one store shouldn't be sold Pro on the other.
create or replace function subscription_open(p_status text, p_expires_at timestamptz, p_grace_until timestamptz)
returns boolean language sql stable set search_path = public as $$
  select subscription_gives_pro(p_status, p_expires_at, p_grace_until)
      or p_status in ('billing_retry', 'paused', 'pending');
$$;

create or replace function has_paid_pro(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from store_subscriptions s
    where s.user_id = p_user and subscription_gives_pro(s.status, s.expires_at, s.grace_until)
  );
$$;

-- ---------------------------------------------------------------------------
-- 2b. Writing Google's answer. Only the Play edge functions (service role) call these.
-- ---------------------------------------------------------------------------

-- Stores one subscription as Google reported it, with the order it was charged for, and returns
-- the account it belongs to.
--   p_row:   the play_subscriptions columns Google decides (supabase/functions/_shared/play-status.ts).
--   p_user:  from the app, the signed-in rider, who becomes the owner (a restore on another
--            OnMyLead account moves Pro there, the same as Apple); from a notification, the
--            purchase's obfuscated account id, which only fills an empty owner.
--   p_order: the latest order (order_id, kind, price_milli, currency, charged_at), or null.
-- A subscription that replaced another (linked_purchase_token) ends the old one, which keeps its
-- owner for the new one when the new one has none.
create or replace function play_save_subscription(p_row jsonb, p_user uuid, p_from_app boolean, p_order jsonb default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_token text := p_row ->> 'purchase_token';
  v_linked text := nullif(p_row ->> 'linked_purchase_token', '');
  v_existing uuid;
  v_owner uuid;
begin
  if current_user not in ('service_role', 'postgres') then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_token is null or coalesce(p_row ->> 'product_id', '') = '' then raise exception 'purchase_token and product_id are required'; end if;
  if p_user is not null and not exists (select 1 from profiles where id = p_user) then p_user := null; end if;
  select user_id into v_existing from play_subscriptions where purchase_token = v_token for update;
  v_owner := case when p_from_app and p_user is not null then p_user else coalesce(v_existing, p_user) end;
  if v_owner is null and v_linked is not null then
    select user_id into v_owner from play_subscriptions where purchase_token = v_linked;
  end if;

  insert into play_subscriptions (purchase_token, user_id, product_id, base_plan_id, status, expires_at, grace_until,
    auto_renew, offer_type, offer_id, price_milli, currency, environment, linked_purchase_token, latest_order_id,
    acknowledged, started_at, updated_at)
  values (v_token, v_owner, p_row ->> 'product_id', p_row ->> 'base_plan_id', p_row ->> 'status',
    (p_row ->> 'expires_at')::timestamptz, (p_row ->> 'grace_until')::timestamptz, (p_row ->> 'auto_renew')::boolean,
    (p_row ->> 'offer_type')::int, p_row ->> 'offer_id', (p_row ->> 'price_milli')::bigint, p_row ->> 'currency',
    p_row ->> 'environment', v_linked, p_row ->> 'latest_order_id', (p_row ->> 'acknowledged')::boolean,
    (p_row ->> 'started_at')::timestamptz, now())
  on conflict (purchase_token) do update set
    user_id = excluded.user_id, product_id = excluded.product_id, base_plan_id = excluded.base_plan_id,
    -- A refund Google reported stays a refund until Google charges a new order.
    status = case when play_subscriptions.status = 'refunded' and excluded.latest_order_id is not distinct from play_subscriptions.latest_order_id
                  then 'refunded' else excluded.status end,
    expires_at = excluded.expires_at, grace_until = excluded.grace_until, auto_renew = excluded.auto_renew,
    offer_type = coalesce(excluded.offer_type, play_subscriptions.offer_type),
    offer_id = coalesce(excluded.offer_id, play_subscriptions.offer_id),
    price_milli = coalesce(excluded.price_milli, play_subscriptions.price_milli),
    currency = coalesce(excluded.currency, play_subscriptions.currency),
    environment = excluded.environment, linked_purchase_token = coalesce(excluded.linked_purchase_token, play_subscriptions.linked_purchase_token),
    latest_order_id = coalesce(excluded.latest_order_id, play_subscriptions.latest_order_id),
    acknowledged = excluded.acknowledged, started_at = coalesce(play_subscriptions.started_at, excluded.started_at),
    updated_at = now();

  if v_linked is not null then
    update play_subscriptions set status = 'expired', auto_renew = false, updated_at = now()
    where purchase_token = v_linked and status not in ('expired', 'refunded', 'revoked');
  end if;

  if p_order is not null and coalesce(p_order ->> 'order_id', '') <> '' then
    insert into play_orders (order_id, purchase_token, product_id, kind, price_milli, currency, offer_type, offer_id, environment, charged_at)
    values (p_order ->> 'order_id', v_token, p_row ->> 'product_id', coalesce(p_order ->> 'kind', 'purchase'),
      coalesce((p_order ->> 'price_milli')::bigint, 0), coalesce(p_order ->> 'currency', p_row ->> 'currency', 'USD'),
      (p_row ->> 'offer_type')::int, p_row ->> 'offer_id', p_row ->> 'environment',
      coalesce((p_order ->> 'charged_at')::timestamptz, now()))
    on conflict (order_id) do nothing;
  end if;
  return v_owner;
end;
$$;

-- Google voided an order (a refund or chargeback). The order's price comes off the revenue, and
-- when it is the subscription's latest order, Pro from it ends. Returns the account, if any.
create or replace function play_refund_order(p_order_id text, p_purchase_token text)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_user uuid;
begin
  if current_user not in ('service_role', 'postgres') then raise exception 'not allowed' using errcode = '42501'; end if;
  update play_orders set refunded_at = coalesce(refunded_at, now()) where order_id = p_order_id;
  update play_subscriptions set status = 'refunded', updated_at = now()
  where purchase_token = p_purchase_token
    and (latest_order_id is null or latest_order_id = p_order_id)
  returning user_id into v_user;
  if v_user is null then select user_id into v_user from play_subscriptions where purchase_token = p_purchase_token; end if;
  return v_user;
end;
$$;

revoke execute on function play_save_subscription(jsonb, uuid, boolean, jsonb) from public, anon, authenticated;
revoke execute on function play_refund_order(text, text) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function play_save_subscription(jsonb, uuid, boolean, jsonb), play_refund_order(text, text) to service_role;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. What the app shows. Same keys as before, plus Google Play.
-- ---------------------------------------------------------------------------
create or replace function my_entitlements()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_admin boolean;
  v_trial entitlement_grants;
  v_comp entitlement_grants;
  v_paid store_subscriptions;
  v_last_trial entitlement_grants;
  v_source text;
  v_until timestamptz;
  v_pro boolean;
  v_sub jsonb;
begin
  if v_me is null then return null; end if;
  v_admin := is_admin(v_me);
  v_trial := live_grant(v_me, 'trial');
  v_comp := live_grant(v_me, 'comp');
  -- The paid subscription that runs longest; Apple first when two end at the same time.
  select * into v_paid from store_subscriptions s
  where s.user_id = v_me and subscription_gives_pro(s.status, s.expires_at, s.grace_until)
  order by s.expires_at desc nulls first, s.store limit 1;
  select * into v_last_trial from entitlement_grants where user_id = v_me and source = 'trial';

  v_source := case
    when v_admin then 'admin'
    when v_paid.subscription_id is not null then v_paid.store
    when v_comp.id is not null then 'comp'
    when v_trial.id is not null then 'trial'
  end;
  v_until := case
    when v_source in ('apple', 'google') then coalesce(v_paid.grace_until, v_paid.expires_at)
    when v_source = 'comp' then v_comp.ends_at
    when v_source = 'trial' then v_trial.ends_at
  end;
  v_pro := v_source is not null;
  v_sub := case when v_paid.subscription_id is null then null else jsonb_build_object(
    'store', v_paid.store, 'product_id', v_paid.product_id, 'status', v_paid.status, 'expires_at', v_paid.expires_at,
    'auto_renew', v_paid.auto_renew, 'environment', v_paid.environment) end;

  return jsonb_build_object(
    'account_type', case when v_admin then 'admin' when v_pro then 'pro' else 'free' end,
    'pro_source', v_source,
    'pro_until', v_until,
    'trial_ends_at', v_trial.ends_at,
    'trial_used', v_last_trial.id is not null,
    'apple', case when v_paid.store = 'apple' then v_sub - 'store' end,
    'google', case when v_paid.store = 'google' then v_sub - 'store' end,
    'store_subscription', v_sub,
    'open_subscriptions', coalesce((
      select jsonb_agg(jsonb_build_object('store', s.store, 'product_id', s.product_id, 'status', s.status,
        'expires_at', s.expires_at, 'auto_renew', s.auto_renew, 'environment', s.environment) order by s.store, s.expires_at desc)
      from store_subscriptions s where s.user_id = v_me and subscription_open(s.status, s.expires_at, s.grace_until)), '[]'::jsonb),
    'rides_created_this_month', rides_created_this_month(v_me),
    'ride_allowance', ride_allowance(v_me),
    'history_limit', case when v_pro then null
      else (select free_monthly_allowance from feature_plans where feature = 'ride_history') end,
    'features', (select coalesce(jsonb_object_agg(feature, has_feature(v_me, feature)), '{}')
                 from feature_plans where min_plan in ('free', 'pro')),
    'server_time', now()
  );
end;
$$;
revoke execute on function my_entitlements() from public, anon;
grant execute on function my_entitlements() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Admin Dashboard: both stores. The same functions as 20261018300000_admin_dashboard.sql
--    and 20261018400000_admin_analytics.sql, reading store_subscriptions, play_orders and
--    play_events next to Apple's tables. Four gain a store column, so they are recreated.
-- ---------------------------------------------------------------------------
drop function admin_account_states();
drop function admin_charges(text);
drop function admin_offer_redemptions(text);
drop function admin_subscriptions(text, text, text, int, int);

-- One row per account with its plan, for lists and counts. Admin wins over everything, then a
-- paid subscription on either store, then a complimentary grant, then a live trial. Admin only, like the rest.
create or replace function admin_account_states()
returns table (
  user_id uuid, label text, pro_source text, pro_until timestamptz,
  trial_id uuid, trial_starts_at timestamptz, trial_ends_at timestamptz, trial_state text,
  comp_id uuid, comp_until timestamptz,
  apple_status text, apple_product text, apple_expires_at timestamptz, apple_auto_renew boolean,
  is_admin boolean, suspended boolean, deletion_requested boolean,
  -- Which store the apple_* columns came from ('apple' or 'google'); the names stay for old pages.
  paid_store text)
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
         when s.live then s.store
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
    exists (select 1 from account_deletion_requests d where d.user_id = p.id and d.handled_at is null),
    s.store
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
    select x.*, subscription_gives_pro(x.status, x.expires_at, x.grace_until) as live
    from store_subscriptions x where x.user_id = p.id
    order by subscription_gives_pro(x.status, x.expires_at, x.grace_until) desc,
      subscription_open(x.status, x.expires_at, x.grace_until) desc, x.expires_at desc nulls last, x.store limit 1) s on true;
end;
$$;

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
    'paid', (select count(*) from st where pro_source in ('apple', 'google')),
    'paid_apple', (select count(*) from st where pro_source = 'apple'),
    'paid_google', (select count(*) from st where pro_source = 'google'),
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
                  from store_subscriptions
                  where environment = 'Production' and status in ('active', 'grace', 'billing_retry')
                    and coalesce(grace_until, expires_at, 'infinity'::timestamptz) > now()),
    'subs_new', (select count(*) from app_store_events where type = 'SUBSCRIBED' and received_at >= p_from and received_at < p_to)
              + (select count(*) from play_orders where kind = 'purchase' and environment = 'Production' and charged_at >= p_from and charged_at < p_to),
    'subs_cancelled', (select count(*) from app_store_events
                       where ((type = 'DID_CHANGE_RENEWAL_STATUS' and subtype = 'AUTO_RENEW_DISABLED') or type in ('EXPIRED', 'REFUND', 'REVOKE'))
                         and received_at >= p_from and received_at < p_to)
                    -- Google Play: 3 canceled, 12 revoked, 13 expired.
                    + (select count(*) from play_events where notification_type in (3, 12, 13) and error is null
                         and received_at >= p_from and received_at < p_to),
    'promo_redemptions', (select count(*) from app_store_events
                          where type in ('SUBSCRIBED', 'OFFER_REDEEMED') and received_at >= p_from and received_at < p_to
                            and (payload #>> '{transaction,offerType}' = '3' or payload ->> 'offerType' = '3' or type = 'OFFER_REDEEMED'))
                       + (select count(*) from play_subscriptions where offer_type = 3 and environment = 'Production'
                            and coalesce(started_at, created_at) >= p_from and coalesce(started_at, created_at) < p_to),
    'store_errors', (select count(*) from app_store_events where error is not null and received_at >= p_from and received_at < p_to)
                  + (select count(*) from play_events where error is not null and received_at >= p_from and received_at < p_to),
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
        union all
        (select 'store_error', e.received_at, 'Google Play ' || coalesce(e.type, '') || ': ' || left(e.error, 120), left(e.purchase_token, 40)
           from play_events e where e.error is not null order by e.received_at desc limit 5)
      ) r)
  ) into v;
  return v;
end;
$$;

-- Trials that ended (expired, not revoked) inside the window, and how many of those accounts
-- have ever had a paid subscription on either store.
create or replace function admin_trial_conversion(p_from timestamptz default null, p_to timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_ended int; v_paid int;
begin
  perform require_admin();
  select count(*), count(*) filter (where exists (
           select 1 from store_subscriptions s where s.user_id = g.user_id and s.environment = 'Production'))
    into v_ended, v_paid
  from entitlement_grants g
  where g.source = 'trial' and g.revoked_at is null and g.ends_at <= now()
    and g.ends_at >= coalesce(p_from, '-infinity') and g.ends_at < coalesce(p_to, 'infinity');
  return jsonb_build_object('ended', v_ended, 'paid', v_paid,
    'rate', case when v_ended = 0 then null else round(v_paid::numeric / v_ended, 4) end);
end;
$$;

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
        when 'paid' then st.pro_source in ('apple', 'google')
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
        'store', s.store, 'product_id', s.product_id, 'status', s.status, 'expires_at', s.expires_at, 'auto_renew', s.auto_renew,
        'environment', s.environment, 'offer_id', s.offer_id, 'updated_at', s.updated_at) order by s.updated_at desc)
      from store_subscriptions s where s.user_id = p_id), '[]'),
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
           exists (select 1 from store_subscriptions s where s.user_id = g.user_id and s.environment = 'Production') as paid
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

-- Every charge, refund and refund reversal Apple or Google Play reported, one row per transaction
-- (a Google Play order). store says which.
create or replace function admin_charges(p_env text)
returns table (transaction_id text, original_transaction_id text, at timestamptz, type text, kind text,
  price_milli bigint, currency text, offer_type int, offer_id text, user_id uuid, store text)
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
  select c.tid, c.otid, c.received_at, c.type, c.kind, c.price, c.cur, c.ot, c.oid, s.user_id, 'apple'::text
  from c left join app_store_subscriptions s on s.original_transaction_id = c.otid
  union all
  -- Google Play: each order once; a refund takes the order's price off on the day it was refunded.
  select o.order_id, o.purchase_token, o.charged_at, case o.kind when 'purchase' then 'SUBSCRIBED' else 'DID_RENEW' end,
    'charge', o.price_milli, o.currency, o.offer_type, o.offer_id, g.user_id, 'google'
  from play_orders o left join play_subscriptions g on g.purchase_token = o.purchase_token
  where o.environment = p_env and o.price_milli > 0
  union all
  select o.order_id, o.purchase_token, o.refunded_at, 'REFUND', 'refund', o.price_milli, o.currency, o.offer_type, o.offer_id, g.user_id, 'google'
  from play_orders o left join play_subscriptions g on g.purchase_token = o.purchase_token
  where o.environment = p_env and o.refunded_at is not null
$$;

-- Each offer-code redemption: the first transaction of a subscription that carried the offer,
-- free or paid. Google Play promo codes count the same way (offer_type 3 on the subscription).
create or replace function admin_offer_redemptions(p_env text)
returns table (original_transaction_id text, offer_id text, redeemed_at timestamptz, product_id text, user_id uuid, store text)
language sql stable set search_path = public as $$
  (select distinct on (r.otid, r.oid) r.otid, r.oid, r.received_at, r.product, s.user_id, 'apple'::text
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
  order by r.otid, r.oid, r.received_at)
  union all
  select g.purchase_token, g.offer_id, coalesce(g.started_at, g.created_at), g.product_id, g.user_id, 'google'
  from play_subscriptions g
  where g.environment = p_env and g.offer_type = 3 and g.offer_id is not null
$$;

-- Everyone's plan right now, and subscriptions on both stores by state, plus monthly recurring
-- revenue. by_store splits the subscription counts and revenue per store.
create or replace function admin_subscription_summary(p_env text default 'Production')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  result jsonb;
begin
  perform require_admin();
  with s as (
    select * from store_subscriptions where environment = p_env
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
    'by_store', (select coalesce(jsonb_object_agg(st.store, jsonb_build_object(
        'paying', (select count(*) from s where s.store = st.store and status in ('active', 'grace')),
        'billing', (select count(*) from s where s.store = st.store and status in ('grace', 'billing_retry')),
        'ended', (select count(*) from s where s.store = st.store and status in ('expired', 'refunded', 'revoked')),
        'mrr', coalesce((
          select jsonb_agg(jsonb_build_object('currency', currency, 'mrr_milli', mrr, 'subscriptions', n) order by mrr desc)
          from (
            select coalesce(currency, 'USD') as currency, count(*) as n,
              sum(case when admin_plan_of(product_id) = 'annual' then coalesce(price_milli, 0) / 12 else coalesce(price_milli, 0) end)::bigint as mrr
            from s where s.store = st.store and status in ('active', 'grace')
            group by 1) m), '[]'::jsonb))), '{}'::jsonb)
      from (values ('apple'), ('google')) st (store)),
    'errors_7d', (select count(*) from app_store_events where error is not null and received_at > now() - interval '7 days')
               + (select count(*) from play_events where error is not null and received_at > now() - interval '7 days'),
    'last_event_at', (select max(received_at) from app_store_events),
    'last_google_event_at', (select max(received_at) from play_events where message_id is not null)
  ) into result;
  return result;
end;
$$;

-- Subscriptions on both stores, newest change first, with who holds them. For Google Play,
-- original_transaction_id is the purchase token. p_store limits it to 'apple' or 'google'.
create or replace function admin_subscriptions(
  p_filter text default 'all', p_q text default null, p_env text default 'Production',
  p_page int default 0, p_page_size int default 50, p_store text default null)
returns table (
  original_transaction_id text, user_id uuid, display_name text, email text, product_id text, plan text,
  status text, auto_renew boolean, expires_at timestamptz, grace_until timestamptz, offer_type int,
  offer_id text, price_milli bigint, currency text, environment text, updated_at timestamptz,
  first_seen_at timestamptz, total bigint, store text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  return query
  select s.subscription_id, s.user_id, p.display_name, u.email::text, s.product_id, admin_plan_of(s.product_id),
    s.status, s.auto_renew, s.expires_at, s.grace_until, s.offer_type, s.offer_id, s.price_milli, s.currency,
    s.environment, s.updated_at,
    case s.store when 'apple' then (select min(e.received_at) from app_store_events e where e.original_transaction_id = s.subscription_id)
      else s.created_at end,
    count(*) over (),
    s.store
  from store_subscriptions s
  left join profiles p on p.id = s.user_id
  left join auth.users u on u.id = s.user_id
  where s.environment = p_env
    and (p_store is null or p_store = '' or s.store = p_store)
    and case coalesce(p_filter, 'all')
      when 'all' then true
      when 'paying' then s.status in ('active', 'grace')
      when 'cancelled' then s.status in ('active', 'grace') and s.auto_renew is false
      when 'billing' then s.status in ('grace', 'billing_retry')
      when 'ended' then s.status in ('expired', 'refunded', 'revoked')
      when 'renewing_soon' then s.status = 'active' and s.auto_renew is not false and s.expires_at between now() and now() + interval '7 days'
      when 'offer_code' then exists (select 1 from admin_offer_redemptions(p_env) o where o.original_transaction_id = s.subscription_id)
      else s.status = p_filter end
    and (p_q is null or p_q = ''
      or p.display_name ilike '%' || p_q || '%' or u.email ilike '%' || p_q || '%'
      or s.subscription_id = p_q or s.user_id::text = p_q)
  order by s.updated_at desc
  limit least(greatest(p_page_size, 1), 200) offset greatest(p_page, 0) * least(greatest(p_page_size, 1), 200);
end;
$$;

-- What Apple or Google Play told us about one subscription, oldest first. Raw payloads stay out.
create or replace function admin_subscription_history(p_original_transaction_id text)
returns table (received_at timestamptz, type text, subtype text, error text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  return query
  select x.received_at, x.type, x.subtype, x.error from (
    select e.received_at, e.type, e.subtype, e.error from app_store_events e
    where e.original_transaction_id = p_original_transaction_id
    union all
    select e.received_at, e.type, case when e.message_id is null then 'App Check' end, e.error from play_events e
    where e.purchase_token = p_original_transaction_id) x
  order by x.received_at;
end;
$$;

-- Notifications or verifications that failed (bad signature, unknown user, and so on).
create or replace function admin_subscription_errors(p_days int default 30, p_limit int default 100)
returns table (received_at timestamptz, type text, subtype text, original_transaction_id text, error text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  return query
  select x.received_at, x.type, x.subtype, x.original_transaction_id, x.error from (
    select e.received_at, e.type, e.subtype, e.original_transaction_id, e.error from app_store_events e
    where e.error is not null and e.received_at > now() - make_interval(days => greatest(p_days, 1))
    union all
    select e.received_at, 'Google Play ' || coalesce(e.type, ''), null, e.purchase_token, e.error from play_events e
    where e.error is not null and e.received_at > now() - make_interval(days => greatest(p_days, 1))) x
  order by x.received_at desc limit least(greatest(p_limit, 1), 500);
end;
$$;

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
    from r left join store_subscriptions s on s.subscription_id = r.original_transaction_id and s.store = r.store
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
  left join store_subscriptions s on s.subscription_id = r.original_transaction_id and s.store = r.store
  left join profiles p on p.id = r.user_id
  left join auth.users u on u.id = r.user_id
  where p_q is null or p_q = '' or r.offer_id ilike '%' || p_q || '%' or p.display_name ilike '%' || p_q || '%' or u.email ilike '%' || p_q || '%'
  order by r.redeemed_at desc limit least(greatest(p_limit, 1), 1000);
end;
$$;

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
    'google_play', jsonb_build_object(
      'last_event_at', (select max(received_at) from play_events where message_id is not null),
      'events_24h', (select count(*) from play_events where received_at > now() - interval '1 day'),
      'errors_24h', (select count(*) from play_events where error is not null and received_at > now() - interval '1 day'),
      'errors_7d', (select count(*) from play_events where error is not null and received_at > now() - interval '7 days')),
    'activity', jsonb_build_object(
      'active_24h', (select count(*) from profiles where last_active_at > now() - interval '1 day'),
      'events_24h', (select count(*) from events where created_at > now() - interval '1 day'),
      'live_rides', (select count(*) from rides where status = 'live')),
    'jobs', cron_runs
  ) into result;
  return result;
end;
$$;

revoke execute on function admin_account_states() from public, anon, authenticated;
revoke all on function admin_charges(text) from public, anon, authenticated;
revoke all on function admin_offer_redemptions(text) from public, anon, authenticated;
revoke all on function admin_subscriptions(text, text, text, int, int, text) from public, anon;
grant execute on function admin_subscriptions(text, text, text, int, int, text) to authenticated;
