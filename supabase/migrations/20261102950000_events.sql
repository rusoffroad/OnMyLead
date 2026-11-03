-- Events (2.0): rallies, poker runs, meetups and ride weekends, with an agenda and their group rides.
--
-- What riders get:
--   * Pro riders create an event: title, details, start and end (up to 31 days), a public meeting
--     place the host picks, an optional website, photos (up to 12) and an agenda (concerts, raffles,
--     poker runs, shows, meals...). Anyone can see a public event in the Events area and open any
--     event from its link, onmylead.com/e/CODE, signed in or not. Unlisted events are link only.
--   * The owner adds co-hosts. Hosts edit the event, add photos and agenda items and link group
--     rides they organize. For each linked ride a host picks a Ride Manager: that rider becomes a
--     Co-Organizer of the ride (invited first if they aren't on it, so nobody is put on a ride
--     without saying yes).
--   * Riders say Going or Interested. Counts are public; names only reach signed-in riders.
--   * Reporting uses the abuse report system (20261102800000): a report from an event page is a
--     report of its owner with reports.event_id and source 'event'. The Admin Dashboard lists
--     events, hides one (it disappears for everyone but its hosts) and removes photos.
--
-- Privacy: an event's place is a public spot chosen by the host, stored rounded to about 100 m.
-- Nothing about any rider's location is read or stored here. Profiles (names) are never returned
-- to signed-out visitors, matching profiles_read.
--
-- Security: every table has row level security with NO policies and no grants; riders only reach
-- events through the security definer functions below, so an unlisted event can't be listed by
-- reading the table.
--
-- Backward compatible: new tables, functions and a storage bucket; reports gets a nullable column
-- and a wider source check (a superset of 20261102900000_social_hub's). admin_set_feature_plan is
-- replaced with the same signature and a longer feature list.

-- ---------------------------------------------------------------------------
-- Pro feature
-- ---------------------------------------------------------------------------
insert into feature_plans (feature, min_plan, free_monthly_allowance) values ('create_events', 'pro', null)
on conflict (feature) do nothing;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists rider_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles (id) on delete cascade,
  share_code text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  title text not null check (char_length(btrim(title)) between 2 and 100),
  details text check (details is null or char_length(details) <= 5000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location_name text not null check (char_length(btrim(location_name)) between 1 and 120),
  location_address text check (location_address is null or char_length(location_address) <= 200),
  area_lat double precision check (area_lat is null or area_lat between -90 and 90),
  area_lng double precision check (area_lng is null or area_lng between -180 and 180),
  area_state text check (area_state is null or area_state ~ '^[A-Z]{2}$'),
  website_url text check (website_url is null or (char_length(website_url) <= 300 and website_url ~* '^https?://[^[:space:]]+$')),
  visibility text not null default 'public' check (visibility in ('public', 'unlisted')),
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  hidden_at timestamptz,
  hidden_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at >= starts_at and ends_at <= starts_at + interval '31 days'),
  check ((area_lat is null) = (area_lng is null))
);
create index if not exists rider_events_upcoming_idx on rider_events (ends_at) where visibility = 'public' and hidden_at is null;
create index if not exists rider_events_owner_idx on rider_events (owner_id);

