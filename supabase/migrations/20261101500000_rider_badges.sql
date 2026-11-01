-- Rider badges and ranks.
-- Riders earn badges for what they actually do on OnMyLead, each with Bronze, Silver and Gold levels:
--   trail_boss   rides led                          1 / 10 / 25
--   tail_gunner  rides at the rear (the 'sweep' role)  1 / 10 / 25
--   crew_rider   rides ridden with a group          1 / 10 / 50
--   mile_eater   miles ridden on rides              100 / 1,000 / 5,000
--   trailblazer  trails shared to the public map    1 / 5 / 20
--   mapmaker     shared trails riders rated accurate  1 / 5 / 20
--   trail_scout  trails rated for accuracy          5 / 25 / 100
-- The app shows a rank from the number of levels earned (app/src/core/badges.ts, which mirrors
-- the thresholds below and is unit tested against them).
--
-- Nothing here can be typed in by hand: badges are written only by award_rider_badges(), which
-- counts from the server's own records.
--   * A ride counts only once it has ended, and only for a rider whose own GPS track on it covers
--     at least half a mile. Leading, tail gunning and group rides also need at least two riders
--     with such a track, so a ride you end alone in your driveway counts for nothing.
--   * Miles come from the rider's own track, cleaned like ride_group_summary (no GPS spikes, no
--     creeping at a gas stop) and capped at 1,000 miles per ride.
--   * Trail badges read shared_trails and trail_ratings (migration 20261101600000_nav_trails.sql)
--     only when those tables exist, so this migration runs on its own.
-- Earned badges stay earned. A new badge sends one push ("account" notifications, the same
-- switch as Pro Trial Reminders) and shows as New on the You tab until the rider has seen it.
--
-- Additive only: two new tables and new functions; push_batch_account is replaced with a version
-- that still sends the Pro trial reminders exactly as before and also sends badge pushes.

-- ---------------------------------------------------------------------------
-- The levels, in one place.
-- ---------------------------------------------------------------------------
create or replace function badge_levels()
returns table (badge text, level int, threshold int)
language sql immutable set search_path = public as $$
  values
    ('trail_boss', 1, 1), ('trail_boss', 2, 10), ('trail_boss', 3, 25),
    ('tail_gunner', 1, 1), ('tail_gunner', 2, 10), ('tail_gunner', 3, 25),
    ('crew_rider', 1, 1), ('crew_rider', 2, 10), ('crew_rider', 3, 50),
    ('mile_eater', 1, 100), ('mile_eater', 2, 1000), ('mile_eater', 3, 5000),
    ('trailblazer', 1, 1), ('trailblazer', 2, 5), ('trailblazer', 3, 20),
    ('mapmaker', 1, 1), ('mapmaker', 2, 5), ('mapmaker', 3, 20),
    ('trail_scout', 1, 5), ('trail_scout', 2, 25), ('trail_scout', 3, 100)
