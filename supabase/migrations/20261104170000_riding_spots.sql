-- Scout: places to ride (off-road parks, OHV areas, trail systems, trailheads and motocross tracks).
--
-- Riders open Find > Places to Ride and see the spots within a distance they choose (250 miles to
-- start), nearest first, on a map and in a list. The places come from openly licensed data, loaded
-- by app/scripts/spots/import.mjs into the seed migration that follows this one:
--   * US Forest Service Recreation Opportunities, OHV activities (public domain);
--   * BLM National Recreation Sites, OHV Designated Areas (public domain);
--   * OpenStreetMap off-road parks and tracks (© OpenStreetMap contributors, ODbL 1.0).
-- Riders can suggest a place that's missing; it stays hidden until the admin approves it on the
-- Admin Dashboard (Riding Spots), where the admin can also fix, hide or add a place.
--
-- A spot is a public place, never a rider's location. Who suggested one is never shown to riders.
-- Additive only: one new table and new functions. Older app builds never read any of it.

create table if not exists riding_spots (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('usfs', 'blm', 'osm', 'onmylead', 'rider')),
  -- The source's own id, so a re-import updates the same row (OSM: the way, node or relation id).
  source_id text not null check (length(source_id) between 1 and 80),
  name text not null check (length(btrim(name)) between 2 and 120),
  kind text not null check (kind in ('park', 'ohv_area', 'trail_system', 'trailhead', 'track')),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  state text check (state is null or state ~ '^[A-Z]{2}$'),
  -- The national forest, BLM office or county it is in.
  area_name text check (area_name is null or length(area_name) <= 120),
  description text check (description is null or length(description) <= 1000),
  website text check (website is null or (website ~* '^https?://' and length(website) <= 300)),
  vehicle_types text[] not null default '{}',
  license text check (license is null or length(license) <= 60),
  attribution text check (attribution is null or length(attribution) <= 120),
  status text not null default 'live' check (status in ('live', 'pending', 'hidden')),
  -- Set when the admin edits or hides a row, so a re-import never undoes it.
  edited_by_admin boolean not null default false,
  suggested_by uuid references auth.users (id) on delete set null,
  -- What the rider wrote with a suggestion; only the admin reads it.
  suggestion_note text check (suggestion_note is null or length(suggestion_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_id)
);
create index if not exists riding_spots_live_lat on riding_spots (lat, lng) where status = 'live';
create index if not exists riding_spots_status on riding_spots (status, updated_at);
create index if not exists riding_spots_suggested_by on riding_spots (suggested_by, created_at) where suggested_by is not null;

-- Live spots are public reading for everyone, signed in or not (the website too). Writing is only
-- through the functions below. The suggester and note columns are never granted.
alter table riding_spots enable row level security;
revoke all on riding_spots from anon, authenticated;
grant select (id, source, source_id, name, kind, lat, lng, state, area_name, description, website, vehicle_types,
              license, attribution, status, created_at, updated_at) on riding_spots to anon, authenticated;
drop policy if exists riding_spots_read_live on riding_spots;
create policy riding_spots_read_live on riding_spots for select to anon, authenticated using (status = 'live');

-- Miles between two points (haversine, earth radius 3958.8 mi).
create or replace function miles_between(a_lat double precision, a_lng double precision, b_lat double precision, b_lng double precision)
returns double precision language sql immutable parallel safe as $$
  select 2 * 3958.8 * asin(least(1, sqrt(
    power(sin(radians(b_lat - a_lat) / 2), 2)
    + cos(radians(a_lat)) * cos(radians(b_lat)) * power(sin(radians(b_lng - a_lng) / 2), 2))));
$$;

-- Live spots within p_miles of a point (1 to 1000, Scout starts at 250), nearest first, with how
-- many public rides are coming up within 15 miles of each. p_kinds narrows to some kinds.
create or replace function riding_spots_near(
  p_lat double precision, p_lng double precision, p_miles double precision default 250,
  p_kinds text[] default null, p_limit int default 300)
returns table (
  id uuid, name text, kind text, lat double precision, lng double precision, state text, area_name text,
  website text, source text, attribution text, distance_mi double precision, rides_coming_up int)
language plpgsql stable security definer set search_path = public as $$
declare
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
revoke execute on function riding_spots_near(double precision, double precision, double precision, text[], int) from public;
grant execute on function riding_spots_near(double precision, double precision, double precision, text[], int) to anon, authenticated;

-- A rider suggests a place that's missing. It waits, hidden, for the admin. Returns the new id.
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
  if p_kind not in ('park', 'ohv_area', 'trail_system', 'trailhead', 'track') then raise exception 'unknown kind of place'; end if;
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
revoke execute on function suggest_riding_spot(text, text, double precision, double precision, text, text, text) from public, anon;
grant execute on function suggest_riding_spot(text, text, double precision, double precision, text, text, text) to authenticated;

