-- Park Trails: the trails of offroad parks (private parks, state OHV parks and OHV areas), drawn on
-- every map for every rider, signed in or not.
--
-- Where the lines come from: OpenStreetMap, whose contributors have mapped many parks trail by
-- trail (Hidden Falls Adventure Park's trails carry the park's own names and levels there). The
-- data is under the Open Database License, which allows this use with the credit the app already
-- shows ("© OpenStreetMap contributors"); the way it was derived (app/scripts/parks/import.mjs,
-- in the public repository) is published as the license asks. Parks' own copyrighted maps (Avenza,
-- PDFs) are never copied. Each park is one OSM polygon (way or relation) listed in
-- app/scripts/parks/parks.json; the script writes the seed migration that fills this table.
--
-- Additive only: one table and read-only functions. Nothing existing is renamed or dropped.

create table if not exists park_trails (
  id uuid primary key default gen_random_uuid(),
  -- The OSM id of the park's boundary polygon, and the park's name as the import saw it.
  park_osm_id bigint not null,
  park_name text not null check (length(btrim(park_name)) between 2 and 120),
  park_state text check (park_state is null or length(park_state) = 2),
  park_website text check (park_website is null or length(park_website) <= 300),
  -- Where the line came from and its id there (OSM way id), so a later import updates in place.
  source text not null default 'osm' check (source in ('osm')),
  source_id bigint not null,
  name text check (name is null or length(name) <= 120),
  -- The park's own rating when its name carries one ("Carnage Canyon (lvl 5)"): 1 easy to 5 extreme.
  level int check (level between 1 and 5),
  kind text not null default 'trail' check (kind in ('trail', 'road')),
  closed boolean not null default false,
  oneway boolean not null default false,
  surface text check (surface is null or length(surface) <= 40),
  -- Google encoded polyline (precision 5) of the line's points.
  route_enc text not null check (length(route_enc) between 4 and 60000),
  length_m int not null check (length_m between 1 and 500000),
  min_lat double precision not null,
  min_lng double precision not null,
  max_lat double precision not null,
  max_lng double precision not null,
  attribution text not null default '© OpenStreetMap contributors',
  -- An admin took it off the map (a trail the park says is wrong or gone).
  hidden boolean not null default false,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_id)
);
create index if not exists park_trails_area on park_trails (min_lat, max_lat, min_lng, max_lng) where not hidden;
create index if not exists park_trails_park on park_trails (park_osm_id);

alter table park_trails enable row level security;
revoke all on park_trails from anon, authenticated;
-- No direct reads: everything goes through the functions below, which return only the map fields.

-- One line as the app reads it (core/park-trails parseParkTrail).
create or replace function park_trail_json(t park_trails)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'id', t.id, 'park_osm_id', t.park_osm_id, 'park_name', t.park_name, 'park_state', t.park_state,
    'park_website', t.park_website, 'source', t.source, 'source_id', t.source_id, 'name', t.name,
    'level', t.level, 'kind', t.kind, 'closed', t.closed, 'oneway', t.oneway, 'surface', t.surface,
    'route_enc', t.route_enc, 'length_m', t.length_m, 'attribution', t.attribution,
    'box', jsonb_build_array(t.min_lat, t.min_lng, t.max_lat, t.max_lng))
$$;

-- Park trails crossing the map's box, longest first, up to p_limit. Open to everyone: the parks
-- are public places and the lines are public data.
create or replace function park_trails_in_area(p_min_lat double precision, p_min_lng double precision,
  p_max_lat double precision, p_max_lng double precision, p_limit int default 600)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(park_trail_json(t) order by t.length_m desc), '[]'::jsonb)
  from (
    select * from park_trails s
    where not s.hidden
      and s.max_lat >= p_min_lat and s.min_lat <= p_max_lat
      and s.max_lng >= p_min_lng and s.min_lng <= p_max_lng
    order by s.length_m desc
    limit least(greatest(coalesce(p_limit, 600), 1), 2000)
  ) t
$$;
revoke execute on function park_trails_in_area(double precision, double precision, double precision, double precision, int) from public;
grant execute on function park_trails_in_area(double precision, double precision, double precision, double precision, int) to anon, authenticated;

-- Every park with trails on the map: name, where it is, how much is mapped. The app draws the park
-- names from far out and the Places to Ride list says "trails on the map".
create or replace function park_trail_parks()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'park_osm_id', p.park_osm_id, 'park_name', p.park_name, 'park_state', p.park_state, 'park_website', p.park_website,
    'trail_count', p.trail_count, 'trail_m', p.trail_m,
    'center', jsonb_build_object('lat', (p.min_lat + p.max_lat) / 2, 'lng', (p.min_lng + p.max_lng) / 2),
    'box', jsonb_build_array(p.min_lat, p.min_lng, p.max_lat, p.max_lng),
    'updated_at', p.updated_at) order by p.park_name), '[]'::jsonb)
  from (
    select park_osm_id, min(park_name) as park_name, min(park_state) as park_state, min(park_website) as park_website,
      count(*) filter (where kind = 'trail') as trail_count, sum(length_m) as trail_m,
      min(min_lat) as min_lat, min(min_lng) as min_lng, max(max_lat) as max_lat, max(max_lng) as max_lng,
      max(updated_at) as updated_at
    from park_trails where not hidden
    group by park_osm_id
  ) p
$$;
revoke execute on function park_trail_parks() from public;
grant execute on function park_trail_parks() to anon, authenticated;