$$;
grant execute on function badge_levels() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- What each ended ride counts for, per rider. Owner-readable only; the app shows totals.
-- ---------------------------------------------------------------------------
create table if not exists rider_ride_credits (
  ride_id uuid not null references rides (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  led boolean not null default false,
  swept boolean not null default false,
  miles numeric(8, 1) not null default 0 check (miles >= 0),
  -- Riders on this ride whose own track covers at least half a mile, this rider included or not.
  riders_tracked int not null default 0,
  counted_at timestamptz not null default now(),
  primary key (ride_id, user_id)
);
create index if not exists rider_ride_credits_user on rider_ride_credits (user_id);
alter table rider_ride_credits enable row level security;
create policy rider_ride_credits_owner_read on rider_ride_credits for select to authenticated
  using (user_id = auth.uid());
grant select on rider_ride_credits to authenticated;

-- ---------------------------------------------------------------------------
-- Earned badges: one row per level. Every signed-in rider can read them (they show beside rider
-- names, like the ride name does); nobody can write them except award_rider_badges().
-- ---------------------------------------------------------------------------
create table if not exists rider_badges (
  user_id uuid not null references profiles (id) on delete cascade,
  badge text not null check (badge in ('trail_boss', 'tail_gunner', 'crew_rider', 'mile_eater', 'trailblazer', 'mapmaker', 'trail_scout')),
  level int not null check (level between 1 and 3),
  earned_at timestamptz not null default now(),
  -- When the rider saw it on the You tab; null shows it as New.
  seen_at timestamptz,
  primary key (user_id, badge, level)
);
alter table rider_badges enable row level security;
create policy rider_badges_read on rider_badges for select to authenticated using (true);
grant select on rider_badges to authenticated;

-- ---------------------------------------------------------------------------
-- One rider's miles on one ride, from their own track (same cleaning as ride_group_summary).
-- ---------------------------------------------------------------------------
create or replace function rider_track_miles(p_ride uuid, p_user uuid)
returns numeric language sql stable security definer set search_path = public as $$
  with pts as (
    select (e.p ->> 0)::double precision as lng,
           (e.p ->> 1)::double precision as lat,
           (e.p ->> 2)::double precision as ts
    from ride_tracks t
    cross join lateral jsonb_array_elements(case when jsonb_typeof(t.points) = 'array' then t.points else '[]'::jsonb end) as e(p)
    where t.ride_id = p_ride and t.user_id = p_user
      and jsonb_typeof(e.p) = 'array'
      and jsonb_typeof(e.p -> 0) = 'number' and jsonb_typeof(e.p -> 1) = 'number' and jsonb_typeof(e.p -> 2) = 'number'
  ),
  seg as (
    select ts - lag(ts) over w as dt,
           2 * 6371008.8 * asin(least(1, sqrt(
             power(sin(radians(lat - lag(lat) over w) / 2), 2)
             + cos(radians(lat)) * cos(radians(lag(lat) over w)) * power(sin(radians(lng - lag(lng) over w) / 2), 2)
           ))) as d
    from pts
    where abs(lat) <= 90 and abs(lng) <= 180
    window w as (order by ts)
  )
  select least(1000, round((coalesce(sum(d) filter (where dt > 0 and d / dt between 2 and 60), 0) / 1609.344)::numeric, 1))
  from seg;
$$;
revoke execute on function rider_track_miles(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Trail numbers for a rider: (shared, rated accurate, rated by them). Zero until the offroad
-- navigation tables exist.
-- ---------------------------------------------------------------------------
create or replace function rider_trail_stats(p_user uuid, out shared int, out accurate int, out rated int)
language plpgsql stable security definer set search_path = public as $$
begin
  shared := 0;
  accurate := 0;
  rated := 0;
  if to_regclass('public.shared_trails') is not null then
    execute $q$select count(*)::int from shared_trails where owner_id = $1 and status = 'public'$q$
      into shared using p_user;
    if to_regclass('public.trail_ratings') is not null then
      -- Accurate: still public, rated 4 or 5 by at least two other riders, and mostly rated well.
      execute $q$
        select count(*)::int from (
          select t.id from shared_trails t
          join trail_ratings r on r.trail_id = t.id and r.user_id <> t.owner_id
          where t.owner_id = $1 and t.status = 'public'
          group by t.id
          having count(*) filter (where r.score >= 4) >= 2 and avg(r.score) >= 3.5
        ) x$q$
        into accurate using p_user;
      execute $q$
        select count(*)::int from trail_ratings r join shared_trails t on t.id = r.trail_id
        where r.user_id = $1 and t.owner_id <> $1$q$
        into rated using p_user;
    end if;
  end if;
end;
$$;
revoke execute on function rider_trail_stats(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- A rider's totals, the numbers the badges are earned on.
-- ---------------------------------------------------------------------------
create or replace function rider_badge_stats(p_user uuid)
returns table (badge text, value numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  t record;
begin
  select * into t from rider_trail_stats(p_user);
  return query
  with c as (
    select * from rider_ride_credits where user_id = p_user and miles >= 0.5
  )
  select 'trail_boss', count(*) filter (where led and riders_tracked >= 2)::numeric from c
  union all select 'tail_gunner', count(*) filter (where swept and riders_tracked >= 2)::numeric from c
  union all select 'crew_rider', count(*) filter (where riders_tracked >= 2)::numeric from c
  union all select 'mile_eater', coalesce(floor(sum(miles)), 0)::numeric from c
  union all select 'trailblazer', t.shared::numeric
  union all select 'mapmaker', t.accurate::numeric
  union all select 'trail_scout', t.rated::numeric;
end;
$$;
revoke execute on function rider_badge_stats(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Give a rider every level they have reached and don't have yet. Returns how many were new.
-- p_quiet skips the push (used for the first fill below, so nobody gets a pile at once).
-- ---------------------------------------------------------------------------
create or replace function award_rider_badges(p_user uuid, p_quiet boolean)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_new int;
  v_top record;
begin
  if p_user is null or not exists (select 1 from profiles where id = p_user) then return 0; end if;
  with earned as (
    insert into rider_badges (user_id, badge, level)
    select p_user, l.badge, l.level
    from badge_levels() l
    join rider_badge_stats(p_user) s on s.badge = l.badge
    where s.value >= l.threshold
    on conflict do nothing
    returning badge, level
  )
  select count(*)::int into v_new from earned;
  if v_new > 0 and not p_quiet then
    select b.badge, b.level into v_top from rider_badges b
    where b.user_id = p_user and b.seen_at is null
    order by b.level desc, b.earned_at desc limit 1;
    perform queue_push(jsonb_build_object('type', 'badge', 'user', p_user, 'badge', v_top.badge, 'level', v_top.level, 'count', v_new));
  end if;
  return v_new;
end;
$$;
revoke execute on function award_rider_badges(uuid, boolean) from public, anon, authenticated;

-- The one-argument form the offroad navigation triggers call.
create or replace function award_rider_badges(p_user uuid)
returns int language sql security definer set search_path = public as $$
  select award_rider_badges(p_user, false);
$$;
revoke execute on function award_rider_badges(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Count an ended ride for everyone who joined it. Runs again when a track arrives late (riders
-- who had no signal upload after the ride ends), so the numbers catch up.
-- ---------------------------------------------------------------------------
create or replace function credit_ride(p_ride uuid, p_quiet boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  m record;
begin
  if not exists (select 1 from rides where id = p_ride and status = 'ended') then return; end if;
  with ridden as (
    select rm.user_id, rider_track_miles(p_ride, rm.user_id) as miles,
           is_ride_leader(p_ride, rm.user_id) as led, rm.role = 'sweep' as swept
    from ride_members rm where rm.ride_id = p_ride and rm.status = 'joined'
  ), tracked as (
    select count(*)::int as n from ridden where miles >= 0.5
  )
  insert into rider_ride_credits (ride_id, user_id, led, swept, miles, riders_tracked, counted_at)
  select p_ride, r.user_id, r.led, r.swept, r.miles, t.n, now() from ridden r, tracked t
  on conflict (ride_id, user_id) do update
    set led = excluded.led, swept = excluded.swept, miles = excluded.miles,
        riders_tracked = excluded.riders_tracked, counted_at = excluded.counted_at;
  for m in select user_id from ride_members where ride_id = p_ride and status = 'joined' loop
    perform award_rider_badges(m.user_id, p_quiet);
  end loop;
exception when others then
  -- Ending a ride or saving a track must never fail because of badges.
  raise warning 'credit_ride: %', sqlerrm;
end;
$$;
revoke execute on function credit_ride(uuid, boolean) from public, anon, authenticated;

create or replace function rides_credit_on_end()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'ended' and old.status is distinct from 'ended' then perform credit_ride(new.id); end if;
  return null;
end;
$$;
drop trigger if exists rides_credit_on_end on rides;
create trigger rides_credit_on_end after update of status on rides
  for each row execute function rides_credit_on_end();

create or replace function ride_tracks_credit_late()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from rides where id = new.ride_id and status = 'ended') then perform credit_ride(new.ride_id); end if;
  return null;
end;
$$;
drop trigger if exists ride_tracks_credit_late on ride_tracks;
create trigger ride_tracks_credit_late after insert or update of points on ride_tracks
  for each row execute function ride_tracks_credit_late();

-- ---------------------------------------------------------------------------
-- For the app.
-- ---------------------------------------------------------------------------
-- The signed-in rider's totals and badges, brought up to date first (so trail badges and anything
-- missed show up the next time they look).
create or replace function my_badges()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'sign in first'; end if;
  perform award_rider_badges(v_me, false);
  return jsonb_build_object(
    'stats', (select coalesce(jsonb_object_agg(badge, value), '{}'::jsonb) from rider_badge_stats(v_me)),
    'badges', (
      select coalesce(jsonb_agg(jsonb_build_object('badge', badge, 'level', level, 'earned_at', earned_at, 'seen', seen_at is not null) order by earned_at), '[]'::jsonb)
      from rider_badges where user_id = v_me
    )
  );
end;
$$;
revoke execute on function my_badges() from public, anon;
grant execute on function my_badges() to authenticated;

-- The rider has seen their new badges.
create or replace function mark_badges_seen()
returns void language sql security definer set search_path = public as $$
  update rider_badges set seen_at = now() where user_id = auth.uid() and seen_at is null;
$$;
revoke execute on function mark_badges_seen() from public, anon;
grant execute on function mark_badges_seen() to authenticated;

-- ---------------------------------------------------------------------------
-- The push. push_batch_account keeps the trial reminders exactly as before.
--   {"type":"badge","user":<uuid>,"badge":"trail_boss","level":2,"count":1}
-- ---------------------------------------------------------------------------
create or replace function badge_push_text(p_badge text, p_level int, p_count int, out title text, out body text)
language sql immutable set search_path = public as $$
  select
    case when p_count > 1 then 'You Earned ' || p_count || ' New Badges'
         else 'New Badge: ' || n.name || ' ' || (array['Bronze', 'Silver', 'Gold'])[p_level] end,
    case when p_count > 1 then 'Including ' || n.name || ' ' || (array['Bronze', 'Silver', 'Gold'])[p_level] || '. See them on the You tab.'
         else n.how || ' See it on the You tab.' end
  from (values
    ('trail_boss', 'Trail Boss', 'For leading rides.'),
    ('tail_gunner', 'Tail Gunner', 'For riding at the rear so nobody gets left behind.'),
    ('crew_rider', 'Crew Rider', 'For riding with a group.'),
    ('mile_eater', 'Mile Eater', 'For the miles you have ridden.'),
    ('trailblazer', 'Trailblazer', 'For sharing trails with every rider.'),
    ('mapmaker', 'Mapmaker', 'Riders rated your trails accurate.'),
    ('trail_scout', 'Trail Scout', 'For rating trails so others know what to expect.')
  ) as n(key, name, how)
  where n.key = p_badge;
$$;

create or replace function push_batch_account(p_event jsonb)
returns table (user_id uuid, token text, platform text, title text, body text, thread_id text, data jsonb)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_user uuid := (p_event ->> 'user')::uuid;
  v_type text := p_event ->> 'type';
  v_stage text := p_event ->> 'stage';
  s notification_settings;
  v_now timestamp;
begin
  if current_user not in ('service_role', 'postgres') then raise exception 'not allowed'; end if;
  if v_type = 'trial' and v_stage is null then return; end if;
  if v_type not in ('trial', 'badge') then return; end if;
  select * into s from notification_settings ns where ns.user_id = v_user;
  if found then
    if not s.account_push then return; end if;
    if s.quiet_hours then
      v_now := now() at time zone coalesce(s.time_zone, 'UTC');
      if in_quiet_window(s.quiet_start, s.quiet_end, (extract(hour from v_now) * 60 + extract(minute from v_now))::int) then
        return;
      end if;
    end if;
  end if;
  if v_type = 'trial' then
    return query
    select t.user_id, t.token, t.platform, x.title, x.body, 'account'::text,
           jsonb_build_object('type', 'trial', 'stage', v_stage, 'url', '/pro')
    from push_tokens t, trial_notice_text(v_stage) x
    where t.user_id = v_user;
  else
    return query
    select t.user_id, t.token, t.platform, x.title, x.body, 'account'::text,
           jsonb_build_object('type', 'badge', 'url', '/badges')
    from push_tokens t,
         badge_push_text(p_event ->> 'badge', coalesce((p_event ->> 'level')::int, 1), coalesce((p_event ->> 'count')::int, 1)) x
    where t.user_id = v_user and x.title is not null;
  end if;
end;
$$;
revoke execute on function push_batch_account(jsonb) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function push_batch_account(jsonb) to service_role;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- First fill: count every ride that has already ended, quietly. Riders see what they have
-- already earned as New on the You tab, without a pile of pushes.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in select id from rides where status = 'ended' loop
    perform credit_ride(r.id, true);
  end loop;
end $$;
