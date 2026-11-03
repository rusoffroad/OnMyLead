-- Trail width limits.
--
-- Riders add the width limit they found on a public trail (Forest Service, BLM or OpenStreetMap
-- line on the map). Each rider counts once per line, and everyone sees the middle of all entries, so
-- one wrong entry can't change what's shown. The admin can remove an entry on the Admin Dashboard.
-- Rider trails already carry their mapper's width (shared_trails.max_width_in); the Forest Service
-- limit is worked out on the phone from the agency's vehicle classes (app/src/core/trail-width.ts).
--
-- Garage vehicles get an optional width so the app can say "Your RZR Is Too Wide".
--
-- Additive only: one new table, one new nullable column, new functions. Older app builds never
-- read or write any of it, and their vehicle inserts and updates keep working.

alter table vehicles add column if not exists width_in int check (width_in is null or width_in between 20 and 120);

create table if not exists trail_width_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Which map layer the line is on: mvum and fsclosed are Forest Service, blm is BLM, osm OpenStreetMap.
  source text not null check (source in ('mvum', 'fsclosed', 'blm', 'osm')),
  -- The agency's route id (and forest or state). Null for OpenStreetMap, whose map lines have no
  -- lasting id: those match by name within a few miles, or by spot when unnamed.
  line_key text check (line_key is null or length(line_key) between 1 and 80),
  name text check (name is null or length(name) <= 120),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  width_in int not null check (width_in between 30 and 120),
  status text not null default 'public' check (status in ('public', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists trail_width_reports_line on trail_width_reports (source, line_key) where line_key is not null;
create index if not exists trail_width_reports_spot on trail_width_reports (source, lat, lng) where line_key is null;
create index if not exists trail_width_reports_user on trail_width_reports (user_id, updated_at);

-- Only through the functions below: nobody reads another rider's entry, only the middle value.
alter table trail_width_reports enable row level security;
revoke all on trail_width_reports from anon, authenticated;

-- Entries that count for the line the rider tapped.
create or replace function trail_width_matches(p_source text, p_line_key text, p_name text, p_lat double precision, p_lng double precision)
returns setof trail_width_reports language sql stable security definer set search_path = public as $$
  select r.* from trail_width_reports r
  where r.source = p_source
    and (
      (nullif(btrim(p_line_key), '') is not null and r.line_key = btrim(p_line_key))
      or (
        nullif(btrim(p_line_key), '') is null and r.line_key is null
        -- A named track: same name within about 5 km. An unnamed one: within about 60 m.
        and case when nullif(btrim(p_name), '') is not null and lower(r.name) = lower(btrim(p_name)) then 0.045 else 0.00055 end
            >= greatest(abs(r.lat - p_lat), abs(r.lng - p_lng) * greatest(0.1, cos(radians(p_lat))))
      )
    );
$$;
revoke execute on function trail_width_matches(text, text, text, double precision, double precision) from public, anon, authenticated;

create or replace function trail_width_json(p_source text, p_line_key text, p_name text, p_lat double precision, p_lng double precision)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    -- The narrower middle value when the count is even.
    'width_in', percentile_disc(0.5) within group (order by m.width_in) filter (where m.status = 'public'),
    'count', count(*) filter (where m.status = 'public'),
    'mine', max(m.width_in) filter (where m.user_id = auth.uid() and m.status = 'public'))
  from trail_width_matches(p_source, p_line_key, p_name, p_lat, p_lng) m;
$$;
revoke execute on function trail_width_json(text, text, text, double precision, double precision) from public, anon, authenticated;

-- What riders say a public trail's width limit is: { width_in, count, mine }.
create or replace function trail_width_near(p_source text, p_line_key text, p_name text, p_lat double precision, p_lng double precision)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  return trail_width_json(p_source, p_line_key, p_name, p_lat, p_lng);
end;
$$;
revoke execute on function trail_width_near(text, text, text, double precision, double precision) from public, anon;
grant execute on function trail_width_near(text, text, text, double precision, double precision) to authenticated;

-- Add, change or (with a null width) clear this rider's width for a line. Returns the new summary.
create or replace function report_trail_width(p_source text, p_line_key text, p_name text, p_lat double precision, p_lng double precision, p_width_in int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_key text := nullif(btrim(p_line_key), '');
  v_name text := nullif(btrim(p_name), '');
  v_id uuid;
  v_status text;
begin
  if v_me is null then raise exception 'sign in first'; end if;
  if p_source not in ('mvum', 'fsclosed', 'blm', 'osm') then raise exception 'unknown trail source'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'bad spot'; end if;
  if p_width_in is not null and p_width_in not between 30 and 120 then raise exception 'Width is 30 to 120 inches.'; end if;
  if v_key is not null and length(v_key) > 80 then raise exception 'bad line id'; end if;
  if v_name is not null then v_name := left(v_name, 120); end if;

  select m.id, m.status into v_id, v_status from trail_width_matches(p_source, v_key, v_name, p_lat, p_lng) m
  where m.user_id = v_me order by m.updated_at desc limit 1;
  if v_status = 'removed' then raise exception 'Your width for this trail was removed by OnMyLead.'; end if;

  if p_width_in is null then
    delete from trail_width_reports where id = v_id;
  elsif v_id is not null then
    update trail_width_reports set width_in = p_width_in, updated_at = now()
    where id = v_id;
  else
    if (select count(*) from trail_width_reports where user_id = v_me and created_at > now() - interval '1 day') >= 60 then
      raise exception 'That''s a lot of widths for one day. Try again tomorrow.';
    end if;
    insert into trail_width_reports (user_id, source, line_key, name, lat, lng, width_in)
    values (v_me, p_source, v_key, v_name, p_lat, p_lng, p_width_in);
  end if;
  return trail_width_json(p_source, v_key, v_name, p_lat, p_lng);
end;
$$;
revoke execute on function report_trail_width(text, text, text, double precision, double precision, int) from public, anon;
grant execute on function report_trail_width(text, text, text, double precision, double precision, int) to authenticated;

-- Admin Dashboard > Rider Trails > Width Entries, newest first.
create or replace function admin_trail_widths(p_status text default 'public', p_search text default '', p_page int default 1, p_size int default 50)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_q text := '%' || coalesce(btrim(p_search), '') || '%';
  v_size int := least(greatest(coalesce(p_size, 50), 1), 200);
begin
  perform require_admin();
  if p_status not in ('all', 'public', 'removed') then raise exception 'bad status filter'; end if;
  return jsonb_build_object(
    'total', (select count(*) from trail_width_reports r left join profiles p on p.id = r.user_id
              where (p_status = 'all' or r.status = p_status) and (coalesce(r.name, '') ilike v_q or coalesce(p.display_name, '') ilike v_q)),
    'counts', (select jsonb_build_object('public', count(*) filter (where status = 'public'), 'removed', count(*) filter (where status = 'removed'))
               from trail_width_reports),
    'rows', (select coalesce(jsonb_agg(x.j order by x.updated_at desc), '[]'::jsonb) from (
      select jsonb_build_object(
               'id', r.id, 'source', r.source, 'line_key', r.line_key, 'name', r.name, 'lat', r.lat, 'lng', r.lng,
               'width_in', r.width_in, 'status', r.status, 'created_at', r.created_at, 'updated_at', r.updated_at,
               'user_id', r.user_id, 'rider', coalesce(p.display_name, 'Rider'), 'email', u.email,
               -- What everyone sees for that line now, to spot an entry far off the others.
               'shown', (select jsonb_build_object('width_in', percentile_disc(0.5) within group (order by m.width_in), 'count', count(*))
                         from trail_width_matches(r.source, r.line_key, r.name, r.lat, r.lng) m where m.status = 'public')) as j,
             r.updated_at
      from trail_width_reports r
      left join profiles p on p.id = r.user_id
      left join auth.users u on u.id = r.user_id
      where (p_status = 'all' or r.status = p_status) and (coalesce(r.name, '') ilike v_q or coalesce(p.display_name, '') ilike v_q)
      order by r.updated_at desc
      limit v_size offset (greatest(coalesce(p_page, 1), 1) - 1) * v_size) x));
end;
$$;
revoke execute on function admin_trail_widths(text, text, int, int) from public, anon;
grant execute on function admin_trail_widths(text, text, int, int) to authenticated;

create or replace function admin_set_trail_width_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare
  r trail_width_reports;
begin
  perform require_admin();
  if p_status not in ('public', 'removed') then raise exception 'status must be public or removed'; end if;
  select * into r from trail_width_reports where id = p_id;
  if not found then raise exception 'no such width entry'; end if;
  if r.status = p_status then return; end if;
  update trail_width_reports set status = p_status where id = p_id;
  perform log_admin_action('trail_width.' || p_status, 'trail_width', p_id::text,
    jsonb_build_object('status', r.status, 'width_in', r.width_in, 'name', r.name), jsonb_build_object('status', p_status));
end;
$$;
revoke execute on function admin_set_trail_width_status(uuid, text) from public, anon;
grant execute on function admin_set_trail_width_status(uuid, text) to authenticated;
