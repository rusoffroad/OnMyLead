-- Places to Ride (3.4, Chris 2026-11-18: "a profile for the park or area"): a place's address,
-- phone, hours, fees and season; its trails counted by level (Park Trails); rider reviews with
-- photos; a rider's Favorite Places; and the parks we already draw trails for, added as places.
--
-- Additive and backward compatible: new nullable columns on riding_spots (older builds select only
-- the columns they know), a new table, new functions, and two admin functions replaced with the
-- same signatures and extra keys. Google reviews and photos are NOT used (paid, and their terms
-- forbid storing them; Chris picked the free option 2026-11-18): the app links to Google Maps instead.

-- ---------------------------------------------------------------------------
-- 1. A place's details. Filled from public data or by hand from the park's own website (facts
--    only: address, phone, hours). `details_source` says where they came from, `details_checked` when.
-- ---------------------------------------------------------------------------
alter table riding_spots add column if not exists address text check (address is null or length(address) <= 200);
alter table riding_spots add column if not exists phone text check (phone is null or (length(phone) <= 30 and phone ~ '^[0-9+(). -]+$'));
alter table riding_spots add column if not exists hours text check (hours is null or length(hours) <= 400);
alter table riding_spots add column if not exists fees text check (fees is null or length(fees) <= 400);
alter table riding_spots add column if not exists season text check (season is null or length(season) <= 120);
alter table riding_spots add column if not exists details_source text check (details_source is null or length(details_source) <= 120);
alter table riding_spots add column if not exists details_checked date;

grant select (address, phone, hours, fees, season, details_source, details_checked) on riding_spots to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Every park we draw trails for (Park Trails) is a place too. Before this, parks like Wolf Caves
--    and Katemcy Rocks had trails on the map but no place page. Centre of the park's trails.
-- ---------------------------------------------------------------------------
insert into riding_spots (source, source_id, name, kind, lat, lng, state, website, license, attribution, status)
select 'osm', p.park_osm_id::text, p.park_name, 'park', (p.min_lat + p.max_lat) / 2, (p.min_lng + p.max_lng) / 2,
       case when p.park_state ~ '^[A-Z]{2}$' then p.park_state end, p.park_website,
       'ODbL 1.0', '© OpenStreetMap contributors', 'live'
from (
  select park_osm_id, min(park_name) as park_name, min(park_state) as park_state, min(park_website) as park_website,
         min(min_lat) as min_lat, min(min_lng) as min_lng, max(max_lat) as max_lat, max(max_lng) as max_lng
  from park_trails group by park_osm_id
) p
where length(btrim(p.park_name)) between 2 and 120
  and (p.park_website is null or p.park_website ~* '^https?://')
on conflict (source, source_id) do nothing;

-- Details checked by hand on each park's own website, 2026-11-18. Only filled where still empty.
update riding_spots set
  address = coalesce(address, '7030 E FM 1431, Marble Falls, TX 78654'),
  phone = coalesce(phone, '830-798-9820'),
  hours = coalesce(hours, E'Mon–Thu 9 AM–5 PM\nFri 9 AM–7 PM\nSat–Sun 8 AM–5 PM'),
  fees = coalesce(fees, 'Private park. Day passes, camping and UTV rentals on the park''s website.'),
  website = coalesce(website, 'https://www.hiddenfallsadventurepark.com'),
  details_source = coalesce(details_source, 'The park''s website'),
  details_checked = coalesce(details_checked, date '2026-11-18')
where source = 'osm' and source_id = '331218708';

update riding_spots set
  address = coalesce(address, '4869 W Hwy 29, Mason, TX'),
  details_source = coalesce(details_source, 'The park''s website'),
  details_checked = coalesce(details_checked, date '2026-11-18')
where source = 'osm' and source_id = '988388348';

update riding_spots set
  phone = coalesce(phone, '903-522-1901'),
  hours = coalesce(hours, 'Open every weekend'),
  details_source = coalesce(details_source, 'The park''s website'),
  details_checked = coalesce(details_checked, date '2026-11-18')
where source = 'osm' and source_id = '13926860763';

