-- Badge leaderboard (Chris, 2026-11-03: "can we show a leader board for the badges. Filter by
-- country and state").
--
-- Riders are ranked by the badge levels they earned by riding (the same count as their rank in
-- app/src/core/badges.ts: the best level of each earned badge, 21 in all; Brand Ambassador and
-- OnMyLead Founder don't count). Ties go to more Gold, then more Silver, then whoever reached
-- their total first.
--
-- Where a rider rides from: profiles had only a free-text `region` nobody fills in, so riders now
-- pick a country and, for the United States, Canada, Mexico and Australia, a state or province
-- (or the app fills it once from their location; only the two codes are saved, never a place).
-- It is optional, and it is kept in its own table that only the rider can read. Other riders see
-- it only beside a rider's name on the leaderboard.
--
-- Privacy:
--   * Signed-in riders only, like badges beside names today.
--   * A rider can take themselves off with Show Me on the Leaderboard. Until they choose, riders
--     who share their activity with Nobody (Feed settings) stay off, everyone else is listed.
--   * Riders blocked either way never see each other. Suspended accounts are left off.
--   * Name, picture, badges and the area only. Never a location, a ride or anything else.
--
-- Additive only: one new table and new functions. Older app builds don't call any of them.

-- ---------------------------------------------------------------------------
-- Where each rider rides from, and whether they want to be listed.
--   country  ISO 3166-1 alpha-2 (US)
--   state    the ISO 3166-2 code after the dash (TX for US-TX, ON for CA-ON, JAL for MX-JAL)
--   shown    true / false once the rider chooses; null follows the default above
-- ---------------------------------------------------------------------------
create table if not exists rider_home_areas (
  user_id uuid primary key references profiles (id) on delete cascade,
  country text check (country ~ '^[A-Z]{2}$'),
  state text check (state ~ '^[A-Z0-9]{1,3}$'),
  shown boolean,
  updated_at timestamptz not null default now(),
  constraint rider_home_areas_state_needs_country check (state is null or country is not null)
);
create index if not exists rider_home_areas_country on rider_home_areas (country, state);
alter table rider_home_areas enable row level security;
create policy rider_home_areas_own_read on rider_home_areas for select to authenticated
  using (user_id = auth.uid());
revoke all on rider_home_areas from anon, authenticated;
grant select on rider_home_areas to authenticated;

-- Whether a rider is on the leaderboard at all (before blocks, which depend on who is looking).
create or replace function leaderboard_listed(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
           (select shown from rider_home_areas where user_id = p_user),
           coalesce((select share_with from rider_feed_settings where user_id = p_user), 'friends') <> 'nobody')
     and not exists (select 1 from auth.users u where u.id = p_user and u.banned_until > now());
$$;
revoke execute on function leaderboard_listed(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The signed-in rider's own area and choice.
--   {"country":"US","state":"TX","shown":true,"chosen":false}
-- chosen: false while shown is still the default.
-- ---------------------------------------------------------------------------
create or replace function my_leaderboard_settings()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  a rider_home_areas;
begin
  if v_me is null then raise exception 'sign in first'; end if;
  select * into a from rider_home_areas where user_id = v_me;
  return jsonb_build_object(
    'country', a.country, 'state', a.state,
    'shown', coalesce(a.shown, coalesce((select share_with from rider_feed_settings where user_id = v_me), 'friends') <> 'nobody'),
    'chosen', a.shown is not null);
end;
$$;
revoke execute on function my_leaderboard_settings() from public, anon;
grant execute on function my_leaderboard_settings() to authenticated;

-- Save the rider's area and/or choice. p_area false leaves the area as it is (just the switch);
-- p_shown null leaves the choice as it is. An empty country clears both codes.
create or replace function set_leaderboard_settings(p_country text, p_state text, p_shown boolean, p_area boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_country text := nullif(upper(btrim(coalesce(p_country, ''))), '');
  v_state text := nullif(upper(btrim(coalesce(p_state, ''))), '');
begin
  if v_me is null then raise exception 'sign in first'; end if;
  if not exists (select 1 from profiles where id = v_me) then raise exception 'rider not found'; end if;
  if p_area then
    if v_country is not null and v_country !~ '^[A-Z]{2}$' then raise exception 'pick a country from the list'; end if;
    if v_state is not null and (v_country is null or v_state !~ '^[A-Z0-9]{1,3}$') then raise exception 'pick a state from the list'; end if;
    insert into rider_home_areas (user_id, country, state, shown)
    values (v_me, v_country, v_state, p_shown)
    on conflict (user_id) do update
      set country = excluded.country, state = excluded.state,
          shown = coalesce(p_shown, rider_home_areas.shown), updated_at = now();
  else
    insert into rider_home_areas (user_id, shown) values (v_me, p_shown)
    on conflict (user_id) do update
      set shown = coalesce(p_shown, rider_home_areas.shown), updated_at = now();
  end if;
  return my_leaderboard_settings();
end;
$$;
revoke execute on function set_leaderboard_settings(text, text, boolean, boolean) from public, anon;
grant execute on function set_leaderboard_settings(text, text, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Every listed rider's standing (ignores who is looking; callers apply blocks).
-- ---------------------------------------------------------------------------
create or replace function leaderboard_standings()
returns table (user_id uuid, levels int, gold int, silver int, bronze int, reached_at timestamptz, country text, state text)
language sql stable security definer set search_path = public as $$
  with best as (
    select b.user_id, b.badge, max(b.level) as level, max(b.earned_at) as at
    from rider_badges b
    where b.badge not in (select honor_badges())
    group by b.user_id, b.badge
  )
  select s.user_id, sum(s.level)::int, count(*) filter (where s.level = 3)::int,
         count(*) filter (where s.level = 2)::int, count(*) filter (where s.level = 1)::int,
         max(s.at), a.country, a.state
  from best s
  left join rider_home_areas a on a.user_id = s.user_id
  where leaderboard_listed(s.user_id)
  group by s.user_id, a.country, a.state;
$$;
revoke execute on function leaderboard_standings() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The leaderboard. p_country / p_state narrow it (null: everywhere / the whole country).
--   {"total": 42,
--    "rows": [{"place":1,"user_id":..,"name":"Dusty","levels":12,"gold":2,"silver":3,"bronze":2,
--              "country":"US","state":"TX","badges":[{"badge":"trail_boss","level":3},..],"me":false}],
--    "me": {"place": 7, ...same keys} or null when you're not on this board}
-- ---------------------------------------------------------------------------
create or replace function badge_leaderboard(p_country text default null, p_state text default null, p_limit int default 50)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_country text := nullif(upper(btrim(coalesce(p_country, ''))), '');
  v_state text := nullif(upper(btrim(coalesce(p_state, ''))), '');
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_out jsonb;
begin
  if v_me is null then raise exception 'sign in first'; end if;
  if v_state is not null and v_country is null then raise exception 'pick a country first'; end if;
  with board as (
    select s.*, row_number() over (order by s.levels desc, s.gold desc, s.silver desc, s.reached_at asc, s.user_id) as place
    from leaderboard_standings() s
    where (v_country is null or s.country = v_country)
      and (v_state is null or s.state = v_state)
      and (s.user_id = v_me or not riders_blocked(v_me, s.user_id))
  ),
  shown as (
    select b.*, jsonb_build_object(
      'place', b.place, 'user_id', b.user_id,
      'name', coalesce(nullif(btrim(p.display_name), ''), 'Rider'),
      'levels', b.levels, 'gold', b.gold, 'silver', b.silver, 'bronze', b.bronze,
      'country', b.country, 'state', b.state, 'me', b.user_id = v_me,
      'badges', (
        select coalesce(jsonb_agg(jsonb_build_object('badge', x.badge, 'level', x.level) order by x.badge), '[]'::jsonb)
        from (select r.badge, max(r.level) as level from rider_badges r where r.user_id = b.user_id group by r.badge) x)
    ) as row
    from board b join profiles p on p.id = b.user_id
  )
  select jsonb_build_object(
    'total', (select count(*) from board),
    'rows', coalesce((select jsonb_agg(row order by place) from shown where place <= v_limit), '[]'::jsonb),
    'me', (select row from shown where user_id = v_me))
  into v_out;
  return v_out;
end;
$$;
revoke execute on function badge_leaderboard(text, text, int) from public, anon;
grant execute on function badge_leaderboard(text, text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- The countries and states that have riders on the leaderboard, for the filter.
--   [{"country":"US","riders":30,"states":[{"state":"TX","riders":12},..]},..]
-- Riders who haven't picked a country count only toward Everywhere.
-- ---------------------------------------------------------------------------
create or replace function badge_leaderboard_areas()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'sign in first'; end if;
  return (
    with s as (
      select country, state from leaderboard_standings() s
      where country is not null and (s.user_id = v_me or not riders_blocked(v_me, s.user_id))
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'country', c.country, 'riders', c.riders,
      'states', (
        select coalesce(jsonb_agg(jsonb_build_object('state', t.state, 'riders', t.n) order by t.n desc, t.state), '[]'::jsonb)
        from (select state, count(*) as n from s where s.country = c.country and s.state is not null group by state) t)
    ) order by c.riders desc, c.country), '[]'::jsonb)
    from (select country, count(*) as riders from s group by country) c
  );
end;
$$;
revoke execute on function badge_leaderboard_areas() from public, anon;
grant execute on function badge_leaderboard_areas() to authenticated;
