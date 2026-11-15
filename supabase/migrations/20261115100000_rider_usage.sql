-- How riders really use the app, for the owner (Admin Dashboard > Usage and the Overview's Real Use
-- panel). Chris 2026-11-15: Map Mode time was only recorded for Free riders (map_mode_usage, for
-- the Free hours), so with most launch riders on Pro or the trial nothing showed.
--
-- Every signed-in rider's app now reports, per day: how many times the app was opened and how long
-- it was in front, and how many Map Mode and Ride Mode sessions with their time on screen. Counts
-- and seconds only: never a location, a route or what was tapped. Only the admin_* functions read
-- it, and they leave test and admin accounts out (admin_is_test_account, 20261030000000).
--
-- Backward compatible: one new table and new functions. App builds before this one never call
-- log_app_usage, and a build with it ignores a server that doesn't have it yet.

-- ---------------------------------------------------------------------------
-- Usage per rider, day, kind and device
-- ---------------------------------------------------------------------------
create table if not exists rider_usage_days (
  user_id uuid not null references profiles (id) on delete cascade,
  day date not null,
  -- app: the app was opened (a session) and in front (seconds). map_mode / ride_mode: those screens.
  kind text not null check (kind in ('app', 'map_mode', 'ride_mode')),
  device text not null check (device in ('iphone', 'ipad', 'android', 'web', 'other')),
  sessions int not null default 0 check (sessions >= 0),
  seconds int not null default 0 check (seconds >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, day, kind, device)
);
create index if not exists rider_usage_days_day on rider_usage_days (day);
alter table rider_usage_days enable row level security;
-- No policies and no grants: riders write only through log_app_usage, the owner reads through admin_*.
revoke all on rider_usage_days from public, anon, authenticated;

