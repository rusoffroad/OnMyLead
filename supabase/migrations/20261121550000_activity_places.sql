-- Places to Ride follows the rider's activity (4.0, Chris 2026-11-19): Snowmobile finds snowmobile
-- areas, Motorcycle finds scenic drives, campgrounds and motocross tracks, Road Trip finds scenic
-- drives and campgrounds. The places themselves are in the seed that follows
-- (app/scripts/spots/import-activities.mjs). Offroad finds exactly what it found before.
--
-- Backward compatible:
--   * riding_spots_near (every build before 4.0) keeps answering with Offroad places only, so an
--     older build never sees a kind it doesn't know.
--   * riding_spots_near_for (4.0) now searches the activity's places directly, so thousands of
--     campgrounds can't crowd the nearest 300 Offroad places out (or the other way round).
--   * suggest_riding_spot keeps its signature and learns the new kinds; suggest_riding_spot_for
--     also files the suggestion under the rider's activity.

-- Three new kinds of place.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.riding_spots'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%kind%park%'
  loop
    execute format('alter table riding_spots drop constraint %I', c);
  end loop;
end $$;
alter table riding_spots add constraint riding_spots_kind_check
  check (kind in ('park', 'ohv_area', 'trail_system', 'trailhead', 'track', 'snow_area', 'scenic_drive', 'campground'));

-- Motocross tracks are Motorcycle places too.
update riding_spots set activities = array_append(activities, 'motorcycle'), updated_at = now()
where kind = 'track' and not ('motorcycle' = any (activities));

create index if not exists riding_spots_activities_idx on riding_spots using gin (activities);

-- Live places for one activity within p_miles of a point, nearest first (riding_spots_near's
-- body, with the activity checked before the limit).
create or replace function riding_spots_near_activity(
  p_activity text, p_lat double precision, p_lng double precision, p_miles double precision default 250,
  p_kinds text[] default null, p_limit int default 300)
returns table (
  id uuid, name text, kind text, lat double precision, lng double precision, state text, area_name text,
  website text, source text, attribution text, distance_mi double precision, rides_coming_up int)
language plpgsql stable security definer set search_path = public as $$
declare
  v_activity text := coalesce(nullif(btrim(coalesce(p_activity, '')), ''), 'offroad');
  v_miles double precision := least(greatest(coalesce(p_miles, 250), 1), 1000);
  v_dlat double precision := v_miles / 69.0;
  v_dlng double precision;
begin
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'bad spot';
  end if;
  v_dlng := v_miles / (69.0 * greatest(0.05, cos(radians(p_lat))));
  return query
  with near as (
    select s.*, miles_between(p_lat, p_lng, s.lat, s.lng) as d
    from riding_spots s
    where s.status = 'live'
      and v_activity = any (s.activities)
      and s.lat between p_lat - v_dlat and p_lat + v_dlat
      and s.lng between p_lng - v_dlng and p_lng + v_dlng
      and (p_kinds is null or cardinality(p_kinds) = 0 or s.kind = any (p_kinds))
  )
  select n.id, n.name, n.kind, n.lat, n.lng, n.state, n.area_name, n.website, n.source, n.attribution, n.d,
    (select count(*)::int from rides r
      where r.visibility = 'public' and r.status in ('scheduled', 'live')
        and r.meet_at >= now() - interval '6 hours'
        and r.meet_area_lat between n.lat - 0.22 and n.lat + 0.22
        and r.meet_area_lng between n.lng - 0.22 / greatest(0.05, cos(radians(n.lat))) and n.lng + 0.22 / greatest(0.05, cos(radians(n.lat)))
        and miles_between(n.lat, n.lng, r.meet_area_lat, r.meet_area_lng) <= 15)
  from near n
  where n.d <= v_miles
  order by n.d
  limit least(greatest(coalesce(p_limit, 300), 1), 500);
