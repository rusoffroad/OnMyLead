-- Admin metrics leave test rides out (Chris 2026-11-19: "For the metrics on the server, get rid of
-- all my test rides and Apple's test rides").
--
-- A test ride is one organized by a test or admin account (admin_test_accounts: Chris's two
-- accounts and the App Review account appreview@rusoffroad.com, plus admin_users) that no real
-- rider took part in. A ride where a real rider joined, checked in or shared their location still
-- counts, even when Chris organized it.
--
-- Nothing is deleted: the rides stay in the database and in Admin > Rides. Only the counts on the
-- Overview (Riding Now, Upcoming, Completed, Rides Created, Riders Joining, the charts, the Recent
-- list) and on Analytics change. Joins and chat messages from test accounts are left out too. Admin > Usage
-- already left test accounts out (20261115100000_rider_usage.sql).
--
-- Backward compatible: one new internal function; the four admin functions keep their signatures
-- and the keys they return.

-- Make sure the App Review account is marked (20261115100000 did it; harmless if already there).
insert into admin_test_accounts (user_id, note)
select id, 'App Review demo account' from auth.users
where lower(email) = 'appreview@rusoffroad.com'
on conflict (user_id) do nothing;

-- True when the ride is a test ride. p_organizer covers ride_creations rows whose ride was deleted.
create or replace function admin_is_test_ride(p_ride uuid, p_organizer uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select admin_is_test_account(coalesce(p_organizer, (select r.organizer_id from rides r where r.id = p_ride)))
     and not exists (
       select 1 from ride_members m
       where m.ride_id = p_ride and (m.status = 'joined' or m.checked_in_at is not null)
         and not admin_is_test_account(m.user_id))
     and not exists (
       select 1 from ride_tracks t
       where t.ride_id = p_ride and jsonb_typeof(t.points) = 'array' and jsonb_array_length(t.points) > 0
         and not admin_is_test_account(t.user_id))
$$;
revoke all on function admin_is_test_ride(uuid, uuid) from public, anon, authenticated;

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
    'rides_live', (select count(*) from rides where status = 'live' and not admin_is_test_ride(id)),
    'rides_upcoming', (select count(*) from rides where status = 'scheduled' and meet_at >= now() and not admin_is_test_ride(id)),
    'rides_completed', (select count(*) from rides where status = 'ended' and coalesce(ended_at, meet_at) >= p_from and coalesce(ended_at, meet_at) < p_to
                          and not admin_is_test_ride(id)),
    'rides_created', (select count(*) from ride_creations where created_at >= p_from and created_at < p_to
                        and not admin_is_test_ride(ride_id, user_id)),
    'ride_joins', (select count(*) from ride_members where role <> 'organizer' and status = 'joined' and created_at >= p_from and created_at < p_to
                     and not admin_is_test_account(user_id) and not admin_is_test_ride(ride_id)),
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
        (select 'ride', r.created_at, r.name, r.id::text from rides r where not admin_is_test_ride(r.id) order by r.created_at desc limit 8)
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
      union all select created_at, ride_id from ride_creations where p_metric = 'rides_created' and not admin_is_test_ride(ride_id, user_id)
      union all select created_at, user_id from ride_members where p_metric = 'ride_joins' and role <> 'organizer' and status = 'joined'
        and not admin_is_test_account(user_id) and not admin_is_test_ride(ride_id)
      union all select coalesce(ended_at, meet_at), id from rides where p_metric = 'rides_completed' and status = 'ended' and not admin_is_test_ride(id)
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
    'rides_created', (select count(*) from ride_creations where created_at >= p_from and created_at < p_to
                        and not admin_is_test_ride(ride_id, user_id)),
    'rides_completed', (select count(*) from rides where status = 'ended' and ended_at >= p_from and ended_at < p_to
                          and not admin_is_test_ride(id)),
    'rides_cancelled', (select count(*) from rides where status = 'cancelled' and created_at >= p_from and created_at < p_to
                          and not admin_is_test_ride(id)),
    'ride_joins', (select count(*) from ride_members where status = 'joined' and role <> 'organizer' and created_at >= p_from and created_at < p_to
                     and not admin_is_test_account(user_id) and not admin_is_test_ride(ride_id)),
    'messages', (select count(*) from ride_messages where created_at >= p_from and created_at < p_to
                   and not admin_is_test_account(user_id) and not admin_is_test_ride(ride_id)),
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
      and not admin_is_test_ride(r.id)
    union all
    select m.created_at from ride_messages m where p_metric = 'messages' and m.created_at >= p_from and m.created_at < p_to
      and not admin_is_test_account(m.user_id) and not admin_is_test_ride(m.ride_id)
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