-- ---------------------------------------------------------------------------
-- 3. Rider reviews: one per rider per place (they can change it), 1 to 5 stars, a few words and up
--    to 4 photos in the spot-photos bucket (<user id>/<file>). Read and written only through the
--    functions below. The admin can hide a review; a hidden one stays hidden when its rider edits it.
-- ---------------------------------------------------------------------------
create table if not exists riding_spot_reviews (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references riding_spots (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  body text check (body is null or length(body) <= 1000),
  photos text[] not null default '{}' check (cardinality(photos) <= 4),
  status text not null default 'live' check (status in ('live', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (spot_id, user_id)
);
create index if not exists riding_spot_reviews_spot on riding_spot_reviews (spot_id, updated_at desc) where status = 'live';
create index if not exists riding_spot_reviews_user on riding_spot_reviews (user_id, updated_at);
create index if not exists riding_spot_reviews_status on riding_spot_reviews (status, updated_at desc);
alter table riding_spot_reviews enable row level security;
revoke all on riding_spot_reviews from anon, authenticated;

-- A review the viewer may see: live, its rider not suspended, and not someone the viewer blocked.
create or replace function riding_spot_review_shown(p_status text, p_author uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_status = 'live'
    and not exists (select 1 from auth.users u where u.id = p_author and coalesce(u.banned_until > now(), false))
    and not exists (select 1 from blocked_riders b where b.blocker_id = auth.uid() and b.blocked_id = p_author);
$$;
revoke execute on function riding_spot_review_shown(text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3b. Favorite Places (Chris 2026-11-18: "add a favorite areas, and add a way to add it to that").
--     A rider's own list, on their account so it follows them to every device. Nobody else sees it.
-- ---------------------------------------------------------------------------
create table if not exists riding_spot_favorites (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  spot_id uuid not null references riding_spots (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, spot_id)
);
create index if not exists riding_spot_favorites_spot on riding_spot_favorites (spot_id);
alter table riding_spot_favorites enable row level security;
revoke all on riding_spot_favorites from anon, authenticated;

-- Save or unsave a place. Up to 500 favorites. Returns whether it is now a favorite.
create or replace function set_riding_spot_favorite(p_spot uuid, p_on boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Sign in to save favorite places.'; end if;
  if coalesce(p_on, false) then
    if not exists (select 1 from riding_spots where id = p_spot and status = 'live') then raise exception 'no such place'; end if;
    if (select count(*) from riding_spot_favorites where user_id = v_me) >= 500 then
      raise exception 'That''s 500 favorites. Remove one to save another.';
    end if;
    insert into riding_spot_favorites (user_id, spot_id) values (v_me, p_spot) on conflict do nothing;
    return true;
  end if;
  delete from riding_spot_favorites where user_id = v_me and spot_id = p_spot;
  return false;
end;
$$;
revoke execute on function set_riding_spot_favorite(uuid, boolean) from public, anon;
grant execute on function set_riding_spot_favorite(uuid, boolean) to authenticated;

-- Your favorite places, newest saved first, with how far each is from a point (0 without one).
-- Same row shape as riding_spots_near, so the app lists and maps them the same way.
create or replace function my_favorite_riding_spots(p_lat double precision default null, p_lng double precision default null)
returns table (
  id uuid, name text, kind text, lat double precision, lng double precision, state text, area_name text,
  website text, source text, attribution text, distance_mi double precision, rides_coming_up int)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  return query
  select s.id, s.name, s.kind, s.lat, s.lng, s.state, s.area_name, s.website, s.source, s.attribution,
    case when p_lat between -90 and 90 and p_lng between -180 and 180 then miles_between(p_lat, p_lng, s.lat, s.lng) else 0 end,
    (select count(*)::int from rides r
      where r.visibility = 'public' and r.status in ('scheduled', 'live')
        and r.meet_at >= now() - interval '6 hours'
        and r.meet_area_lat between s.lat - 0.22 and s.lat + 0.22
        and r.meet_area_lng between s.lng - 0.22 / greatest(0.05, cos(radians(s.lat))) and s.lng + 0.22 / greatest(0.05, cos(radians(s.lat)))
        and miles_between(s.lat, s.lng, r.meet_area_lat, r.meet_area_lng) <= 15)
  from riding_spot_favorites f
  join riding_spots s on s.id = f.spot_id and s.status = 'live'
  where f.user_id = auth.uid()
  order by f.created_at desc, s.name;
end;
$$;
revoke execute on function my_favorite_riding_spots(double precision, double precision) from public, anon;
grant execute on function my_favorite_riding_spots(double precision, double precision) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The place page in one call: the place (with its details), its trails by level when we draw
--    them, and its reviews (rating, newest photos, newest reviews, and the viewer's own).
--    Null when the place isn't live. Works signed out (the website).
-- ---------------------------------------------------------------------------
create or replace function riding_spot_page(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  s riding_spots;
  v_me uuid := auth.uid();
  v_trails jsonb;
  v_reviews jsonb;
begin
  select * into s from riding_spots where id = p_id and status = 'live';
  if not found then return null; end if;

  if s.source = 'osm' and s.source_id ~ '^[0-9]{1,18}$' then
    select case when count(*) = 0 then null else jsonb_build_object(
      'trails', count(*),
      'miles', round((coalesce(sum(length_m), 0) / 1609.344)::numeric, 1),
      'easy', count(*) filter (where level between 1 and 2 and not closed),
      'medium', count(*) filter (where level = 3 and not closed),
      'hard', count(*) filter (where level = 4 and not closed),
      'extreme', count(*) filter (where level = 5 and not closed),
      'unrated', count(*) filter (where level is null and not closed),
      'closed', count(*) filter (where closed)) end
    into v_trails
    from park_trails
    where park_osm_id = s.source_id::bigint and kind = 'trail' and not hidden;
  end if;

  with shown as (
    select r.*, coalesce(nullif(btrim(p.display_name), ''), 'Rider') as name
    from riding_spot_reviews r
    left join profiles p on p.id = r.user_id
    where r.spot_id = s.id and riding_spot_review_shown(r.status, r.user_id)
  )
  select jsonb_build_object(
    'count', (select count(*) from shown),
    'average', (select round(avg(stars)::numeric, 1) from shown),
    'photos', (select coalesce(jsonb_agg(x.photo), '[]'::jsonb) from (
                 select ph.photo from shown sh cross join lateral unnest(sh.photos) as ph(photo)
                 order by sh.updated_at desc limit 12) x),
    'list', (select coalesce(jsonb_agg(jsonb_build_object(
                 'id', sh.id, 'stars', sh.stars, 'body', sh.body, 'photos', to_jsonb(sh.photos), 'name', sh.name,
                 'user_id', case when v_me is not null then sh.user_id end,
                 'mine', sh.user_id = v_me, 'at', sh.updated_at) order by sh.updated_at desc), '[]'::jsonb)
             from (select * from shown order by updated_at desc limit 20) sh),
    'mine', (select jsonb_build_object('id', r.id, 'stars', r.stars, 'body', r.body, 'photos', to_jsonb(r.photos),
                                       'hidden', r.status = 'hidden', 'at', r.updated_at)
             from riding_spot_reviews r where v_me is not null and r.spot_id = s.id and r.user_id = v_me))
  into v_reviews;

  return jsonb_build_object(
    'spot', jsonb_build_object(
      'id', s.id, 'source', s.source, 'source_id', s.source_id, 'name', s.name, 'kind', s.kind, 'lat', s.lat, 'lng', s.lng,
      'state', s.state, 'area_name', s.area_name, 'description', s.description, 'website', s.website,
      'vehicle_types', to_jsonb(s.vehicle_types), 'license', s.license, 'attribution', s.attribution,
      'address', s.address, 'phone', s.phone, 'hours', s.hours, 'fees', s.fees, 'season', s.season,
      'details_source', s.details_source, 'details_checked', s.details_checked),
    'trails', v_trails,
    'reviews', v_reviews,
    'favorite', v_me is not null and exists (select 1 from riding_spot_favorites f where f.user_id = v_me and f.spot_id = s.id));
end;
$$;
revoke execute on function riding_spot_page(uuid) from public;
grant execute on function riding_spot_page(uuid) to anon, authenticated;

-- Write or change your review of a place. Photos must be files in your own folder. Returns its id.
create or replace function save_riding_spot_review(p_spot uuid, p_stars int, p_body text default null, p_photos text[] default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_photos text[] := coalesce(p_photos, '{}');
  v_id uuid;
begin
  if v_me is null then raise exception 'Sign in to review a place.'; end if;
  if not exists (select 1 from riding_spots where id = p_spot and status = 'live') then raise exception 'no such place'; end if;
  if p_stars is null or p_stars not between 1 and 5 then raise exception 'Pick 1 to 5 stars.'; end if;
  if v_body is not null and length(v_body) > 1000 then raise exception 'Keep the review under 1,000 characters.'; end if;
  if cardinality(v_photos) > 4 then raise exception 'Up to 4 photos.'; end if;
  if exists (select 1 from unnest(v_photos) ph where ph is null or ph !~ ('^' || v_me::text || '/[A-Za-z0-9._-]{1,100}$')) then
    raise exception 'bad photo';
  end if;
  if (select count(*) from riding_spot_reviews where user_id = v_me and updated_at > now() - interval '1 day') >= 20 then
    raise exception 'That''s a lot of reviews for one day. Try again tomorrow.';
  end if;
  insert into riding_spot_reviews (spot_id, user_id, stars, body, photos)
  values (p_spot, v_me, p_stars, v_body, v_photos)
  on conflict (spot_id, user_id) do update set
    stars = excluded.stars, body = excluded.body, photos = excluded.photos, updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function save_riding_spot_review(uuid, int, text, text[]) from public, anon;
grant execute on function save_riding_spot_review(uuid, int, text, text[]) to authenticated;

-- Delete your review. Returns its photo paths so the app can remove the files.
create or replace function delete_my_riding_spot_review(p_spot uuid)
returns text[] language plpgsql security definer set search_path = public as $$
declare
  v_photos text[];
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  delete from riding_spot_reviews where spot_id = p_spot and user_id = auth.uid() returning photos into v_photos;
  return coalesce(v_photos, '{}');
end;
$$;
revoke execute on function delete_my_riding_spot_review(uuid) from public, anon;
grant execute on function delete_my_riding_spot_review(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Admin Dashboard > Places to Ride > Reviews: newest first, hide or show one.
-- ---------------------------------------------------------------------------
create or replace function admin_riding_spot_reviews(p_status text default 'live', p_page int default 1, p_size int default 50)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_size int := least(greatest(coalesce(p_size, 50), 1), 200);
begin
  perform require_admin();
  if p_status not in ('all', 'live', 'hidden') then raise exception 'bad status filter'; end if;
  return jsonb_build_object(
    'total', (select count(*) from riding_spot_reviews r where p_status = 'all' or r.status = p_status),
    'counts', (select jsonb_build_object('live', count(*) filter (where status = 'live'), 'hidden', count(*) filter (where status = 'hidden'))
               from riding_spot_reviews),
    'rows', (select coalesce(jsonb_agg(x.j order by x.at desc), '[]'::jsonb) from (
      select jsonb_build_object(
               'id', r.id, 'spot_id', r.spot_id, 'spot_name', s.name, 'stars', r.stars, 'body', r.body, 'photos', to_jsonb(r.photos),
               'status', r.status, 'created_at', r.created_at, 'updated_at', r.updated_at,
               'user_id', r.user_id, 'rider', coalesce(p.display_name, 'Rider'), 'email', u.email) as j,
             r.updated_at as at
      from riding_spot_reviews r
      join riding_spots s on s.id = r.spot_id
      left join profiles p on p.id = r.user_id
      left join auth.users u on u.id = r.user_id
      where p_status = 'all' or r.status = p_status
      order by r.updated_at desc
      limit v_size offset (greatest(coalesce(p_page, 1), 1) - 1) * v_size) x));
end;
$$;
revoke execute on function admin_riding_spot_reviews(text, int, int) from public, anon;
grant execute on function admin_riding_spot_reviews(text, int, int) to authenticated;

create or replace function admin_set_riding_spot_review_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_old text;
begin
  perform require_admin();
  if p_status not in ('live', 'hidden') then raise exception 'bad status'; end if;
  select status into v_old from riding_spot_reviews where id = p_id;
  if not found then raise exception 'no such review'; end if;
  update riding_spot_reviews set status = p_status where id = p_id;
  perform log_admin_action('riding_spot_review.' || p_status, 'riding_spot_review', p_id::text,
    jsonb_build_object('status', v_old), jsonb_build_object('status', p_status));
end;
$$;
revoke execute on function admin_set_riding_spot_review_status(uuid, text) from public, anon;
grant execute on function admin_set_riding_spot_review_status(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. The admin's place list and editor learn the details (same signatures, extra keys).
-- ---------------------------------------------------------------------------
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
               'address', s.address, 'phone', s.phone, 'hours', s.hours, 'fees', s.fees, 'season', s.season,
               'details_source', s.details_source, 'details_checked', s.details_checked,
               'reviews', (select count(*) from riding_spot_reviews r where r.spot_id = s.id and r.status = 'live'),
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

create or replace function admin_save_riding_spot(p_id uuid, p_fields jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  r riding_spots;
  f jsonb := coalesce(p_fields, '{}'::jsonb);
  v_id uuid;
  v_details boolean := f ?| array['address', 'phone', 'hours', 'fees', 'season'];
begin
  perform require_admin();
  if p_id is null then
    insert into riding_spots (source, source_id, name, kind, lat, lng, state, area_name, description, website, status, edited_by_admin, license, attribution,
                              address, phone, hours, fees, season, details_source, details_checked)
    values ('onmylead', gen_random_uuid()::text, btrim(f ->> 'name'), coalesce(f ->> 'kind', 'park'),
            (f ->> 'lat')::double precision, (f ->> 'lng')::double precision, nullif(upper(btrim(f ->> 'state')), ''),
            nullif(btrim(f ->> 'area_name'), ''), nullif(btrim(f ->> 'description'), ''), nullif(btrim(f ->> 'website'), ''),
            coalesce(f ->> 'status', 'live'), true, null, 'OnMyLead',
            nullif(btrim(f ->> 'address'), ''), nullif(btrim(f ->> 'phone'), ''), nullif(btrim(f ->> 'hours'), ''),
            nullif(btrim(f ->> 'fees'), ''), nullif(btrim(f ->> 'season'), ''),
            case when v_details then coalesce(nullif(btrim(f ->> 'details_source'), ''), 'OnMyLead') end,
            case when v_details then current_date end)
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
    address = case when f ? 'address' then nullif(btrim(f ->> 'address'), '') else address end,
    phone = case when f ? 'phone' then nullif(btrim(f ->> 'phone'), '') else phone end,
    hours = case when f ? 'hours' then nullif(btrim(f ->> 'hours'), '') else hours end,
    fees = case when f ? 'fees' then nullif(btrim(f ->> 'fees'), '') else fees end,
    season = case when f ? 'season' then nullif(btrim(f ->> 'season'), '') else season end,
    details_source = case when f ? 'details_source' then nullif(btrim(f ->> 'details_source'), '')
                          when v_details then coalesce(details_source, 'OnMyLead') else details_source end,
    details_checked = case when v_details then current_date else details_checked end,
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

-- ---------------------------------------------------------------------------
-- 7. Storage for review photos: spot-photos/<auth.uid()>/<file>. Public read (unguessable path),
--    writes only into the uploader's own folder; an admin with two-factor can delete any file.
--    Deleting an account removes the folder (_shared/rider-files). Skipped on plain Postgres (CI).
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'storage schema not found; skipping spot-photos bucket';
    return;
  end if;

  insert into storage.buckets (id, name, public)
  values ('spot-photos', 'spot-photos', true)
  on conflict (id) do update set public = true;

  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit') then
    execute $q$update storage.buckets set file_size_limit = 2097152 where id = 'spot-photos'$q$;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    execute $q$update storage.buckets
               set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
               where id = 'spot-photos'$q$;
  end if;

  execute 'drop policy if exists spot_photos_owner_read on storage.objects';
  execute 'drop policy if exists spot_photos_owner_insert on storage.objects';
  execute 'drop policy if exists spot_photos_owner_update on storage.objects';
  execute 'drop policy if exists spot_photos_owner_delete on storage.objects';
  execute 'drop policy if exists spot_photos_admin_read on storage.objects';
  execute 'drop policy if exists spot_photos_admin_delete on storage.objects';

  execute $p$create policy spot_photos_owner_read on storage.objects for select to authenticated
    using (bucket_id = 'spot-photos' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy spot_photos_owner_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'spot-photos' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy spot_photos_owner_update on storage.objects for update to authenticated
    using (bucket_id = 'spot-photos' and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = 'spot-photos' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy spot_photos_owner_delete on storage.objects for delete to authenticated
    using (bucket_id = 'spot-photos' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy spot_photos_admin_read on storage.objects for select to authenticated
    using (bucket_id = 'spot-photos' and is_admin(auth.uid()) and coalesce(auth.jwt() ->> 'aal', '') = 'aal2')$p$;
  execute $p$create policy spot_photos_admin_delete on storage.objects for delete to authenticated
    using (bucket_id = 'spot-photos' and is_admin(auth.uid()) and coalesce(auth.jwt() ->> 'aal', '') = 'aal2')$p$;
end $$;