create table if not exists rider_event_hosts (
  event_id uuid not null references rider_events (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  added_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index if not exists rider_event_hosts_user_idx on rider_event_hosts (user_id);

create table if not exists rider_event_photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references rider_events (id) on delete cascade,
  path text not null unique,
  uploaded_by uuid references profiles (id) on delete set null,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists rider_event_photos_event_idx on rider_event_photos (event_id, sort, created_at);

create table if not exists rider_event_agenda (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references rider_events (id) on delete cascade,
  kind text not null default 'other'
    check (kind in ('ride', 'concert', 'raffle', 'poker_run', 'show', 'contest', 'meal', 'meeting', 'vendor', 'other')),
  title text not null check (char_length(btrim(title)) between 1 and 100),
  starts_at timestamptz not null,
  ends_at timestamptz,
  place text check (place is null or char_length(place) <= 120),
  details text check (details is null or char_length(details) <= 1000),
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);
create index if not exists rider_event_agenda_event_idx on rider_event_agenda (event_id, starts_at);

create table if not exists rider_event_rides (
  event_id uuid not null references rider_events (id) on delete cascade,
  -- A ride belongs to one event at most.
  ride_id uuid not null unique references rides (id) on delete cascade,
  label text check (label is null or char_length(label) <= 60),
  manager_id uuid references profiles (id) on delete set null,
  added_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (event_id, ride_id)
);

create table if not exists rider_event_rsvps (
  event_id uuid not null references rider_events (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  status text not null check (status in ('going', 'interested')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index if not exists rider_event_rsvps_user_idx on rider_event_rsvps (user_id);

alter table rider_events enable row level security;
alter table rider_event_hosts enable row level security;
alter table rider_event_photos enable row level security;
alter table rider_event_agenda enable row level security;
alter table rider_event_rides enable row level security;
alter table rider_event_rsvps enable row level security;
revoke all on rider_events, rider_event_hosts, rider_event_photos, rider_event_agenda, rider_event_rides, rider_event_rsvps
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function is_event_host(p_event uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_user is not null and (
    exists (select 1 from rider_events where id = p_event and owner_id = p_user)
    or exists (select 1 from rider_event_hosts where event_id = p_event and user_id = p_user));
$$;
revoke execute on function is_event_host(uuid, uuid) from public, anon;
grant execute on function is_event_host(uuid, uuid) to authenticated;

-- Hidden events are seen only by their hosts and the admin.
create or replace function event_seen_by(e rider_events, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select e.hidden_at is null or is_event_host(e.id, p_user) or (p_user is not null and is_admin(p_user));
$$;
revoke execute on function event_seen_by(rider_events, uuid) from public, anon, authenticated;

-- An event by its link code or id, for the caller, or an error.
create or replace function event_for_caller(p_code text)
returns rider_events language plpgsql stable security definer set search_path = public as $$
declare e rider_events;
begin
  if p_code ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select * into e from rider_events where id = p_code::uuid;
  else
    select * into e from rider_events where share_code = upper(btrim(coalesce(p_code, '')));
  end if;
  if e.id is null or not event_seen_by(e, auth.uid()) then raise exception 'event not found'; end if;
  return e;
end;
$$;
revoke execute on function event_for_caller(text) from public, anon, authenticated;

create or replace function require_event_host(p_event uuid)
returns rider_events language plpgsql stable security definer set search_path = public as $$
declare e rider_events;
begin
  select * into e from rider_events where id = p_event;
  if e.id is null then raise exception 'event not found'; end if;
  if not is_event_host(p_event, auth.uid()) then raise exception 'only the event''s hosts can do that'; end if;
  return e;
end;
$$;
revoke execute on function require_event_host(uuid) from public, anon, authenticated;

-- Short public names (signed-in callers only).
create or replace function event_person(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when p_user is null or auth.uid() is null then null
    else jsonb_build_object('id', p.id, 'name', coalesce(nullif(btrim(p.display_name), ''), 'Rider')) end
  from profiles p where p.id = p_user;
$$;
revoke execute on function event_person(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Create and edit
-- ---------------------------------------------------------------------------
-- p_id null creates (Pro); otherwise a host edits. Fields: title, details, starts_at, ends_at,
-- location_name, location_address, lat, lng, state, website_url, visibility.
create or replace function save_event(p_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  e rider_events;
  v_starts timestamptz := (p ->> 'starts_at')::timestamptz;
  v_ends timestamptz := coalesce((p ->> 'ends_at')::timestamptz, (p ->> 'starts_at')::timestamptz);
  v_lat double precision := round(((p ->> 'lat')::numeric), 3)::double precision;
  v_lng double precision := round(((p ->> 'lng')::numeric), 3)::double precision;
  v_web text := nullif(btrim(coalesce(p ->> 'website_url', '')), '');
  v_vis text := coalesce(nullif(p ->> 'visibility', ''), 'public');
begin
  if v_me is null then raise exception 'sign in first'; end if;
  if v_starts is null then raise exception 'pick when the event starts'; end if;
  if v_ends < v_starts then raise exception 'the event can''t end before it starts'; end if;
  if v_ends > v_starts + interval '31 days' then raise exception 'an event can last up to 31 days'; end if;
  if v_web is not null and v_web !~* '^https?://' then v_web := 'https://' || v_web; end if;

  if p_id is null then
    perform pro_required(v_me, 'create_events');
    if v_starts < now() - interval '1 day' then raise exception 'pick a start date from today on'; end if;
    -- One at a time per rider, and no more than 20 new events in 30 days.
    perform pg_advisory_xact_lock(hashtextextended('event_create:' || v_me::text, 0));
    if (select count(*) from rider_events where owner_id = v_me and created_at > now() - interval '30 days') >= 20 then
      raise exception 'you''ve created 20 events in the last 30 days. Try again later.';
    end if;
    insert into rider_events (owner_id, title, details, starts_at, ends_at, location_name, location_address,
                              area_lat, area_lng, area_state, website_url, visibility)
    values (v_me, btrim(p ->> 'title'), nullif(btrim(coalesce(p ->> 'details', '')), ''), v_starts, v_ends,
            btrim(coalesce(p ->> 'location_name', '')), nullif(btrim(coalesce(p ->> 'location_address', '')), ''),
            v_lat, v_lng, nullif(upper(btrim(coalesce(p ->> 'state', ''))), ''), v_web, v_vis)
    returning * into e;
    insert into events (user_id, name, props) values (v_me, 'event_created', jsonb_build_object('event_id', e.id, 'visibility', v_vis));
  else
    perform require_event_host(p_id);
    update rider_events set
      title = btrim(p ->> 'title'),
      details = nullif(btrim(coalesce(p ->> 'details', '')), ''),
      starts_at = v_starts, ends_at = v_ends,
      location_name = btrim(coalesce(p ->> 'location_name', '')),
      location_address = nullif(btrim(coalesce(p ->> 'location_address', '')), ''),
      area_lat = v_lat, area_lng = v_lng,
      area_state = nullif(upper(btrim(coalesce(p ->> 'state', ''))), ''),
      website_url = v_web, visibility = v_vis, updated_at = now()
    where id = p_id
    returning * into e;
  end if;
  return jsonb_build_object('id', e.id, 'share_code', e.share_code);
end;
$$;

-- Cancel (or un-cancel) an event. It stays on its link, marked Cancelled.
create or replace function set_event_cancelled(p_event uuid, p_cancelled boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform require_event_host(p_event);
  update rider_events set status = case when p_cancelled then 'cancelled' else 'scheduled' end, updated_at = now()
  where id = p_event;
end;
$$;

-- Delete for good (owner only). Returns the photo files so the app removes them from storage.
-- Linked rides are not deleted; they just stop being part of the event.
create or replace function delete_event(p_event uuid)
returns text[] language plpgsql security definer set search_path = public as $$
declare v_paths text[];
begin
  if not exists (select 1 from rider_events where id = p_event and owner_id = auth.uid()) then
    raise exception 'only the event''s owner can delete it';
  end if;
  select coalesce(array_agg(path), '{}') into v_paths from rider_event_photos where event_id = p_event;
  delete from rider_events where id = p_event;
  return v_paths;
end;
$$;

-- ---------------------------------------------------------------------------
-- Co-hosts
-- ---------------------------------------------------------------------------
create or replace function add_event_host(p_event uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if not exists (select 1 from rider_events where id = p_event and owner_id = v_me) then
    raise exception 'only the event''s owner can add co-hosts';
  end if;
  if p_user is null or p_user = v_me then raise exception 'pick another rider'; end if;
  if not exists (select 1 from profiles where id = p_user) then raise exception 'rider not found'; end if;
  if riders_blocked(v_me, p_user) then raise exception 'rider not found'; end if;
  if (select count(*) from rider_event_hosts where event_id = p_event) >= 10 then
    raise exception 'an event can have up to 10 co-hosts';
  end if;
  insert into rider_event_hosts (event_id, user_id, added_by) values (p_event, p_user, v_me) on conflict do nothing;
end;
$$;

-- The owner removes a co-host, or a co-host steps down.
create or replace function remove_event_host(p_event uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (p_user = auth.uid() or exists (select 1 from rider_events where id = p_event and owner_id = auth.uid())) then
    raise exception 'only the event''s owner can remove co-hosts';
  end if;
  delete from rider_event_hosts where event_id = p_event and user_id = p_user;
end;
$$;

-- ---------------------------------------------------------------------------
-- Photos: event-photos/<event id>/<file>.jpg, up to 12 per event
-- ---------------------------------------------------------------------------
create or replace function add_event_photo(p_event uuid, p_path text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform require_event_host(p_event);
  if p_path is null or char_length(p_path) > 140 or p_path !~ ('^' || p_event::text || '/[A-Za-z0-9._-]{1,80}$') then
    raise exception 'bad photo path';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('event_photo:' || p_event::text, 0));
  if (select count(*) from rider_event_photos where event_id = p_event) >= 12 then
    raise exception 'an event can have up to 12 photos';
  end if;
  insert into rider_event_photos (event_id, path, uploaded_by, sort)
  values (p_event, p_path, auth.uid(), coalesce((select max(sort) + 1 from rider_event_photos where event_id = p_event), 0))
  returning id into v_id;
  return v_id;
end;
$$;

-- Returns the file path so the app deletes the file.
create or replace function remove_event_photo(p_photo uuid)
returns text language plpgsql security definer set search_path = public as $$
declare ph rider_event_photos;
begin
  select * into ph from rider_event_photos where id = p_photo;
  if ph.id is null then raise exception 'photo not found'; end if;
  perform require_event_host(ph.event_id);
  delete from rider_event_photos where id = p_photo;
  return ph.path;
end;
$$;

-- The cover is the first photo.
create or replace function set_event_cover(p_photo uuid)
returns void language plpgsql security definer set search_path = public as $$
declare ph rider_event_photos;
begin
  select * into ph from rider_event_photos where id = p_photo;
  if ph.id is null then raise exception 'photo not found'; end if;
  perform require_event_host(ph.event_id);
  update rider_event_photos set sort = (select min(sort) - 1 from rider_event_photos where event_id = ph.event_id)
  where id = p_photo;
end;
$$;

-- ---------------------------------------------------------------------------
-- Agenda: what's happening and when (concerts, raffles, poker runs...), up to 100 items
-- ---------------------------------------------------------------------------
create or replace function save_event_agenda_item(p_event uuid, p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  e rider_events;
  v_id uuid;
  v_starts timestamptz := (p ->> 'starts_at')::timestamptz;
  v_ends timestamptz := nullif(p ->> 'ends_at', '')::timestamptz;
begin
  e := require_event_host(p_event);
  if v_starts is null then raise exception 'pick a time'; end if;
  -- Within the event's days (a day of slack each side for set-up and travel).
  if v_starts < e.starts_at - interval '1 day' or v_starts > e.ends_at + interval '1 day' then
    raise exception 'pick a time during the event';
  end if;
  if v_ends is not null and v_ends < v_starts then raise exception 'it can''t end before it starts'; end if;
  if p_id is null then
    if (select count(*) from rider_event_agenda where event_id = p_event) >= 100 then
      raise exception 'an agenda can have up to 100 items';
    end if;
    insert into rider_event_agenda (event_id, kind, title, starts_at, ends_at, place, details, created_by)
    values (p_event, coalesce(nullif(p ->> 'kind', ''), 'other'), btrim(coalesce(p ->> 'title', '')), v_starts, v_ends,
            nullif(btrim(coalesce(p ->> 'place', '')), ''), nullif(btrim(coalesce(p ->> 'details', '')), ''), auth.uid())
    returning id into v_id;
  else
    update rider_event_agenda set
      kind = coalesce(nullif(p ->> 'kind', ''), 'other'), title = btrim(coalesce(p ->> 'title', '')),
      starts_at = v_starts, ends_at = v_ends,
      place = nullif(btrim(coalesce(p ->> 'place', '')), ''), details = nullif(btrim(coalesce(p ->> 'details', '')), '')
    where id = p_id and event_id = p_event
    returning id into v_id;
    if v_id is null then raise exception 'agenda item not found'; end if;
  end if;
  update rider_events set updated_at = now() where id = p_event;
  return v_id;
end;
$$;

create or replace function delete_event_agenda_item(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_event uuid;
begin
  select event_id into v_event from rider_event_agenda where id = p_id;
  if v_event is null then raise exception 'agenda item not found'; end if;
  perform require_event_host(v_event);
  delete from rider_event_agenda where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Group rides of the event, and their Ride Managers
-- ---------------------------------------------------------------------------
-- A host links a ride they organize (or co-organize). Up to 30 rides per event.
create or replace function link_event_ride(p_event uuid, p_ride uuid, p_label text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_status ride_status;
begin
  perform require_event_host(p_event);
  select status into v_status from rides where id = p_ride;
  if v_status is null then raise exception 'ride not found'; end if;
  if not is_ride_manager(p_ride, v_me) then raise exception 'you can add rides you organize'; end if;
  if v_status in ('ended', 'cancelled') then raise exception 'ride is %', v_status; end if;
  if exists (select 1 from rider_event_rides where ride_id = p_ride and event_id <> p_event) then
    raise exception 'that ride is already part of another event';
  end if;
  if (select count(*) from rider_event_rides where event_id = p_event) >= 30 then
    raise exception 'an event can have up to 30 rides';
  end if;
  insert into rider_event_rides (event_id, ride_id, label, added_by)
  values (p_event, p_ride, nullif(btrim(coalesce(p_label, '')), ''), v_me)
  on conflict (event_id, ride_id) do update set label = excluded.label;
end;
$$;

-- A host of the event or an organizer of the ride takes it off the event. The ride stays.
create or replace function unlink_event_ride(p_event uuid, p_ride uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (is_event_host(p_event, auth.uid()) or is_ride_manager(p_ride, auth.uid())) then
    raise exception 'only the event''s hosts can do that';
  end if;
  delete from rider_event_rides where event_id = p_event and ride_id = p_ride;
end;
$$;

-- A host who organizes the ride names its Ride Manager (null clears it). The manager becomes a
-- Co-Organizer of the ride: right away if they're already on it, otherwise once they accept the
-- invitation this sends (the existing invite push). The previous manager goes back to Rider.
create or replace function set_event_ride_manager(p_event uuid, p_ride uuid, p_user uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_link rider_event_rides;
  v_organizer uuid;
  v_member ride_members;
  v_result text := 'cleared';
begin
  perform require_event_host(p_event);
  select * into v_link from rider_event_rides where event_id = p_event and ride_id = p_ride for update;
  if v_link.ride_id is null then raise exception 'that ride isn''t part of this event'; end if;
  if not is_ride_manager(p_ride, v_me) then raise exception 'only the ride''s organizers can pick its manager'; end if;
  select organizer_id into v_organizer from rides where id = p_ride;

  if p_user is not null then
    if not exists (select 1 from profiles where id = p_user) or riders_blocked(v_me, p_user) then
      raise exception 'rider not found';
    end if;
  end if;

  -- The old manager steps back to Rider (never the ride's organizer).
  if v_link.manager_id is not null and v_link.manager_id is distinct from p_user and v_link.manager_id <> v_organizer then
    update ride_members set role = 'rider'
    where ride_id = p_ride and user_id = v_link.manager_id and role = 'co_organizer';
  end if;

  if p_user is not null and p_user <> v_organizer then
    select * into v_member from ride_members where ride_id = p_ride and user_id = p_user for update;
    if v_member.user_id is null then
      insert into ride_members (ride_id, user_id, status, role) values (p_ride, p_user, 'invited', 'co_organizer');
      v_result := 'invited';
    elsif v_member.status in ('cancelled', 'declined') then
      update ride_members set status = 'invited', role = 'co_organizer', left_at = null, created_at = now()
      where ride_id = p_ride and user_id = p_user;
      v_result := 'invited';
    else
      update ride_members set role = 'co_organizer' where ride_id = p_ride and user_id = p_user;
      v_result := case when v_member.status = 'joined' then 'manager' else 'invited' end;
    end if;
  elsif p_user is not null then
    v_result := 'manager';
  end if;

  update rider_event_rides set manager_id = p_user where event_id = p_event and ride_id = p_ride;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Going / Interested
-- ---------------------------------------------------------------------------
create or replace function rsvp_event(p_event uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare e rider_events;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  e := event_for_caller(p_event::text);
  if p_status is null or p_status = '' then
    delete from rider_event_rsvps where event_id = p_event and user_id = auth.uid();
    return;
  end if;
  if p_status not in ('going', 'interested') then raise exception 'pick Going or Interested'; end if;
  if e.status = 'cancelled' then raise exception 'this event was cancelled'; end if;
  insert into rider_event_rsvps (event_id, user_id, status) values (p_event, auth.uid(), p_status)
  on conflict (event_id, user_id) do update set status = excluded.status;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------
-- One event page, by link code or id. Works signed out (names left out).
create or replace function event_detail(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  e rider_events;
  v_host boolean;
begin
  e := event_for_caller(p_code);
  v_host := is_event_host(e.id, v_me);
  return jsonb_build_object(
    'id', e.id, 'share_code', e.share_code, 'title', e.title, 'details', e.details,
    'starts_at', e.starts_at, 'ends_at', e.ends_at,
    'location_name', e.location_name, 'location_address', e.location_address,
    'lat', e.area_lat, 'lng', e.area_lng, 'state', e.area_state, 'website_url', e.website_url,
    'visibility', e.visibility, 'status', e.status, 'hidden', e.hidden_at is not null,
    'hidden_reason', case when v_host then e.hidden_reason end,
    'created_at', e.created_at, 'updated_at', e.updated_at,
    'am_owner', v_me is not null and e.owner_id = v_me,
    'am_host', v_host,
    'owner', event_person(e.owner_id),
    'hosts', case when v_me is null then '[]'::jsonb else coalesce((
      select jsonb_agg(event_person(h.user_id) order by h.created_at)
      from rider_event_hosts h where h.event_id = e.id and not riders_blocked(v_me, h.user_id)), '[]') end,
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object('id', ph.id, 'path', ph.path) order by ph.sort, ph.created_at)
      from rider_event_photos ph where ph.event_id = e.id), '[]'),
    'agenda', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind, 'title', a.title, 'starts_at', a.starts_at,
               'ends_at', a.ends_at, 'place', a.place, 'details', a.details) order by a.starts_at, a.created_at)
      from rider_event_agenda a where a.event_id = e.id), '[]'),
    'rides', coalesce((
      select jsonb_agg(x.j order by x.meet_at) from (
        select r.meet_at, jsonb_build_object(
          'ride_id', r.id, 'name', r.name, 'meet_at', r.meet_at, 'status', r.status, 'label', er.label,
          'meet_area_label', r.meet_area_label, 'visibility', r.visibility, 'join_policy', r.join_policy,
          'route_miles', r.route_miles, 'difficulty', r.difficulty,
          -- A private ride's code is its invitation: only its riders and the event's hosts get it.
          'invite_code', case when r.visibility <> 'private' or v_host or is_ride_member(r.id, v_me, '{joined,pending,waitlisted,invited}')
                              or r.organizer_id = v_me then r.invite_code end,
          'going', (select coalesce(sum(m.riders), 0) from ride_members m where m.ride_id = r.id and m.status = 'joined'),
          'manager', event_person(er.manager_id),
          'my_status', (select m.status from ride_members m where m.ride_id = r.id and m.user_id = v_me),
          'i_manage', v_me is not null and is_ride_manager(r.id, v_me)) as j
        from rider_event_rides er join rides r on r.id = er.ride_id
        -- Every linked ride is listed (name, time, area); a private one just has no code.
        where er.event_id = e.id
      ) x), '[]'),
    'rsvp', jsonb_build_object(
      'going', (select count(*) from rider_event_rsvps where event_id = e.id and status = 'going'),
      'interested', (select count(*) from rider_event_rsvps where event_id = e.id and status = 'interested'),
      'mine', (select status from rider_event_rsvps where event_id = e.id and user_id = v_me)),
    'going_riders', case when v_me is null then '[]'::jsonb else coalesce((
      select jsonb_agg(event_person(x.user_id) order by x.created_at) from (
        select v.user_id, v.created_at from rider_event_rsvps v
        where v.event_id = e.id and v.status = 'going' and not riders_blocked(v_me, v.user_id)
        order by v.created_at limit 60) x), '[]') end);
end;
$$;

-- The Events area: 'upcoming' (public events not over yet, nearest first when a spot and radius
-- are given) or 'mine' (hosting, going or interested, any visibility, incl. the last 30 days).
create or replace function events_list(p_scope text default 'upcoming', p_lat double precision default null,
                                       p_lng double precision default null, p_miles int default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  return coalesce((
    select jsonb_agg(x.j order by x.ord, x.starts_at) from (
      select e.starts_at,
        case when p_scope = 'mine' and e.ends_at < now() then 1 else 0 end as ord,
        jsonb_build_object(
          'id', e.id, 'share_code', e.share_code, 'title', e.title, 'starts_at', e.starts_at, 'ends_at', e.ends_at,
          'location_name', e.location_name, 'state', e.area_state, 'lat', e.area_lat, 'lng', e.area_lng,
          'status', e.status, 'visibility', e.visibility, 'hidden', e.hidden_at is not null,
          'cover_path', (select ph.path from rider_event_photos ph where ph.event_id = e.id order by ph.sort, ph.created_at limit 1),
          'going', (select count(*) from rider_event_rsvps v where v.event_id = e.id and v.status = 'going'),
          'rides', (select count(*) from rider_event_rides er where er.event_id = e.id),
          'agenda', (select count(*) from rider_event_agenda a where a.event_id = e.id),
          'mine', (select v.status from rider_event_rsvps v where v.event_id = e.id and v.user_id = v_me),
          'i_host', is_event_host(e.id, v_me),
          'distance_mi', case when p_lat is not null and p_lng is not null and e.area_lat is not null then
            round((3958.8 * 2 * asin(sqrt(power(sin(radians(e.area_lat - p_lat) / 2), 2)
              + cos(radians(p_lat)) * cos(radians(e.area_lat)) * power(sin(radians(e.area_lng - p_lng) / 2), 2))))::numeric) end
        ) as j
      from rider_events e
      where case when p_scope = 'mine' then
              v_me is not null and e.ends_at > now() - interval '30 days' and event_seen_by(e, v_me)
              and (is_event_host(e.id, v_me) or exists (select 1 from rider_event_rsvps v where v.event_id = e.id and v.user_id = v_me))
            else
              e.visibility = 'public' and e.hidden_at is null and e.status = 'scheduled' and e.ends_at > now()
              and (v_me is null or not riders_blocked(v_me, e.owner_id))
              and (p_miles is null or p_miles <= 0 or p_lat is null or p_lng is null or (e.area_lat is not null and
                3958.8 * 2 * asin(sqrt(power(sin(radians(e.area_lat - p_lat) / 2), 2)
                  + cos(radians(p_lat)) * cos(radians(e.area_lat)) * power(sin(radians(e.area_lng - p_lng) / 2), 2))) <= p_miles))
            end
      order by e.starts_at
      limit 200
    ) x), '[]');
end;
$$;

-- The event a ride belongs to, for the "Part of" banner on the ride page.
create or replace function event_for_ride(p_ride uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', e.id, 'share_code', e.share_code, 'title', e.title, 'label', er.label,
                            'starts_at', e.starts_at, 'ends_at', e.ends_at)
  from rider_event_rides er join rider_events e on e.id = er.event_id
  where er.ride_id = p_ride and event_seen_by(e, auth.uid());
$$;

-- Rides the caller organizes that could be added to an event (upcoming, not in another event).
create or replace function event_linkable_rides(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform require_event_host(p_event);
  return coalesce((
    select jsonb_agg(jsonb_build_object('ride_id', r.id, 'name', r.name, 'meet_at', r.meet_at, 'visibility', r.visibility,
                                       'meet_area_label', r.meet_area_label) order by r.meet_at)
    from rides r
    where r.status in ('scheduled', 'live') and is_ride_manager(r.id, auth.uid())
      and not exists (select 1 from rider_event_rides er where er.ride_id = r.id)), '[]');
end;
$$;

revoke execute on function save_event(uuid, jsonb), set_event_cancelled(uuid, boolean), delete_event(uuid),
  add_event_host(uuid, uuid), remove_event_host(uuid, uuid), add_event_photo(uuid, text), remove_event_photo(uuid),
  set_event_cover(uuid), save_event_agenda_item(uuid, uuid, jsonb), delete_event_agenda_item(uuid),
  link_event_ride(uuid, uuid, text), unlink_event_ride(uuid, uuid), set_event_ride_manager(uuid, uuid, uuid),
  rsvp_event(uuid, text), event_detail(text), events_list(text, double precision, double precision, int),
  event_for_ride(uuid), event_linkable_rides(uuid) from public, anon;
grant execute on function save_event(uuid, jsonb), set_event_cancelled(uuid, boolean), delete_event(uuid),
  add_event_host(uuid, uuid), remove_event_host(uuid, uuid), add_event_photo(uuid, text), remove_event_photo(uuid),
  set_event_cover(uuid), save_event_agenda_item(uuid, uuid, jsonb), delete_event_agenda_item(uuid),
  link_event_ride(uuid, uuid, text), unlink_event_ride(uuid, uuid), set_event_ride_manager(uuid, uuid, uuid),
  rsvp_event(uuid, text), event_detail(text), events_list(text, double precision, double precision, int),
  event_for_ride(uuid), event_linkable_rides(uuid) to authenticated;
-- Signed-out visitors (the website and link previews) can read events.
grant execute on function event_detail(text), events_list(text, double precision, double precision, int), event_for_ride(uuid) to anon;

-- ---------------------------------------------------------------------------
-- Reporting an event (the abuse report system)
-- ---------------------------------------------------------------------------
alter table reports add column if not exists event_id uuid references rider_events (id) on delete set null;
grant insert (event_id) on reports to authenticated;
alter table reports drop constraint if exists reports_source_check;
alter table reports add constraint reports_source_check check (source is null or source in
  ('dm', 'group_chat', 'ride_chat', 'ride', 'roster', 'out_riding', 'you', 'post', 'comment', 'profile', 'event'));

-- A report sent from an event page is a report of its owner; the server fills that in so it
-- can't point at someone else, and the dashboard shows which event.
create or replace function reports_event_fill()
returns trigger language plpgsql security definer set search_path = public as $$
declare e rider_events;
begin
  if new.event_id is null then return new; end if;
  select * into e from rider_events where id = new.event_id;
  if e.id is null then raise exception 'event not found'; end if;
  new.kind := 'rider';
  new.reported_user_id := e.owner_id;
  new.source := 'event';
  new.details := left('Event: ' || e.title || ' (onmylead.com/e/' || e.share_code || ')'
                      || coalesce(E'\n' || nullif(btrim(new.details), ''), ''), 1000);
  return new;
end;
$$;
revoke execute on function reports_event_fill() from public, anon, authenticated;
drop trigger if exists b_reports_event_fill on reports;
create trigger b_reports_event_fill before insert on reports for each row execute function reports_event_fill();

-- ---------------------------------------------------------------------------
-- Admin Dashboard
-- ---------------------------------------------------------------------------
create or replace function admin_events(p_filter text default 'all', p_page int default 0, p_page_size int default 50)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_rows jsonb; v_total bigint;
begin
  perform require_admin();
  p_page_size := least(greatest(coalesce(p_page_size, 50), 1), 200);
  p_page := greatest(coalesce(p_page, 0), 0);
  with f as (
    select e.id, e.share_code, e.title, e.starts_at, e.ends_at, e.location_name, e.area_state as state, e.visibility,
           e.status, e.hidden_at, e.hidden_reason, e.created_at, e.owner_id, p.display_name as owner_name,
           (select count(*) from rider_event_rsvps v where v.event_id = e.id and v.status = 'going') as going,
           (select count(*) from rider_event_rides er where er.event_id = e.id) as rides,
           (select count(*) from rider_event_photos ph where ph.event_id = e.id) as photos,
           (select count(*) from reports x where x.event_id = e.id) as reports,
           (select count(*) from reports x where x.event_id = e.id and x.status in ('open', 'reviewing')) as open_reports
    from rider_events e left join profiles p on p.id = e.owner_id
    where case coalesce(p_filter, 'all')
      when 'reported' then exists (select 1 from reports x where x.event_id = e.id)
      when 'hidden' then e.hidden_at is not null
      when 'upcoming' then e.ends_at > now()
      else true end
  )
  select (select count(*) from f),
         coalesce((select jsonb_agg(to_jsonb(x) order by x.open_reports desc, x.created_at desc) from (
           select * from f order by open_reports desc, created_at desc offset p_page * p_page_size limit p_page_size) x), '[]')
    into v_total, v_rows;
  return jsonb_build_object('rows', v_rows, 'total', v_total);
end;
$$;

-- Hide (or show again) an event. Hidden: gone from the Events area and its link for everyone but its hosts.
create or replace function admin_set_event_hidden(p_event uuid, p_hidden boolean, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  perform require_admin();
  if p_hidden and length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'a reason is required'; end if;
  select jsonb_build_object('hidden_at', hidden_at, 'hidden_reason', hidden_reason) into v_before
  from rider_events where id = p_event for update;
  if v_before is null then raise exception 'event not found'; end if;
  update rider_events set hidden_at = case when p_hidden then now() end,
                          hidden_reason = case when p_hidden then btrim(p_reason) end
  where id = p_event;
  perform log_admin_action(case when p_hidden then 'event.hide' else 'event.unhide' end, 'event', p_event::text,
          v_before, jsonb_build_object('reason', nullif(btrim(coalesce(p_reason, '')), '')));
end;
$$;

-- Take down one photo. Returns the path; the dashboard deletes the file (admin storage policy).
create or replace function admin_remove_event_photo(p_photo uuid, p_reason text)
returns text language plpgsql security definer set search_path = public as $$
declare ph rider_event_photos;
begin
  perform require_admin();
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'a reason is required'; end if;
  select * into ph from rider_event_photos where id = p_photo;
  if ph.id is null then raise exception 'photo not found'; end if;
  delete from rider_event_photos where id = p_photo;
  perform log_admin_action('event_photo.remove', 'event', ph.event_id::text,
          jsonb_build_object('path', ph.path), jsonb_build_object('reason', btrim(p_reason)));
  return ph.path;
end;
$$;

revoke execute on function admin_events(text, int, int), admin_set_event_hidden(uuid, boolean, text),
  admin_remove_event_photo(uuid, text) from public, anon;
grant execute on function admin_events(text, int, int), admin_set_event_hidden(uuid, boolean, text),
  admin_remove_event_photo(uuid, text) to authenticated;

-- Admin > Settings can make Events free or Pro, like the other Pro features. Same signature;
-- the list also keeps 'social_posts' (20261102900000_social_hub) so the order of the two doesn't matter.
create or replace function admin_set_feature_plan(p_feature text, p_min_plan text, p_allowance int default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb;
begin
  perform require_admin();
  if p_feature not in ('create_ride', 'import_gpx', 'offline_maps', 'saved_groups', 'create_poll', 'ride_history',
                       'advanced_trip_planning', 'advanced_stats', 'premium_ride_cards',
                       'record_trails', 'share_trails', 'trail_rides', 'social_posts', 'create_events') then
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

-- ---------------------------------------------------------------------------
-- Storage: event-photos/<event id>/<file>. Public read (unguessable names), hosts write,
-- the admin (two-factor) deletes. Skipped on plain Postgres (CI).
-- ---------------------------------------------------------------------------
create or replace function can_edit_event_folder(p_folder text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_folder ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and is_event_host(p_folder::uuid, auth.uid());
$$;
revoke execute on function can_edit_event_folder(text) from public, anon;
grant execute on function can_edit_event_folder(text) to authenticated;

do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'storage schema not found; skipping event-photos bucket';
    return;
  end if;

  insert into storage.buckets (id, name, public) values ('event-photos', 'event-photos', true)
  on conflict (id) do update set public = true;
  -- The app uploads a JPEG up to 1600 px wide of about 150-400 KB; 3 MB leaves room.
  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit') then
    execute $q$update storage.buckets set file_size_limit = 3145728 where id = 'event-photos'$q$;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    execute $q$update storage.buckets set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'] where id = 'event-photos'$q$;
  end if;

  execute 'drop policy if exists event_photos_host_read on storage.objects';
  execute 'drop policy if exists event_photos_host_insert on storage.objects';
  execute 'drop policy if exists event_photos_host_delete on storage.objects';
  execute 'drop policy if exists event_photos_admin_read on storage.objects';
  execute 'drop policy if exists event_photos_admin_delete on storage.objects';
  execute $p$create policy event_photos_host_read on storage.objects for select to authenticated
    using (bucket_id = 'event-photos' and can_edit_event_folder((storage.foldername(name))[1]))$p$;
  execute $p$create policy event_photos_host_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'event-photos' and can_edit_event_folder((storage.foldername(name))[1]))$p$;
  execute $p$create policy event_photos_host_delete on storage.objects for delete to authenticated
    using (bucket_id = 'event-photos' and can_edit_event_folder((storage.foldername(name))[1]))$p$;
  execute $p$create policy event_photos_admin_read on storage.objects for select to authenticated
    using (bucket_id = 'event-photos' and is_admin(auth.uid()) and coalesce(auth.jwt() ->> 'aal', '') = 'aal2')$p$;
  execute $p$create policy event_photos_admin_delete on storage.objects for delete to authenticated
    using (bucket_id = 'event-photos' and is_admin(auth.uid()) and coalesce(auth.jwt() ->> 'aal', '') = 'aal2')$p$;
end $$;