-- Admin > Park Trails: every park (hidden lines counted too) and the lines of one park.
create or replace function admin_park_trails(p_park bigint default null, p_search text default '')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_parks jsonb;
  v_lines jsonb;
begin
  perform require_admin();
  select coalesce(jsonb_agg(jsonb_build_object(
    'park_osm_id', p.park_osm_id, 'park_name', p.park_name, 'park_state', p.park_state, 'park_website', p.park_website,
    'lines', p.lines, 'trails', p.trails, 'hidden', p.hidden, 'trail_m', p.trail_m, 'imported_at', p.imported_at) order by p.park_name), '[]'::jsonb)
  into v_parks
  from (
    select park_osm_id, min(park_name) as park_name, min(park_state) as park_state, min(park_website) as park_website,
      count(*) as lines, count(*) filter (where kind = 'trail' and not hidden) as trails,
      count(*) filter (where hidden) as hidden, sum(length_m) filter (where not hidden) as trail_m,
      max(imported_at) as imported_at
    from park_trails group by park_osm_id
  ) p;
  if p_park is null then
    v_lines := '[]'::jsonb;
  else
    select coalesce(jsonb_agg(park_trail_json(t) || jsonb_build_object('hidden', t.hidden) order by t.hidden, t.name nulls last, t.length_m desc), '[]'::jsonb)
    into v_lines
    from park_trails t
    where t.park_osm_id = p_park
      and (coalesce(p_search, '') = '' or t.name ilike '%' || p_search || '%');
  end if;
  return jsonb_build_object('parks', v_parks, 'lines', v_lines);
end;
$$;
revoke execute on function admin_park_trails(bigint, text) from public, anon;
grant execute on function admin_park_trails(bigint, text) to authenticated;

-- Hide a line (the park says it's wrong or gone) or put it back. Logged.
create or replace function admin_set_park_trail_hidden(p_trail uuid, p_hidden boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  t park_trails;
begin
  perform require_admin();
  select * into t from park_trails where id = p_trail;
  if not found then raise exception 'no such park trail'; end if;
  if t.hidden = p_hidden then return; end if;
  update park_trails set hidden = p_hidden, updated_at = now() where id = p_trail;
  perform log_admin_action(case when p_hidden then 'park_trail.hide' else 'park_trail.show' end, 'park_trail', p_trail::text,
    jsonb_build_object('hidden', t.hidden, 'name', t.name, 'park', t.park_name), jsonb_build_object('hidden', p_hidden));
end;
$$;
revoke execute on function admin_set_park_trail_hidden(uuid, boolean) from public, anon;
grant execute on function admin_set_park_trail_hidden(uuid, boolean) to authenticated;

-- The import writes rows through this, so a park can be re-imported from an admin session without
-- the service key: rows keep their id and hidden flag, lines gone from the source are removed.
create or replace function admin_import_park_trails(p_park_osm_id bigint, p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  l jsonb;
  v_kept bigint[] := '{}';
  v_upserted int := 0;
  v_removed int;
begin
  perform require_admin();
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then raise exception 'lines must be an array'; end if;
  for l in select * from jsonb_array_elements(p_lines) loop
    insert into park_trails (park_osm_id, park_name, park_state, park_website, source, source_id, name, level, kind, closed, oneway, surface,
      route_enc, length_m, min_lat, min_lng, max_lat, max_lng, attribution)
    values (p_park_osm_id, l ->> 'park_name', l ->> 'park_state', l ->> 'park_website', coalesce(l ->> 'source', 'osm'), (l ->> 'source_id')::bigint,
      l ->> 'name', (l ->> 'level')::int, coalesce(l ->> 'kind', 'trail'), coalesce((l ->> 'closed')::boolean, false),
      coalesce((l ->> 'oneway')::boolean, false), l ->> 'surface', l ->> 'route_enc', (l ->> 'length_m')::int,
      (l ->> 'min_lat')::double precision, (l ->> 'min_lng')::double precision, (l ->> 'max_lat')::double precision, (l ->> 'max_lng')::double precision,
      coalesce(l ->> 'attribution', '© OpenStreetMap contributors'))
    on conflict (source, source_id) do update set
      park_osm_id = excluded.park_osm_id, park_name = excluded.park_name, park_state = excluded.park_state, park_website = excluded.park_website,
      name = excluded.name, level = excluded.level, kind = excluded.kind, closed = excluded.closed, oneway = excluded.oneway,
      surface = excluded.surface, route_enc = excluded.route_enc, length_m = excluded.length_m, min_lat = excluded.min_lat,
      min_lng = excluded.min_lng, max_lat = excluded.max_lat, max_lng = excluded.max_lng, attribution = excluded.attribution,
      updated_at = now();
    v_kept := v_kept || (l ->> 'source_id')::bigint;
    v_upserted := v_upserted + 1;
  end loop;
  delete from park_trails where park_osm_id = p_park_osm_id and source = 'osm' and not (source_id = any (v_kept));
  get diagnostics v_removed = row_count;
  perform log_admin_action('park_trail.import', 'park', p_park_osm_id::text, null,
    jsonb_build_object('upserted', v_upserted, 'removed', v_removed));
  return jsonb_build_object('upserted', v_upserted, 'removed', v_removed);
end;
$$;
revoke execute on function admin_import_park_trails(bigint, jsonb) from public, anon;
grant execute on function admin_import_park_trails(bigint, jsonb) to authenticated;
