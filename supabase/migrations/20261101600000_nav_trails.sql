-- Navigation Mode: trails riders map themselves and choose to share with everyone.
--
-- A trail a rider records in Navigation Mode stays on their phone. Only when they tap Share with
-- Everyone does a copy come here (shared_trails), with the first and last stretch already cut off on
-- the phone so it never shows where they live. Riders who travel a shared trail rate how accurate it
-- is (trail_ratings, 1 to 5 stars). When enough different riders rate it inaccurate (trail_rules,
-- set on the Admin Dashboard), it is hidden from everyone but its mapper, who keeps it on their phone
-- and in their account and gets a notification. The owner can bring it back from the Trails page.
-- Photos go in the public trail-photos bucket, in the uploader's own folder.
--
-- Additive only: two new tables, one settings row table, functions, a bucket, and a new event
-- type in push_batch_account (older events are unchanged). Nothing existing is renamed or dropped.

-- ---------------------------------------------------------------------------
-- 1. Shared trails
-- ---------------------------------------------------------------------------
create table if not exists shared_trails (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  -- The trail's id on the mapper's phone, so sharing twice updates instead of duplicating.
  client_id text not null check (length(client_id) between 1 and 64),
  name text not null check (length(btrim(name)) between 2 and 80),
  description text check (description is null or length(description) <= 1000),
  difficulty text not null check (difficulty in ('easy', 'moderate', 'hard', 'extreme')),
  vehicles text[] not null check (
    cardinality(vehicles) between 1 and 6
    and vehicles <@ array['stock_4x4', 'built_4x4', 'sxs_utv', 'atv', 'dirt_bike', 'adventure_bike']
  ),
  surface text check (surface in ('dirt', 'gravel', 'rock', 'sand', 'mud', 'snow', 'paved', 'mixed')),
  season text check (season in ('year_round', 'spring_fall', 'summer', 'winter', 'dry_weather')),
  max_width_in int check (max_width_in between 30 and 120),
  one_way boolean not null default false,
  -- GeoJSON LineString of [lng, lat] pairs, already trimmed at both ends on the phone.
  route jsonb not null,
  length_m int not null check (length_m between 50 and 2000000),
  elevation_gain_m int check (elevation_gain_m between 0 and 20000),
  high_point_m int check (high_point_m between -500 and 9000),
  min_lat double precision not null,
  min_lng double precision not null,
  max_lat double precision not null,
  max_lng double precision not null,
  start_lat double precision not null,
  start_lng double precision not null,
  photos text[] not null default '{}' check (cardinality(photos) <= 6),
  -- public: everyone sees it. hidden: riders rated it inaccurate. removed: the admin took it down.
  status text not null default 'public' check (status in ('public', 'hidden', 'removed')),
  hidden_at timestamptz,
  hidden_reason text check (hidden_reason in ('ratings', 'admin')),
  -- When the mapper saw the notice that it was hidden (the app shows it once).
  hidden_seen_at timestamptz,
  -- When the admin last put it back: only ratings after that count toward hiding it again.
  restored_at timestamptz,
  rating_count int not null default 0,
  rating_sum int not null default 0,
  good_count int not null default 0,
  bad_count int not null default 0,
  -- How good a ride it is (1 to 5 stars), separate from how accurate the line is.
  quality_count int not null default 0,
  quality_sum int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, client_id)
);
create index if not exists shared_trails_area on shared_trails (status, min_lat, max_lat, min_lng, max_lng);
create index if not exists shared_trails_owner on shared_trails (owner_id);

alter table shared_trails enable row level security;
revoke all on shared_trails from anon, authenticated;
grant select, insert, update, delete on shared_trails to authenticated;

drop policy if exists shared_trails_read on shared_trails;
create policy shared_trails_read on shared_trails for select to authenticated
  using (status = 'public' or owner_id = auth.uid() or is_admin());
drop policy if exists shared_trails_insert on shared_trails;
create policy shared_trails_insert on shared_trails for insert to authenticated
  with check (owner_id = auth.uid());