-- Adds to today's (UTC) row. A call adds at most 5 sessions and 5 minutes, and a day holds at most
-- 500 sessions and 24 hours for each kind and device, so a stuck or tampered app can't run away.
create or replace function log_app_usage(p_kind text, p_sessions int, p_seconds int, p_device text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_day date := (now() at time zone 'utc')::date;
  v_device text := case when p_device in ('iphone', 'ipad', 'android', 'web') then p_device else 'other' end;
  v_sessions int := least(greatest(coalesce(p_sessions, 0), 0), 5);
  v_seconds int := least(greatest(coalesce(p_seconds, 0), 0), 300);
begin
  if v_me is null then raise exception 'not signed in'; end if;
  if p_kind is null or p_kind not in ('app', 'map_mode', 'ride_mode') then raise exception 'unknown usage kind'; end if;
  if v_sessions = 0 and v_seconds = 0 then return; end if;
  if not exists (select 1 from profiles where id = v_me) then return; end if;
  insert into rider_usage_days (user_id, day, kind, device, sessions, seconds)
  values (v_me, v_day, p_kind, v_device, v_sessions, v_seconds)
  on conflict (user_id, day, kind, device) do update
    set sessions = least(rider_usage_days.sessions + excluded.sessions, 500),
        seconds = least(rider_usage_days.seconds + excluded.seconds, 86400),
        updated_at = now();
end;
$$;
revoke execute on function log_app_usage(text, int, int, text) from public, anon;
grant execute on function log_app_usage(text, int, int, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The App Review demo account is a test account
-- ---------------------------------------------------------------------------
-- Apple's reviewers sign in with it (app-store/listing.md); it isn't a rider.
insert into admin_test_accounts (user_id, note)
select id, 'App Review demo account' from auth.users
where lower(email) = 'appreview@rusoffroad.com'
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Admin: real use, test and admin accounts left out
-- ---------------------------------------------------------------------------
-- A ride "really happened" when it started and at least two riders shared their location on it
-- (each has a ride track with points), at least one of them a real rider.
create or replace function admin_ride_sharers(p_ride uuid)
returns table (riders bigint, real_riders bigint) language sql stable security definer set search_path = public as $$
  select count(*), count(*) filter (where not admin_is_test_account(t.user_id))
  from ride_tracks t
  where t.ride_id = p_ride and jsonb_typeof(t.points) = 'array' and jsonb_array_length(t.points) > 0
$$;

create or replace function admin_usage_summary(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
  v_from_day date;
  v_to_day date;
begin
  perform require_admin();
  p_from := coalesce(p_from, '-infinity'); p_to := coalesce(p_to, 'infinity');
  v_from_day := case when p_from = '-infinity' then '-infinity'::date else (p_from at time zone 'utc')::date end;
  v_to_day := case when p_to = 'infinity' then 'infinity'::date else ((p_to - interval '1 microsecond') at time zone 'utc')::date end;
  with acc as (
    select p.id, p.created_at, p.last_active_at, admin_is_test_account(p.id) as test from profiles p
  ), rr as (select * from acc where not test),
  u as (
    select d.* from rider_usage_days d join rr on rr.id = d.user_id
    where d.day >= v_from_day and d.day <= v_to_day
  ), rd as (
    select x.id, x.created_at, x.started_at, s.riders as sharers, s.real_riders as real_sharers,
           admin_is_test_account(x.organizer_id) as test_organizer
    from rides x cross join lateral admin_ride_sharers(x.id) s
    where (x.created_at >= p_from and x.created_at < p_to) or (x.started_at >= p_from and x.started_at < p_to)
  )
  select jsonb_build_object(
    'tracking_since', (select min(day) from rider_usage_days),
    'accounts_total', (select count(*) from acc),
    'test_accounts', (select count(*) from acc where test),
    'riders_total', (select count(*) from rr),
    'signups', (select count(*) from rr where created_at >= p_from and created_at < p_to),
    'active_1d', (select count(*) from rr where last_active_at >= now() - interval '1 day'),
    'active_30d', (select count(*) from rr where last_active_at >= now() - interval '30 days'),
    'rides_created', (select count(*) from rd where not test_organizer and created_at >= p_from and created_at < p_to),
    'rides_started', (select count(*) from rd where started_at >= p_from and started_at < p_to
                        and (not test_organizer or real_sharers > 0)),
    'rides_shared', (select count(*) from rd where started_at >= p_from and started_at < p_to
                       and sharers >= 2 and real_sharers >= 1),
    'app', (select jsonb_build_object('riders', count(distinct user_id), 'sessions', coalesce(sum(sessions), 0), 'seconds', coalesce(sum(seconds), 0))
            from u where kind = 'app'),
    'map_mode', (select jsonb_build_object('riders', count(distinct user_id), 'sessions', coalesce(sum(sessions), 0), 'seconds', coalesce(sum(seconds), 0))
                 from u where kind = 'map_mode'),
    'ride_mode', (select jsonb_build_object('riders', count(distinct user_id), 'sessions', coalesce(sum(sessions), 0), 'seconds', coalesce(sum(seconds), 0))
                  from u where kind = 'ride_mode'),
    'by_device', (select coalesce(jsonb_agg(jsonb_build_object('device', device, 'riders', n) order by n desc, device), '[]')
                  from (select device, count(distinct user_id) as n from u where kind = 'app' group by device) z)
  ) into v;
  return v;
end;
$$;

-- Riders who used the app in the period, most time in the app first, with their Map Mode and Ride
-- Mode use and their rides. Test and admin accounts left out.
create or replace function admin_usage_riders(p_from timestamptz, p_to timestamptz, p_limit int default 100)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
  v_from_day date;
  v_to_day date;
begin
  perform require_admin();
  p_from := coalesce(p_from, '-infinity'); p_to := coalesce(p_to, 'infinity');
  p_limit := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_from_day := case when p_from = '-infinity' then '-infinity'::date else (p_from at time zone 'utc')::date end;
  v_to_day := case when p_to = 'infinity' then 'infinity'::date else ((p_to - interval '1 microsecond') at time zone 'utc')::date end;
  with u as (
    select d.user_id,
      sum(d.sessions) filter (where d.kind = 'app') as opens,
      sum(d.seconds) filter (where d.kind = 'app') as app_seconds,
      sum(d.sessions) filter (where d.kind = 'map_mode') as map_sessions,
      sum(d.seconds) filter (where d.kind = 'map_mode') as map_seconds,
      sum(d.sessions) filter (where d.kind = 'ride_mode') as ride_sessions,
      sum(d.seconds) filter (where d.kind = 'ride_mode') as ride_seconds,
      count(distinct d.day) as days,
      max(d.day) as last_day,
      array_agg(distinct d.device) as devices
    from rider_usage_days d
    where d.day >= v_from_day and d.day <= v_to_day and not admin_is_test_account(d.user_id)
    group by d.user_id
  ), st as (select * from admin_account_states())
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.app_seconds desc, x.opens desc), '[]') into v
  from (
    select u.user_id, p.display_name, st.label as plan, p.created_at,
      coalesce(u.opens, 0) as opens, coalesce(u.app_seconds, 0) as app_seconds,
      coalesce(u.map_sessions, 0) as map_sessions, coalesce(u.map_seconds, 0) as map_seconds,
      coalesce(u.ride_sessions, 0) as ride_sessions, coalesce(u.ride_seconds, 0) as ride_seconds,
      u.days, u.last_day, to_jsonb(u.devices) as devices,
      (select count(*) from rides r where r.organizer_id = u.user_id and r.created_at >= p_from and r.created_at < p_to) as rides_created,
      (select count(*) from ride_tracks t join rides r on r.id = t.ride_id
        where t.user_id = u.user_id and jsonb_typeof(t.points) = 'array' and jsonb_array_length(t.points) > 0
          and r.started_at >= p_from and r.started_at < p_to) as rides_shared
    from u join profiles p on p.id = u.user_id left join st on st.user_id = u.user_id
    order by coalesce(u.app_seconds, 0) desc, coalesce(u.opens, 0) desc
    limit p_limit
  ) x;
  return v;
end;
$$;

-- Per bucket: riders who opened the app, used Map Mode, used Ride Mode, and the minutes in each.
create or replace function admin_usage_series(p_from timestamptz, p_to timestamptz, p_bucket text default 'day')
returns table (bucket_start timestamptz, app_riders bigint, map_mode_riders bigint, ride_mode_riders bigint,
  map_mode_minutes bigint, ride_mode_minutes bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  perform admin_check_bucket(p_bucket);
  if p_from is null or p_to is null or p_to <= p_from then raise exception 'bad date range'; end if;
  if p_to - p_from > interval '3 years' then raise exception 'date range too long'; end if;
  return query
  with b as (
    select x.bucket_start as s, least(x.bucket_start + ('1 ' || p_bucket)::interval, p_to) as e
    from admin_buckets(p_from, p_to, p_bucket) x
  ), d as (
    select r.user_id, r.kind, r.seconds, (r.day::timestamp at time zone 'utc') as at
    from rider_usage_days r
    where r.day >= (p_from at time zone 'utc')::date and r.day <= (p_to at time zone 'utc')::date
      and not admin_is_test_account(r.user_id)
  )
  select b.s,
    (select count(distinct d.user_id) from d where d.kind = 'app' and d.at >= date_trunc('day', b.s) and d.at < b.e),
    (select count(distinct d.user_id) from d where d.kind = 'map_mode' and d.at >= date_trunc('day', b.s) and d.at < b.e),
    (select count(distinct d.user_id) from d where d.kind = 'ride_mode' and d.at >= date_trunc('day', b.s) and d.at < b.e),
    (select coalesce(sum(d.seconds), 0)::bigint / 60 from d where d.kind = 'map_mode' and d.at >= date_trunc('day', b.s) and d.at < b.e),
    (select coalesce(sum(d.seconds), 0)::bigint / 60 from d where d.kind = 'ride_mode' and d.at >= date_trunc('day', b.s) and d.at < b.e)
  from b order by b.s;
end;
$$;

revoke all on function admin_ride_sharers(uuid) from public, anon, authenticated;
revoke all on function admin_usage_summary(timestamptz, timestamptz), admin_usage_riders(timestamptz, timestamptz, int),
  admin_usage_series(timestamptz, timestamptz, text) from public, anon;
grant execute on function admin_usage_summary(timestamptz, timestamptz), admin_usage_riders(timestamptz, timestamptz, int),
  admin_usage_series(timestamptz, timestamptz, text) to authenticated;
