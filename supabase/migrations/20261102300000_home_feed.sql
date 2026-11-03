-- Home feed (2.0 home screen): what friends, riders you follow and your riding groups have been
-- up to, and who gets to see your own activity.
--
-- Adds only: one settings table, five functions (one hands out the trail rule numbers), and trail obstacles (a new shared_trails column,
-- its check, and trail_json returning it). Nothing older changes, so 1.0.x builds keep
-- working, and the 2.0 app shows "Feed starts with the next server update" until this runs.
--
-- Who appears:
--   * A rider's activity reaches a viewer only if the rider's share_with allows it:
--       friends   (default) accepted friends only
--       followers accepted friends, plus riders who follow them (leader_follows)
--       nobody    never
--   * The viewer picks whose posts they want (show_from) and which kinds (kinds).
--   * Blocked either way: never.
-- Never a location: Out Riding posts carry only the rider's own spot words (the same text the
-- Friends screen shows), and only when out_riding_visible already allows it. Ride posts name the
-- ride only when it is public or the viewer was on it.

create table if not exists rider_feed_settings (
  user_id uuid primary key references profiles (id) on delete cascade,
  show_from text not null default 'groups' check (show_from in ('friends', 'follows', 'groups')),
  kinds text[] not null default array['out', 'ride', 'badge', 'trail', 'group']
    check (kinds <@ array['out', 'ride', 'badge', 'trail', 'group']),
  share_with text not null default 'friends' check (share_with in ('friends', 'followers', 'nobody')),
  updated_at timestamptz not null default now()
);
alter table rider_feed_settings enable row level security;
create policy rider_feed_settings_own_read on rider_feed_settings for select to authenticated
  using (user_id = auth.uid());
revoke all on rider_feed_settings from anon, authenticated;
grant select on rider_feed_settings to authenticated;

-- ---------------------------------------------------------------------------
-- My settings (defaults until I change them) and saving them.
-- ---------------------------------------------------------------------------
create or replace function my_feed_settings()
returns table (show_from text, kinds text[], share_with text)
language plpgsql stable security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'sign in first'; end if;
  return query
  select coalesce(s.show_from, 'groups'),
         coalesce(s.kinds, array['out', 'ride', 'badge', 'trail', 'group']),
         coalesce(s.share_with, 'friends')
  from (select 1) one
  left join rider_feed_settings s on s.user_id = v_me;
end;
$$;
revoke execute on function my_feed_settings() from public, anon;
grant execute on function my_feed_settings() to authenticated;

create or replace function set_feed_settings(p_show_from text, p_kinds text[], p_share_with text)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'sign in first'; end if;
  if p_show_from not in ('friends', 'follows', 'groups') then raise exception 'unknown feed choice'; end if;
  if p_share_with not in ('friends', 'followers', 'nobody') then raise exception 'unknown sharing choice'; end if;
  if p_kinds is null or not (p_kinds <@ array['out', 'ride', 'badge', 'trail', 'group']) then
    raise exception 'unknown post kind';
  end if;
  insert into rider_feed_settings (user_id, show_from, kinds, share_with, updated_at)
  values (v_me, p_show_from, (select coalesce(array_agg(distinct k), '{}') from unnest(p_kinds) k), p_share_with, now())
  on conflict (user_id) do update
    set show_from = excluded.show_from, kinds = excluded.kinds, share_with = excluded.share_with, updated_at = now();
end;
$$;
revoke execute on function set_feed_settings(text, text[], text) from public, anon;
grant execute on function set_feed_settings(text, text[], text) to authenticated;