-- Admin Dashboard > Riding Spots: pending suggestions first, then by name.
create or replace function admin_riding_spots(p_status text default 'pending', p_search text default '', p_page int default 1, p_size int default 50)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_q text := '%' || coalesce(btrim(p_search), '') || '%';
  v_size int := least(greatest(coalesce(p_size, 50), 1), 200);
begin
  perform require_admin();
  if p_status not in ('all', 'live', 'pending', 'hidden') then raise exception 'bad status filter'; end if;
  return jsonb_build_object(
    'total', (select count(*) from riding_spots s
              where (p_status = 'all' or s.status = p_status)
                and (s.name ilike v_q or coalesce(s.state, '') ilike v_q or coalesce(s.area_name, '') ilike v_q)),
    'counts', (select jsonb_build_object(
                 'live', count(*) filter (where status = 'live'),
                 'pending', count(*) filter (where status = 'pending'),
                 'hidden', count(*) filter (where status = 'hidden'))
               from riding_spots),
    'rows', (select coalesce(jsonb_agg(x.j order by x.ord, x.name), '[]'::jsonb) from (
      select jsonb_build_object(
               'id', s.id, 'source', s.source, 'source_id', s.source_id, 'name', s.name, 'kind', s.kind,
               'lat', s.lat, 'lng', s.lng, 'state', s.state, 'area_name', s.area_name, 'description', s.description,
               'website', s.website, 'status', s.status, 'edited_by_admin', s.edited_by_admin,
               'suggestion_note', s.suggestion_note, 'created_at', s.created_at, 'updated_at', s.updated_at,
               'rider', case when s.suggested_by is not null then coalesce(p.display_name, 'Rider') end,
               'email', u.email) as j,
             case s.status when 'pending' then 0 else 1 end as ord, s.name
      from riding_spots s
      left join profiles p on p.id = s.suggested_by
      left join auth.users u on u.id = s.suggested_by
      where (p_status = 'all' or s.status = p_status)
        and (s.name ilike v_q or coalesce(s.state, '') ilike v_q or coalesce(s.area_name, '') ilike v_q)
      order by case s.status when 'pending' then 0 else 1 end, s.name
      limit v_size offset (greatest(coalesce(p_page, 1), 1) - 1) * v_size) x));
end;
$$;
revoke execute on function admin_riding_spots(text, text, int, int) from public, anon;
grant execute on function admin_riding_spots(text, text, int, int) to authenticated;

-- Approve, hide, fix or (with a null id) add a spot. Fields left out keep their value. Returns the id.
create or replace function admin_save_riding_spot(p_id uuid, p_fields jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  r riding_spots;
  f jsonb := coalesce(p_fields, '{}'::jsonb);
  v_id uuid;
begin
  perform require_admin();
  if p_id is null then
    insert into riding_spots (source, source_id, name, kind, lat, lng, state, area_name, description, website, status, edited_by_admin, license, attribution)
    values ('onmylead', gen_random_uuid()::text, btrim(f ->> 'name'), coalesce(f ->> 'kind', 'park'),
            (f ->> 'lat')::double precision, (f ->> 'lng')::double precision, nullif(upper(btrim(f ->> 'state')), ''),
            nullif(btrim(f ->> 'area_name'), ''), nullif(btrim(f ->> 'description'), ''), nullif(btrim(f ->> 'website'), ''),
            coalesce(f ->> 'status', 'live'), true, null, 'OnMyLead')
    returning id into v_id;
    perform log_admin_action('riding_spot.add', 'riding_spot', v_id::text, null, f);
    return v_id;
  end if;
  select * into r from riding_spots where id = p_id;
  if not found then raise exception 'no such place'; end if;
  update riding_spots set
    name = coalesce(nullif(btrim(f ->> 'name'), ''), name),
    kind = coalesce(f ->> 'kind', kind),
    lat = coalesce((f ->> 'lat')::double precision, lat),
    lng = coalesce((f ->> 'lng')::double precision, lng),
    state = case when f ? 'state' then nullif(upper(btrim(f ->> 'state')), '') else state end,
    area_name = case when f ? 'area_name' then nullif(btrim(f ->> 'area_name'), '') else area_name end,
    description = case when f ? 'description' then nullif(btrim(f ->> 'description'), '') else description end,
    website = case when f ? 'website' then nullif(btrim(f ->> 'website'), '') else website end,
    status = coalesce(f ->> 'status', status),
    -- An approved rider suggestion is credited to OnMyLead, never to the rider.
    attribution = case when source = 'rider' and coalesce(f ->> 'status', status) = 'live' then 'OnMyLead riders' else attribution end,
    edited_by_admin = true,
    updated_at = now()
  where id = p_id;
  perform log_admin_action('riding_spot.' || coalesce(f ->> 'status', 'edit'), 'riding_spot', p_id::text,
    jsonb_build_object('status', r.status, 'name', r.name, 'kind', r.kind), f);
  return p_id;
end;
$$;
revoke execute on function admin_save_riding_spot(uuid, jsonb) from public, anon;
grant execute on function admin_save_riding_spot(uuid, jsonb) to authenticated;