drop policy if exists shared_trails_update on shared_trails;
create policy shared_trails_update on shared_trails for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
-- Stop Sharing deletes the public copy; the trail stays on the phone.
drop policy if exists shared_trails_delete on shared_trails;
create policy shared_trails_delete on shared_trails for delete to authenticated
  using (owner_id = auth.uid());

-- Checks the line, works out its box and start, and keeps riders from changing what only the
-- ratings or the admin decide (status, counts). Runs for every insert and update.
-- Security invoker on purpose: current_user is then the caller (authenticated for riders, the
-- owner inside the security definer rating and admin functions below).
-- Pro: recording (app only), sharing a trail and riding a trail as a group ride route.
-- Like the other gates, these only refuse when the account lacks Pro; the admin can change the
-- plan per feature in Admin > Settings.
insert into feature_plans (feature, min_plan, free_monthly_allowance) values
  ('record_trails', 'pro', null),
  ('share_trails', 'pro', null),
  ('trail_rides', 'pro', null)
on conflict (feature) do nothing;

-- The caller's own Pro check, callable from security-invoker triggers.
create or replace function require_my_feature(p_feature text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  perform pro_required(auth.uid(), p_feature);
end;
$$;
revoke execute on function require_my_feature(text) from public, anon;
grant execute on function require_my_feature(text) to authenticated;

create or replace function shared_trail_guard()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  v_n int;
  v_bad int;
  v_trusted boolean := current_user in ('postgres', 'service_role') or coalesce(current_setting('onmylead.trail_system', true), '') = 'on';
begin
  if jsonb_typeof(new.route) <> 'object' or new.route ->> 'type' <> 'LineString'
     or jsonb_typeof(new.route -> 'coordinates') <> 'array' then
    raise exception 'route must be a GeoJSON LineString';
  end if;
  v_n := jsonb_array_length(new.route -> 'coordinates');
  if v_n not between 2 and 3000 then raise exception 'route needs 2 to 3000 points'; end if;
  select count(*) into v_bad from jsonb_array_elements(new.route -> 'coordinates') c
  where jsonb_typeof(c) <> 'array' or jsonb_array_length(c) < 2
     or jsonb_typeof(c -> 0) <> 'number' or jsonb_typeof(c -> 1) <> 'number'
     or abs((c ->> 0)::double precision) > 180 or abs((c ->> 1)::double precision) > 90;
  if v_bad > 0 then raise exception 'route has a point that is not [lng, lat]'; end if;
  select min((c ->> 1)::double precision), min((c ->> 0)::double precision),
         max((c ->> 1)::double precision), max((c ->> 0)::double precision)
    into new.min_lat, new.min_lng, new.max_lat, new.max_lng
  from jsonb_array_elements(new.route -> 'coordinates') c;
  new.start_lat := (new.route -> 'coordinates' -> 0 ->> 1)::double precision;
  new.start_lng := (new.route -> 'coordinates' -> 0 ->> 0)::double precision;
  new.name := btrim(new.name);
  new.description := nullif(btrim(coalesce(new.description, '')), '');
  if exists (select 1 from unnest(new.photos) p where p !~ '^https://') then
    raise exception 'photos must be https links';
  end if;
  -- Sharing a new trail needs Pro. Re-saving one already shared (the app upserts) does not, so a
  -- rider whose Pro ends can still fix or take down what they shared.
  if tg_op = 'INSERT' and not v_trusted
     and not exists (select 1 from shared_trails x where x.owner_id = new.owner_id and x.client_id = new.client_id) then
    perform require_my_feature('share_trails');
  end if;
  new.updated_at := now();

  if tg_op = 'INSERT' then
    if not v_trusted then
      new.status := 'public';
      new.hidden_at := null;
      new.hidden_reason := null;
      new.hidden_seen_at := null;
      new.restored_at := null;
      new.rating_count := 0;
      new.rating_sum := 0;
      new.good_count := 0;
      new.bad_count := 0;
      new.quality_count := 0;
      new.quality_sum := 0;
      new.created_at := now();
    end if;
  elsif not v_trusted then
    -- Riders edit the details; status and the rating counts belong to the ratings and the admin.
    new.owner_id := old.owner_id;
    new.client_id := old.client_id;
    new.status := old.status;
    new.hidden_at := old.hidden_at;
    new.hidden_reason := old.hidden_reason;
    new.restored_at := old.restored_at;
    new.rating_count := old.rating_count;
    new.rating_sum := old.rating_sum;
    new.good_count := old.good_count;
    new.bad_count := old.bad_count;
    new.quality_count := old.quality_count;
    new.quality_sum := old.quality_sum;
    new.created_at := old.created_at;
    -- The mapper may only mark the hidden notice as seen.
    if new.hidden_seen_at is distinct from old.hidden_seen_at and old.status = 'public' then
      new.hidden_seen_at := old.hidden_seen_at;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists shared_trails_guard on shared_trails;
create trigger shared_trails_guard before insert or update on shared_trails
  for each row execute function shared_trail_guard();

-- ---------------------------------------------------------------------------
-- 2. When a trail comes down: the rule the admin sets
-- ---------------------------------------------------------------------------
create table if not exists trail_rules (
  id boolean primary key default true check (id),
  -- At least this many different riders rated it 1 or 2 stars...
  min_bad int not null default 3 check (min_bad between 2 and 50),
  -- ...and they are at least this share of everyone who rated it.
  bad_share numeric not null default 0.5 check (bad_share between 0.2 and 1),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into trail_rules (id) values (true) on conflict (id) do nothing;
alter table trail_rules enable row level security;
revoke all on trail_rules from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Accuracy ratings
-- ---------------------------------------------------------------------------
create table if not exists trail_ratings (
  trail_id uuid not null references shared_trails (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- 1 to 5 stars for how well the line matches the trail on the ground (riders who rode it).
  -- 4-5 accurate, 1-2 not. Null when the rider only rated the quality.
  score smallint check (score between 1 and 5),
  -- How good the trail is to ride, 1 to 5 stars. Null when only the accuracy was rated.
  quality smallint check (quality between 1 and 5),
  note text check (note is null or length(note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (trail_id, user_id),
  check (score is not null or quality is not null)
);
create index if not exists trail_ratings_user on trail_ratings (user_id);
alter table trail_ratings enable row level security;
revoke all on trail_ratings from anon, authenticated;
grant select on trail_ratings to authenticated;
-- Riders see their own ratings; the mapper sees the ratings on their trails (notes help fix it).
drop policy if exists trail_ratings_read on trail_ratings;
create policy trail_ratings_read on trail_ratings for select to authenticated using (
  user_id = auth.uid() or is_admin()
  or exists (select 1 from shared_trails t where t.id = trail_id and t.owner_id = auth.uid())
);

-- Badges (migration 20261101500000_rider_badges.sql), when that migration is there.
create or replace function trail_badges(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is not null and to_regprocedure('award_rider_badges(uuid)') is not null then
    execute 'select award_rider_badges($1)' using p_user;
  end if;
exception when others then
  raise warning 'trail_badges: %', sqlerrm;
end;
$$;
revoke execute on function trail_badges(uuid) from public, anon, authenticated;

-- Counts the ratings again and hides the trail when the rule says so. Returns the new status.
create or replace function trail_recount(p_trail uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  t shared_trails;
  r trail_rules;
  v_count int;
  v_bad int;
begin
  select * into t from shared_trails where id = p_trail for update;
  if not found then return null; end if;
  select * into r from trail_rules where id;
  perform set_config('onmylead.trail_system', 'on', true);
  update shared_trails s set
    rating_count = x.n, rating_sum = x.total, good_count = x.good, bad_count = x.bad,
    quality_count = x.qn, quality_sum = x.qtotal
  from (
    select count(score)::int as n, coalesce(sum(score), 0)::int as total,
           count(*) filter (where score >= 4)::int as good, count(*) filter (where score <= 2)::int as bad,
           count(quality)::int as qn, coalesce(sum(quality), 0)::int as qtotal
    from trail_ratings where trail_id = p_trail
  ) x
  where s.id = p_trail;

  if t.status = 'public' then
    -- Only ratings since the admin last restored it count toward hiding it again.
    select count(score), count(*) filter (where score <= 2) into v_count, v_bad
    from trail_ratings where trail_id = p_trail and updated_at > coalesce(t.restored_at, '-infinity');
    if v_bad >= coalesce(r.min_bad, 3) and v_bad >= ceil(coalesce(r.bad_share, 0.5) * v_count) then
      update shared_trails set status = 'hidden', hidden_at = now(), hidden_reason = 'ratings', hidden_seen_at = null
      where id = p_trail;
      perform queue_push(jsonb_build_object('type', 'trail_hidden', 'user', t.owner_id, 'trail', p_trail, 'name', t.name, 'reason', 'ratings'));
      perform trail_badges(t.owner_id);
      perform set_config('onmylead.trail_system', '', true);
      return 'hidden';
    end if;
  end if;
  perform set_config('onmylead.trail_system', '', true);
  return t.status;
end;
$$;
revoke execute on function trail_recount(uuid) from public, anon, authenticated;

-- Rate a public trail you didn't map: accuracy (p_score, for riders who rode it) and/or quality
-- (p_quality), at least one. Rating again
-- replaces your earlier rating. Returns {"status": <trail status now>, "rating_count": n, "average": x}.
create or replace function rate_trail(p_trail uuid, p_score int default null, p_note text default null, p_quality int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  t shared_trails;
  v_status text;
begin
  if v_me is null then raise exception 'sign in to rate trails' using errcode = '42501'; end if;
  if p_score is null and p_quality is null then raise exception 'rate the accuracy or the quality'; end if;
  if p_score is not null and p_score not between 1 and 5 then raise exception 'rate from 1 to 5 stars'; end if;
  if p_quality is not null and p_quality not between 1 and 5 then raise exception 'rate quality from 1 to 5 stars'; end if;
  select * into t from shared_trails where id = p_trail;
  if not found or t.status <> 'public' then raise exception 'that trail is not public'; end if;
  if t.owner_id = v_me then raise exception 'you can''t rate a trail you mapped'; end if;
  insert into trail_ratings (trail_id, user_id, score, quality, note)
  values (p_trail, v_me, p_score, p_quality, nullif(btrim(coalesce(p_note, '')), ''))
  on conflict (trail_id, user_id) do update
    -- A rating that leaves one part out keeps that part of the rider's earlier rating.
    set score = coalesce(excluded.score, trail_ratings.score), quality = coalesce(excluded.quality, trail_ratings.quality),
        note = coalesce(excluded.note, trail_ratings.note), updated_at = now();
  v_status := trail_recount(p_trail);
  perform trail_badges(v_me);
  perform trail_badges(t.owner_id);
  select * into t from shared_trails where id = p_trail;
  return jsonb_build_object('status', v_status, 'rating_count', t.rating_count,
    'average', case when t.rating_count > 0 then round(t.rating_sum::numeric / t.rating_count, 1) end);
end;
$$;
revoke execute on function rate_trail(uuid, int, text, int) from public, anon;
grant execute on function rate_trail(uuid, int, text, int) to authenticated;

-- Badges when a trail is shared, changed or taken down.
create or replace function shared_trail_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform trail_badges(coalesce(new.owner_id, old.owner_id));
  return null;
end;
$$;
drop trigger if exists shared_trails_after on shared_trails;
create trigger shared_trails_after after insert or delete or update of status on shared_trails
  for each row execute function shared_trail_after();

-- ---------------------------------------------------------------------------
-- 4. Reading trails
-- ---------------------------------------------------------------------------
-- What the map and lists show for one trail. The mapper is shown by ride name only.
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
    'photos', to_jsonb(t.photos), 'status', t.status,
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

-- Public trails crossing the map's box (plus your own, whatever their status), up to p_limit.
create or replace function trails_in_area(p_min_lat double precision, p_min_lng double precision,
  p_max_lat double precision, p_max_lng double precision, p_limit int default 150)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(trail_json(t, auth.uid()) order by t.rating_count desc, t.created_at desc), '[]'::jsonb)
  from (
    select * from shared_trails s
    where auth.uid() is not null
      and (s.status = 'public' or s.owner_id = auth.uid())
      and s.max_lat >= p_min_lat and s.min_lat <= p_max_lat
      and s.max_lng >= p_min_lng and s.min_lng <= p_max_lng
    order by s.rating_count desc, s.created_at desc
    limit least(greatest(coalesce(p_limit, 150), 1), 300)
  ) t
$$;
revoke execute on function trails_in_area(double precision, double precision, double precision, double precision, int) from public, anon;
grant execute on function trails_in_area(double precision, double precision, double precision, double precision, int) to authenticated;

-- One trail: public, or yours.
create or replace function trail_detail(p_trail uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select trail_json(t, auth.uid()) from shared_trails t
  where t.id = p_trail and auth.uid() is not null and (t.status = 'public' or t.owner_id = auth.uid() or is_admin())
$$;
revoke execute on function trail_detail(uuid) from public, anon;
grant execute on function trail_detail(uuid) to authenticated;

-- Your shared trails, so the phone can show which are public and which were hidden.
create or replace function my_shared_trails()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(trail_json(t, auth.uid()) - 'route' order by t.created_at desc), '[]'::jsonb)
  from shared_trails t where t.owner_id = auth.uid()
$$;
revoke execute on function my_shared_trails() from public, anon;
grant execute on function my_shared_trails() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Admin Dashboard: Trails page
-- ---------------------------------------------------------------------------
create or replace function admin_trails(p_status text default 'all', p_search text default '', p_page int default 1, p_size int default 50)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_rows jsonb;
  v_total int;
  v_q text := '%' || coalesce(btrim(p_search), '') || '%';
begin
  perform require_admin();
  if p_status not in ('all', 'public', 'hidden', 'removed') then raise exception 'bad status filter'; end if;
  select count(*) into v_total from shared_trails t left join profiles p on p.id = t.owner_id
  where (p_status = 'all' or t.status = p_status) and (t.name ilike v_q or coalesce(p.display_name, '') ilike v_q);
  select coalesce(jsonb_agg(x.j order by x.created_at desc), '[]'::jsonb) into v_rows from (
    select (trail_json(t, null) - 'route') || jsonb_build_object('owner_id', t.owner_id, 'owner_email', u.email, 'restored_at', t.restored_at,
             'notes', (select coalesce(jsonb_agg(jsonb_build_object('score', r.score, 'note', r.note, 'at', r.updated_at) order by r.updated_at desc), '[]'::jsonb)
                       from trail_ratings r where r.trail_id = t.id and r.note is not null)) as j,
           t.created_at
    from shared_trails t
    left join profiles p on p.id = t.owner_id
    left join auth.users u on u.id = t.owner_id
    where (p_status = 'all' or t.status = p_status) and (t.name ilike v_q or coalesce(p.display_name, '') ilike v_q)
    order by t.created_at desc
    limit least(greatest(coalesce(p_size, 50), 1), 200) offset (greatest(coalesce(p_page, 1), 1) - 1) * least(greatest(coalesce(p_size, 50), 1), 200)
  ) x;
  return jsonb_build_object(
    'total', v_total, 'rows', v_rows,
    'counts', (select jsonb_build_object(
      'public', count(*) filter (where status = 'public'),
      'hidden', count(*) filter (where status = 'hidden'),
      'removed', count(*) filter (where status = 'removed')) from shared_trails),
    'rules', (select jsonb_build_object('min_bad', min_bad, 'bad_share', bad_share, 'updated_at', updated_at) from trail_rules where id));
end;
$$;
revoke execute on function admin_trails(text, text, int, int) from public, anon;
grant execute on function admin_trails(text, text, int, int) to authenticated;

-- Put a trail back up, hide it, or take it down. The mapper is told when it comes down.
create or replace function admin_set_trail_status(p_trail uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare
  t shared_trails;
begin
  perform require_admin();
  if p_status not in ('public', 'hidden', 'removed') then raise exception 'status must be public, hidden or removed'; end if;
  select * into t from shared_trails where id = p_trail;
  if not found then raise exception 'no such trail'; end if;
  if t.status = p_status then return; end if;
  perform set_config('onmylead.trail_system', 'on', true);
  update shared_trails set
    status = p_status,
    hidden_at = case when p_status = 'public' then null else now() end,
    hidden_reason = case when p_status = 'public' then null else 'admin' end,
    hidden_seen_at = null,
    restored_at = case when p_status = 'public' then now() else restored_at end
  where id = p_trail;
  perform set_config('onmylead.trail_system', '', true);
  perform log_admin_action('trail.' || p_status, 'trail', p_trail::text,
    jsonb_build_object('status', t.status, 'name', t.name), jsonb_build_object('status', p_status));
  if p_status <> 'public' then
    perform queue_push(jsonb_build_object('type', 'trail_hidden', 'user', t.owner_id, 'trail', p_trail, 'name', t.name, 'reason', 'admin'));
  end if;
end;
$$;
revoke execute on function admin_set_trail_status(uuid, text) from public, anon;
grant execute on function admin_set_trail_status(uuid, text) to authenticated;

create or replace function admin_set_trail_rules(p_min_bad int, p_bad_share numeric)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb;
begin
  perform require_admin();
  if p_min_bad is null or p_min_bad not between 2 and 50 then raise exception 'min_bad must be 2 to 50 riders'; end if;
  if p_bad_share is null or p_bad_share not between 0.2 and 1 then raise exception 'bad_share must be between 0.2 and 1'; end if;
  select jsonb_build_object('min_bad', min_bad, 'bad_share', bad_share) into v_before from trail_rules where id;
  update trail_rules set min_bad = p_min_bad, bad_share = p_bad_share, updated_at = now(), updated_by = auth.uid() where id;
  perform log_admin_action('trail.rules', 'setting', 'trail_rules', v_before,
    jsonb_build_object('min_bad', p_min_bad, 'bad_share', p_bad_share));
end;
$$;
revoke execute on function admin_set_trail_rules(int, numeric) from public, anon;
grant execute on function admin_set_trail_rules(int, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. "Your trail was hidden" push (the notify-ride-message edge function delivers it).
-- Same as migration 20261101500000_rider_badges.sql (trial reminders and badges), plus the
-- trail_hidden event:
--   {"type":"trail_hidden","user":<uuid>,"trail":<uuid>,"name":<text>,"reason":"ratings"|"admin"}
-- ---------------------------------------------------------------------------
create or replace function push_batch_account(p_event jsonb)
returns table (user_id uuid, token text, platform text, title text, body text, thread_id text, data jsonb)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_user uuid := (p_event ->> 'user')::uuid;
  v_stage text := p_event ->> 'stage';
  v_type text := p_event ->> 'type';
  s notification_settings;
  v_now timestamp;
begin
  if current_user not in ('service_role', 'postgres') then raise exception 'not allowed'; end if;
  if v_type = 'trial' and v_stage is null then return; end if;
  if v_type not in ('trial', 'badge', 'trail_hidden') then return; end if;
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
  if v_type = 'trail_hidden' then
    return query
    select t.user_id, t.token, t.platform,
           'Your Trail Is Hidden'::text,
           case when p_event ->> 'reason' = 'admin'
             then format('“%s” was taken off the public map. It’s still saved on your phone.', p_event ->> 'name')
             else format('Riders rated “%s” inaccurate, so it’s hidden from the public map. It’s still saved on your phone.', p_event ->> 'name')
           end,
           'account'::text,
           jsonb_build_object('type', 'trail_hidden', 'trailId', p_event ->> 'trail', 'url', '/nav/trails')
    from push_tokens t
    where t.user_id = v_user;
    return;
  end if;
  if v_type = 'badge' then
    return query
    select t.user_id, t.token, t.platform, x.title, x.body, 'account'::text,
           jsonb_build_object('type', 'badge', 'url', '/badges')
    from push_tokens t,
         badge_push_text(p_event ->> 'badge', coalesce((p_event ->> 'level')::int, 1), coalesce((p_event ->> 'count')::int, 1)) x
    where t.user_id = v_user and x.title is not null;
    return;
  end if;
  return query
  select t.user_id, t.token, t.platform, x.title, x.body, 'account'::text,
         jsonb_build_object('type', 'trial', 'stage', v_stage, 'url', '/pro')
  from push_tokens t, trial_notice_text(v_stage) x
  where t.user_id = v_user;
end;
$$;
revoke execute on function push_batch_account(jsonb) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function push_batch_account(jsonb) to service_role;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Trail photos bucket: public read at unguessable paths, writes only into your own folder
-- (trail-photos/<auth.uid()>/<file>). Skipped on plain Postgres (tests).
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'storage schema not found; skipping trail-photos bucket';
    return;
  end if;

  insert into storage.buckets (id, name, public)
  values ('trail-photos', 'trail-photos', true)
  on conflict (id) do update set public = true;

  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit') then
    execute $q$update storage.buckets set file_size_limit = 10485760 where id = 'trail-photos'$q$;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    execute $q$update storage.buckets
               set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
               where id = 'trail-photos'$q$;
  end if;

  execute 'drop policy if exists trail_photos_owner_read on storage.objects';
  execute 'drop policy if exists trail_photos_owner_insert on storage.objects';
  execute 'drop policy if exists trail_photos_owner_update on storage.objects';
  execute 'drop policy if exists trail_photos_owner_delete on storage.objects';

  execute $p$create policy trail_photos_owner_read on storage.objects for select to authenticated
    using (bucket_id = 'trail-photos' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy trail_photos_owner_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'trail-photos' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy trail_photos_owner_update on storage.objects for update to authenticated
    using (bucket_id = 'trail-photos' and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = 'trail-photos' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy trail_photos_owner_delete on storage.objects for delete to authenticated
    using (bucket_id = 'trail-photos' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Group rides on a trail: a route saved from one of the rider's trails (source 'trail') needs
-- Pro, like a GPX import. Same as migration 20261018000000 plus the trail source. A route that
-- already came from a trail stays editable.
-- ---------------------------------------------------------------------------
create or replace function ride_route_pro_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_src text := new.route_geojson -> 'properties' ->> 'source';
  v_old text := case when tg_op = 'UPDATE' then coalesce(old.route_geojson -> 'properties' ->> 'source', '') else '' end;
begin
  if v_src = 'gpx' and (tg_op = 'INSERT' or v_old <> 'gpx') then
    perform pro_required(auth.uid(), 'import_gpx');
  end if;
  if v_src = 'trail' and (tg_op = 'INSERT' or v_old <> 'trail') then
    perform pro_required(auth.uid(), 'trail_rides');
  end if;
  return new;
end;
$$;

-- Admin > Settings can move the new features between Free and Pro too (same as migration
-- 20261018300000 plus the three trail features).
create or replace function admin_set_feature_plan(p_feature text, p_min_plan text, p_allowance int default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb;
begin
  perform require_admin();
  if p_feature not in ('create_ride', 'import_gpx', 'offline_maps', 'saved_groups', 'create_poll', 'ride_history',
                       'advanced_trip_planning', 'advanced_stats', 'premium_ride_cards',
                       'record_trails', 'share_trails', 'trail_rides') then
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