-- ---------------------------------------------------------------------------
-- May p_viewer see p_actor's activity? (actor's share_with, friendship, follow, blocks)
-- ---------------------------------------------------------------------------
create or replace function feed_can_see(p_viewer uuid, p_actor uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_viewer <> p_actor
     and not riders_blocked(p_viewer, p_actor)
     and case coalesce((select share_with from rider_feed_settings where user_id = p_actor), 'friends')
           when 'nobody' then false
           when 'friends' then riders_are_friends(p_viewer, p_actor)
           else riders_are_friends(p_viewer, p_actor)
                or exists (select 1 from leader_follows where follower_id = p_viewer and leader_id = p_actor)
         end;
$$;
revoke execute on function feed_can_see(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The feed, newest first. Last 30 days (Out Riding: live now only).
--   kind   out | ride | badge | trail | group
--   title  ride, trail or group name (null when the ride is private to the viewer)
--   detail kind-specific numbers: miles, riders, badge, level, length_m, ride_id, meet_at
-- ---------------------------------------------------------------------------
create or replace function home_feed(p_limit int default 30)
returns table (
  kind text, actor_id uuid, actor_name text, actor_photo text, at timestamptz,
  title text, detail jsonb, group_id uuid, group_name text
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_from text;
  v_kinds text[];
  v_since timestamptz := now() - interval '30 days';
  v_limit int := least(greatest(coalesce(p_limit, 30), 1), 60);
begin
  if v_me is null then raise exception 'sign in first'; end if;
  select coalesce(s.show_from, 'groups'), coalesce(s.kinds, array['out', 'ride', 'badge', 'trail', 'group'])
    into v_from, v_kinds
  from (select 1) one left join rider_feed_settings s on s.user_id = v_me;

  return query
  with actors as (
    -- Riders whose posts I asked for: friends, plus riders I follow unless I chose friends only.
    select o.id
    from friendships f
    cross join lateral (select case when f.user_lo = v_me then f.user_hi else f.user_lo end as id) o
    where f.status = 'accepted' and v_me in (f.user_lo, f.user_hi)
    union
    select l.leader_id from leader_follows l where l.follower_id = v_me and v_from <> 'friends'
  ),
  seen as (
    select a.id from actors a where feed_can_see(v_me, a.id)
  ),
  items as (
    -- Out riding right now (friends only, the Out Riding rules decide).
    select 'out'::text as kind, r.user_id as actor_id, r.started_at as at, r.spot as title,
           '{}'::jsonb as detail, null::uuid as group_id, null::text as group_name
    from out_riding r
    join seen s on s.id = r.user_id
    where 'out' = any (v_kinds)
      and out_riding_live(r)
      and riders_are_friends(v_me, r.user_id)
      and out_riding_visible(v_me, r.user_id)
    union all
    -- Finished rides.
    select 'ride', c.user_id, coalesce(rd.ended_at, rd.meet_at),
           case when rd.visibility = 'public'
                  or exists (select 1 from ride_members m where m.ride_id = rd.id and m.user_id = v_me and m.status = 'joined')
                then rd.name end,
           jsonb_build_object('miles', c.miles, 'riders', greatest(c.riders_tracked, 1), 'led', c.led),
           null, null
    from rider_ride_credits c
    join seen s on s.id = c.user_id
    join rides rd on rd.id = c.ride_id
    where 'ride' = any (v_kinds) and rd.status = 'ended' and coalesce(rd.ended_at, rd.meet_at) >= v_since
    union all
    -- Badges earned.
    select 'badge', b.user_id, b.earned_at, null,
           jsonb_build_object('badge', b.badge, 'level', b.level), null, null
    from rider_badges b
    join seen s on s.id = b.user_id
    where 'badge' = any (v_kinds) and b.earned_at >= v_since
    union all
    -- Trails shared with every rider.
    select 'trail', t.owner_id, t.created_at, t.name,
           jsonb_build_object('length_m', t.length_m, 'trail_id', t.id), null, null
    from shared_trails t
    join seen s on s.id = t.owner_id
    where 'trail' = any (v_kinds) and t.status = 'public' and t.created_at >= v_since
    union all
    -- Upcoming rides a riding group member invited my group to (I'm on the invite list).
    select 'group', rd.organizer_id, m.created_at, rd.name,
           jsonb_build_object('ride_id', rd.id, 'meet_at', rd.meet_at, 'code', rd.invite_code),
           g.id, g.name
    from ride_members m
    join rides rd on rd.id = m.ride_id
    join lateral (
      select gg.id, gg.name from riding_groups gg
      where is_group_member(gg.id, v_me) and is_group_member(gg.id, rd.organizer_id)
      order by gg.created_at limit 1
    ) g on true
    where v_from = 'groups' and 'group' = any (v_kinds)
      and m.user_id = v_me and rd.organizer_id <> v_me
      and m.status in ('invited', 'joined')
      and rd.status in ('scheduled', 'live') and rd.meet_at >= now() - interval '6 hours'
      and m.created_at >= v_since
      and not riders_blocked(v_me, rd.organizer_id)
  )
  select i.kind, i.actor_id,
         coalesce(nullif(btrim(p.display_name), ''), 'Rider'),
         p.photo_url, i.at, i.title, i.detail, i.group_id, i.group_name
  from items i
  join profiles p on p.id = i.actor_id
  order by i.at desc
  limit v_limit;
end;
$$;
revoke execute on function home_feed(int) from public, anon;
grant execute on function home_feed(int) to authenticated;

-- ---------------------------------------------------------------------------
-- Trail obstacles (2.0): named spots along a shared trail, e.g. "Waterfall Ledge". A new column
-- with a default, so 1.0.x builds that never send it keep sharing as before.
-- ---------------------------------------------------------------------------
alter table shared_trails add column if not exists obstacles jsonb not null default '[]'::jsonb;

create or replace function shared_trail_obstacles_guard()
returns trigger language plpgsql security invoker set search_path = public as $$
declare v_bad int;
begin
  if new.obstacles is null then new.obstacles := '[]'::jsonb; end if;
  if jsonb_typeof(new.obstacles) <> 'array' then raise exception 'obstacles must be a list'; end if;
  if jsonb_array_length(new.obstacles) > 30 then raise exception 'a trail can have up to 30 obstacles'; end if;
  select count(*) into v_bad from jsonb_array_elements(new.obstacles) o
  where jsonb_typeof(o) <> 'object'
     or jsonb_typeof(o -> 'lat') <> 'number' or jsonb_typeof(o -> 'lng') <> 'number'
     or abs((o ->> 'lat')::double precision) > 90 or abs((o ->> 'lng')::double precision) > 180
     or jsonb_typeof(o -> 'name') <> 'string' or length(btrim(o ->> 'name')) not between 1 and 40
     or coalesce(o ->> 'kind', 'obstacle') not in ('obstacle', 'hazard', 'water', 'view');
  if v_bad > 0 then raise exception 'each obstacle needs a spot, a name of 1 to 40 characters and a known kind'; end if;
  -- Keep only the fields the app reads.
  select coalesce(jsonb_agg(jsonb_build_object(
           'lat', (o ->> 'lat')::double precision, 'lng', (o ->> 'lng')::double precision,
           'name', btrim(o ->> 'name'), 'kind', coalesce(o ->> 'kind', 'obstacle'))), '[]'::jsonb)
    into new.obstacles
  from jsonb_array_elements(new.obstacles) o;
  return new;
end;
$$;
drop trigger if exists shared_trails_obstacles_guard on shared_trails;
create trigger shared_trails_obstacles_guard before insert or update of obstacles on shared_trails
  for each row execute function shared_trail_obstacles_guard();

-- trail_json, unchanged from 20261101600000_nav_trails.sql except that it returns obstacles.
create or replace function trail_json(t shared_trails, p_me uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', t.id, 'client_id', case when t.owner_id = p_me then t.client_id end,
    'mine', t.owner_id = p_me,
    'mapper', coalesce(nullif(btrim(p.display_name), ''), 'Rider'),
    'name', t.name, 'description', t.description, 'difficulty', t.difficulty, 'vehicles', to_jsonb(t.vehicles),
    'surface', t.surface, 'season', t.season, 'max_width_in', t.max_width_in, 'one_way', t.one_way,
    'route', t.route, 'length_m', t.length_m, 'elevation_gain_m', t.elevation_gain_m, 'high_point_m', t.high_point_m,
    'start', jsonb_build_object('lat', t.start_lat, 'lng', t.start_lng),
    'photos', to_jsonb(t.photos), 'obstacles', t.obstacles, 'status', t.status,
    'hidden_at', case when t.owner_id = p_me or is_admin() then t.hidden_at end,
    'hidden_reason', case when t.owner_id = p_me or is_admin() then t.hidden_reason end,
    'hidden_seen', case when t.owner_id = p_me then t.hidden_seen_at is not null end,
    'rating_count', t.rating_count, 'good_count', t.good_count, 'bad_count', t.bad_count,
    'average', case when t.rating_count > 0 then round(t.rating_sum::numeric / t.rating_count, 1) end,
    'quality_count', t.quality_count,
    'quality', case when t.quality_count > 0 then round(t.quality_sum::numeric / t.quality_count, 1) end,
    'my_score', (select r.score from trail_ratings r where r.trail_id = t.id and r.user_id = p_me),
    'my_quality', (select r.quality from trail_ratings r where r.trail_id = t.id and r.user_id = p_me),
    'created_at', t.created_at, 'updated_at', t.updated_at)
  from (select 1) one left join profiles p on p.id = t.owner_id
$$;
revoke execute on function trail_json(shared_trails, uuid) from public, anon, authenticated;

-- The rule for when a shared trail comes down, for the "How Custom Trails Work" sheet in Map Mode.
-- trail_rules itself stays closed; this hands out only the two numbers riders are told anyway.
create or replace function trail_rules_public()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('min_bad', min_bad, 'bad_share', bad_share) from trail_rules where id),
    jsonb_build_object('min_bad', 3, 'bad_share', 0.5))
$$;
revoke execute on function trail_rules_public() from public, anon;
grant execute on function trail_rules_public() to authenticated;