end;
$$;
revoke execute on function riding_spots_near_activity(text, double precision, double precision, double precision, text[], int) from public;
grant execute on function riding_spots_near_activity(text, double precision, double precision, double precision, text[], int) to anon, authenticated;

-- Builds before 4.0: Offroad places only, exactly the kinds they know.
create or replace function riding_spots_near(
  p_lat double precision, p_lng double precision, p_miles double precision default 250,
  p_kinds text[] default null, p_limit int default 300)
returns table (
  id uuid, name text, kind text, lat double precision, lng double precision, state text, area_name text,
  website text, source text, attribution text, distance_mi double precision, rides_coming_up int)
language sql stable security definer set search_path = public as $$
  select n.* from riding_spots_near_activity('offroad', p_lat, p_lng, p_miles, p_kinds, p_limit) n
  where n.kind in ('park', 'ohv_area', 'trail_system', 'trailhead', 'track');
$$;

-- 4.0: the activity's own places.
create or replace function riding_spots_near_for(
  p_activity text, p_lat double precision, p_lng double precision, p_miles double precision default 250,
  p_kinds text[] default null, p_limit int default 300)
returns table (
  id uuid, name text, kind text, lat double precision, lng double precision, state text, area_name text,
  website text, source text, attribution text, distance_mi double precision, rides_coming_up int)
language sql stable security definer set search_path = public as $$
  select * from riding_spots_near_activity(p_activity, p_lat, p_lng, p_miles, p_kinds, p_limit);
$$;

-- A rider suggests a place that's missing (same as before, with the new kinds).
create or replace function suggest_riding_spot(
  p_name text, p_kind text, p_lat double precision, p_lng double precision,
  p_website text default null, p_note text default null, p_state text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_site text := nullif(btrim(coalesce(p_website, '')), '');
  v_id uuid;
begin
  if v_me is null then raise exception 'sign in first'; end if;
  if length(v_name) < 2 or length(v_name) > 120 then raise exception 'Give the place a name (2 to 120 characters).'; end if;
  if p_kind not in ('park', 'ohv_area', 'trail_system', 'trailhead', 'track', 'snow_area', 'scenic_drive', 'campground') then
    raise exception 'unknown kind of place';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'Pick where the place is.'; end if;
  if v_site is not null and v_site !~* '^https?://' then v_site := 'https://' || v_site; end if;
  if v_site is not null and length(v_site) > 300 then raise exception 'That website is too long.'; end if;
  if (select count(*) from riding_spots where suggested_by = v_me and created_at > now() - interval '1 day') >= 10 then
    raise exception 'That''s a lot of places for one day. Try again tomorrow.';
  end if;
  insert into riding_spots (source, source_id, name, kind, lat, lng, state, website, status, suggested_by, suggestion_note)
  values ('rider', gen_random_uuid()::text, v_name, p_kind, p_lat, p_lng,
          case when upper(btrim(coalesce(p_state, ''))) ~ '^[A-Z]{2}$' then upper(btrim(p_state)) end,
          v_site, 'pending', v_me, left(nullif(btrim(coalesce(p_note, '')), ''), 500))
  returning id into v_id;
  return v_id;
end;
$$;

-- 4.0: the suggestion is filed under the rider's activity (the admin can change it).
create or replace function suggest_riding_spot_for(
  p_activity text, p_name text, p_kind text, p_lat double precision, p_lng double precision,
  p_website text default null, p_note text default null, p_state text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  v_id := suggest_riding_spot(p_name, p_kind, p_lat, p_lng, p_website, p_note, p_state);
  if p_activity is not null and p_activity ~ '^[a-z][a-z_]{1,23}$' then
    update riding_spots set activities = array[p_activity] where id = v_id;
  end if;
  return v_id;
end;
$$;
revoke execute on function suggest_riding_spot_for(text, text, text, double precision, double precision, text, text, text) from public, anon;
grant execute on function suggest_riding_spot_for(text, text, text, double precision, double precision, text, text, text) to authenticated;
