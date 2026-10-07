-- Group ride app: initial schema.
-- Privacy rules enforced here, not just in the app:
--   * Exact meeting points live in ride_private_details, readable only by joined riders.
--   * Live positions are readable only while the owner has an active, unexpired share
--     that covers the viewer.
--   * Every feature is free today; feature_plans maps features to plans so pricing can
--     change later without a rebuild.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type vehicle_kind as enum ('vehicle', 'sxs_utv');
create type ride_visibility as enum ('public', 'unlisted', 'private');
create type join_policy as enum ('open', 'approval', 'invite_only');
create type ride_status as enum ('scheduled', 'live', 'ended', 'cancelled');
create type member_status as enum ('joined', 'pending', 'waitlisted', 'invited', 'declined', 'cancelled');
create type member_role as enum ('organizer', 'co_organizer', 'leader', 'sweep', 'rider');
create type share_scope as enum ('ride', 'personal');
create type rider_status_kind as enum (
  'ok', 'stopped', 'need_fuel', 'mechanical', 'flat_tire', 'stuck', 'lost', 'need_help', 'emergency'
);
create type message_kind as enum ('chat', 'announcement', 'status');

-- ---------------------------------------------------------------------------
-- People and machines
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  photo_url text,
  experience_level text check (experience_level in ('beginner', 'intermediate', 'advanced', 'expert')),
  riding_types text[] not null default '{}',
  region text,
  emergency_contact_name text,
  emergency_contact_phone text,
  created_at timestamptz not null default now()
);

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles (id) on delete cascade,
  kind vehicle_kind not null,
  year int check (year between 1900 and 2100),
  make text,
  model text,
  trim text,
  vin text,
  nickname text,
  photo_url text,
  seats int check (seats between 1 and 12),
  engine_hours numeric,
  odometer_miles numeric,
  tank_gallons numeric check (tank_gallons >= 0),
  extra_fuel_gallons numeric not null default 0 check (extra_fuel_gallons >= 0),
  mpg numeric check (mpg >= 0),
  purchase_price_cents bigint check (purchase_price_cents >= 0),
  created_at timestamptz not null default now()
);
create index on vehicles (owner_id);

create table vehicle_items (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles (id) on delete cascade,
  area text not null check (area in (
    'wheels_tires', 'suspension', 'protection', 'roof_cab', 'lighting', 'audio_comms',
    'electronics', 'storage_mounts', 'recovery', 'performance', 'other'
  )),
  name text not null,
  brand text,
  cost_cents bigint check (cost_cents >= 0),
  installed_on date,
  notes text,
  photo_url text,
  rus_product_id text,
  created_at timestamptz not null default now()
);
create index on vehicle_items (vehicle_id);

-- ---------------------------------------------------------------------------
-- Rides
-- ---------------------------------------------------------------------------
create table rides (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references profiles (id) on delete cascade,
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  name text not null check (length(name) between 1 and 120),
  description text,
  cover_url text,
  meet_at timestamptz not null,
  depart_at timestamptz,
  expected_finish_at timestamptz,
  -- Public, rounded meeting area (about a mile). The exact pin is in ride_private_details.
  meet_area_lat double precision not null,
  meet_area_lng double precision not null,
  meet_area_label text,
  destination_label text,
  vehicle_types text[] not null default '{}',
  difficulty text check (difficulty in ('easy', 'moderate', 'hard', 'extreme')),
  experience_level text check (experience_level in ('beginner', 'intermediate', 'advanced', 'expert')),
  max_riders int check (max_riders > 0),
  max_vehicles int check (max_vehicles > 0),
  what_to_bring text,
  required_equipment text,
  fuel_notes text,
  route_miles numeric check (route_miles >= 0),
  visibility ride_visibility not null default 'unlisted',
  join_policy join_policy not null default 'open',
  bubble_preset text not null default 'default'
    check (bubble_preset in ('default', 'tight_trail', 'desert', 'highway', 'custom')),
  bubble_settings jsonb,
  status ride_status not null default 'scheduled',
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
create index on rides (visibility, meet_at) where status in ('scheduled', 'live');
create index on rides (organizer_id);

create table ride_private_details (
  ride_id uuid primary key references rides (id) on delete cascade,
  meet_lat double precision not null,
  meet_lng double precision not null,
  meet_label text,
  instructions text,
  route_geojson jsonb,
  waypoints jsonb not null default '[]'
);

create table ride_members (
  ride_id uuid not null references rides (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  status member_status not null,
  role member_role not null default 'rider',
  vehicle_id uuid references vehicles (id) on delete set null,
  riders int not null default 1 check (riders between 1 and 12),
  vehicles int not null default 1 check (vehicles in (0, 1)),
  checked_in_at timestamptz,
  left_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (ride_id, user_id)
);
create index on ride_members (user_id);

-- ---------------------------------------------------------------------------
-- Location sharing
-- ---------------------------------------------------------------------------
create table location_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  scope share_scope not null,
  ride_id uuid references rides (id) on delete cascade,
  started_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  -- Read-only link for people without the app (family sharing). Null when not issued.
  link_token text unique,
  check ((scope = 'ride') = (ride_id is not null)),
  -- Personal shares always end; "until I turn it off" is capped at 24 hours by the app.
  check (scope = 'ride' or expires_at is not null)
);
create index on location_shares (user_id);

create table location_share_recipients (
  share_id uuid not null references location_shares (id) on delete cascade,
  recipient_id uuid not null references profiles (id) on delete cascade,
  primary key (share_id, recipient_id)
);

-- Latest point per user. Live map and Ride Bubble read this; history is in ride_tracks.
create table positions_latest (
  user_id uuid primary key references profiles (id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  speed_mps real,
  heading_deg real,
  accuracy_m real,
  last_moved_at timestamptz,
  recorded_at timestamptz not null
);

create table ride_tracks (
  ride_id uuid not null references rides (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  -- [[lng, lat, epochSeconds, speedMps], ...] uploaded in batches, including points
  -- recorded offline.
  points jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  primary key (ride_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Ride Mode
-- ---------------------------------------------------------------------------
create table rider_statuses (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references rides (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  status rider_status_kind not null,
  lat double precision,
  lng double precision,
  -- When the rider tapped it; may be earlier than created_at if sent after reconnecting.
  tapped_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index on rider_statuses (ride_id, created_at desc);

create table regroup_points (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references rides (id) on delete cascade,
  created_by uuid not null references profiles (id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  label text,
  created_at timestamptz not null default now(),
  cleared_at timestamptz
);
create index on regroup_points (ride_id);

create table ride_messages (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references rides (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  kind message_kind not null default 'chat',
  body text not null check (length(body) between 1 and 2000),
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index on ride_messages (ride_id, created_at);

-- ---------------------------------------------------------------------------
-- Monetization readiness and instrumentation
-- ---------------------------------------------------------------------------
create table feature_plans (
  feature text primary key,
  -- Lowest plan that includes the feature. 'free' for everything at launch except the
  -- AI assistant, which ships as Rider Pro with a free monthly allowance.
  min_plan text not null check (min_plan in ('free', 'rider_pro', 'organizer_pro', 'club_pro')),
  free_monthly_allowance int
);
insert into feature_plans (feature, min_plan, free_monthly_allowance) values
  ('create_ride', 'free', null),
  ('ride_mode', 'free', null),
  ('personal_share', 'free', null),
  ('family_link', 'free', null),
  ('garage', 'free', null),
  ('trip_planner', 'free', null),
  ('starlink', 'free', null),
  ('ai_assistant', 'rider_pro', 5);

create table subscriptions (
  user_id uuid primary key references profiles (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'rider_pro', 'organizer_pro', 'club_pro')),
  renews_at timestamptz,
  store text check (store in ('apple', 'google', 'web')),
  updated_at timestamptz not null default now()
);

-- Product analytics. Never store precise location here.
create table events (
  id bigint generated always as identity primary key,
  user_id uuid references profiles (id) on delete set null,
  name text not null,
  props jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on events (name, created_at);

-- ---------------------------------------------------------------------------
-- Helper functions (security definer so RLS policies can call them without recursion)
-- ---------------------------------------------------------------------------
create or replace function is_ride_member(p_ride uuid, p_user uuid, p_statuses member_status[] default '{joined}')
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from ride_members
    where ride_id = p_ride and user_id = p_user and status = any (p_statuses)
  );
$$;

create or replace function is_ride_manager(p_ride uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from rides where id = p_ride and organizer_id = p_user)
      or exists (
        select 1 from ride_members
        where ride_id = p_ride and user_id = p_user and status = 'joined' and role in ('organizer', 'co_organizer')
      );
$$;

create or replace function share_is_active(s location_shares)
returns boolean language sql stable security definer set search_path = public as $$
  select s.revoked_at is null
     and (s.expires_at is null or s.expires_at > now())
     and s.started_at <= now()
     and (
       s.scope = 'personal'
       or exists (
         select 1 from rides r join ride_members m on m.ride_id = r.id
         where r.id = s.ride_id and r.status <> 'ended' and r.status <> 'cancelled'
           and m.user_id = s.user_id and m.status = 'joined' and m.left_at is null
       )
     );
$$;

-- Share ownership checks used by policies on both share tables (avoids policy recursion).
create or replace function owns_share(p_share uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from location_shares where id = p_share and user_id = p_user);
$$;

create or replace function receives_share(p_share uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from location_share_recipients where share_id = p_share and recipient_id = p_user);
$$;

-- Can p_viewer see p_owner's live location right now?
create or replace function can_see_location(p_owner uuid, p_viewer uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_owner = p_viewer or exists (
    select 1 from location_shares s
    where s.user_id = p_owner and share_is_active(s) and (
      (s.scope = 'ride' and is_ride_member(s.ride_id, p_viewer))
      or (s.scope = 'personal' and exists (
        select 1 from location_share_recipients rc where rc.share_id = s.id and rc.recipient_id = p_viewer
      ))
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;
alter table vehicles enable row level security;
alter table vehicle_items enable row level security;
alter table rides enable row level security;
alter table ride_private_details enable row level security;
alter table ride_members enable row level security;
alter table location_shares enable row level security;
alter table location_share_recipients enable row level security;
alter table positions_latest enable row level security;
alter table ride_tracks enable row level security;
alter table rider_statuses enable row level security;
alter table regroup_points enable row level security;
alter table ride_messages enable row level security;
alter table feature_plans enable row level security;
alter table subscriptions enable row level security;
alter table events enable row level security;

-- Profiles are visible to signed-in users (name, photo, experience); emergency contact
-- columns are only exposed through the owner's own queries via the app.
create policy profiles_read on profiles for select to authenticated using (true);
create policy profiles_write on profiles for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Garage: owner manages; riders on a shared ride can see the vehicle lineup.
create policy vehicles_owner on vehicles for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy vehicles_ride_lineup on vehicles for select to authenticated using (
  exists (
    select 1 from ride_members m
    where m.vehicle_id = vehicles.id and m.status = 'joined' and is_ride_member(m.ride_id, auth.uid())
  )
);
create policy vehicle_items_owner on vehicle_items for all to authenticated
  using (exists (select 1 from vehicles v where v.id = vehicle_id and v.owner_id = auth.uid()))
  with check (exists (select 1 from vehicles v where v.id = vehicle_id and v.owner_id = auth.uid()));

-- Rides: public and unlisted ride pages are readable by anyone with the id (including
-- signed-out link previews); discovery queries filter to public. Private rides only for
-- members and invitees.
create policy rides_read on rides for select to anon, authenticated using (
  visibility in ('public', 'unlisted')
  or organizer_id = auth.uid()
  or is_ride_member(id, auth.uid(), '{joined,pending,waitlisted,invited}')
);
create policy rides_insert on rides for insert to authenticated with check (organizer_id = auth.uid());
create policy rides_update on rides for update to authenticated
  using (is_ride_manager(id, auth.uid())) with check (is_ride_manager(id, auth.uid()));
create policy rides_delete on rides for delete to authenticated using (organizer_id = auth.uid());

create policy private_details_read on ride_private_details for select to authenticated using (
  is_ride_member(ride_id, auth.uid()) or is_ride_manager(ride_id, auth.uid())
);
create policy private_details_write on ride_private_details for all to authenticated
  using (is_ride_manager(ride_id, auth.uid())) with check (is_ride_manager(ride_id, auth.uid()));

-- Members: joined riders see the roster; managers see everyone incl. pending and waitlist.
-- Joining and leaving go through join_ride / leave_ride so caps and waitlists hold.
create policy members_read on ride_members for select to authenticated using (
  user_id = auth.uid() or is_ride_member(ride_id, auth.uid()) or is_ride_manager(ride_id, auth.uid())
);
create policy members_manage on ride_members for update to authenticated
  using (is_ride_manager(ride_id, auth.uid())) with check (is_ride_manager(ride_id, auth.uid()));

-- Shares: owners manage their own; recipients can see shares addressed to them.
create policy shares_owner on location_shares for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy shares_recipient on location_shares for select to authenticated
  using (receives_share(id, auth.uid()));
create policy share_recipients_owner on location_share_recipients for all to authenticated
  using (owns_share(share_id, auth.uid())) with check (owns_share(share_id, auth.uid()));
create policy share_recipients_self on location_share_recipients for select to authenticated
  using (recipient_id = auth.uid());

-- Positions: write your own only while sharing; read only what a share allows.
create policy positions_read on positions_latest for select to authenticated
  using (can_see_location(user_id, auth.uid()));
create policy positions_write on positions_latest for insert to authenticated with check (
  user_id = auth.uid() and exists (select 1 from location_shares s where s.user_id = auth.uid() and share_is_active(s))
);
create policy positions_update on positions_latest for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from location_shares s where s.user_id = auth.uid() and share_is_active(s)));
create policy positions_delete on positions_latest for delete to authenticated using (user_id = auth.uid());

-- Tracks: the rider owns their own track; joined riders see tracks for the post-ride summary.
create policy tracks_owner on ride_tracks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and is_ride_member(ride_id, auth.uid()));
create policy tracks_ride on ride_tracks for select to authenticated using (is_ride_member(ride_id, auth.uid()));

-- Ride Mode tables: joined riders read; each rider writes as themselves.
create policy statuses_read on rider_statuses for select to authenticated using (is_ride_member(ride_id, auth.uid()));
create policy statuses_write on rider_statuses for insert to authenticated
  with check (user_id = auth.uid() and is_ride_member(ride_id, auth.uid()));

create policy regroup_read on regroup_points for select to authenticated using (is_ride_member(ride_id, auth.uid()));
create policy regroup_write on regroup_points for insert to authenticated with check (
  created_by = auth.uid() and exists (
    select 1 from ride_members m
    where m.ride_id = regroup_points.ride_id and m.user_id = auth.uid() and m.status = 'joined'
      and m.role in ('organizer', 'co_organizer', 'leader')
  )
);
create policy regroup_clear on regroup_points for update to authenticated using (
  created_by = auth.uid() or is_ride_manager(ride_id, auth.uid())
);

create policy messages_read on ride_messages for select to authenticated using (is_ride_member(ride_id, auth.uid()));
create policy messages_write on ride_messages for insert to authenticated with check (
  user_id = auth.uid() and is_ride_member(ride_id, auth.uid())
  and (kind <> 'announcement' or is_ride_manager(ride_id, auth.uid()))
);

create policy feature_plans_read on feature_plans for select to anon, authenticated using (true);
create policy subscriptions_self on subscriptions for select to authenticated using (user_id = auth.uid());
create policy events_insert on events for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Join a ride by id (link) or invite code. Applies join policy, caps and waitlist atomically.
create or replace function join_ride(
  p_ride uuid default null,
  p_invite_code text default null,
  p_vehicle uuid default null,
  p_riders int default 1,
  p_vehicles int default 1
) returns member_status
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_ride rides;
  v_existing ride_members;
  v_joined_riders int;
  v_joined_vehicles int;
  v_status member_status;
begin
  if v_user is null then raise exception 'sign in to join'; end if;

  select * into v_ride from rides
  where (p_ride is not null and id = p_ride)
     or (p_ride is null and invite_code = upper(p_invite_code))
  for update;
  if not found then raise exception 'ride not found'; end if;
  if v_ride.status in ('ended', 'cancelled') then raise exception 'ride is %', v_ride.status; end if;

  select * into v_existing from ride_members where ride_id = v_ride.id and user_id = v_user;
  if found and v_existing.status in ('joined', 'pending', 'waitlisted') then
    return v_existing.status;
  end if;

  -- An invite code counts as an invitation; private and invite-only rides need one.
  if (v_ride.join_policy = 'invite_only' or v_ride.visibility = 'private')
     and p_invite_code is null and not (found and v_existing.status = 'invited') then
    raise exception 'this ride is invite only';
  end if;

  select coalesce(sum(riders), 0), coalesce(sum(vehicles), 0)
    into v_joined_riders, v_joined_vehicles
  from ride_members where ride_id = v_ride.id and status = 'joined';

  if v_ride.join_policy = 'approval' and p_invite_code is null and not (found and v_existing.status = 'invited') then
    v_status := 'pending';
  elsif (v_ride.max_riders is not null and v_joined_riders + p_riders > v_ride.max_riders)
     or (v_ride.max_vehicles is not null and v_joined_vehicles + p_vehicles > v_ride.max_vehicles) then
    v_status := 'waitlisted';
  else
    v_status := 'joined';
  end if;

  insert into ride_members (ride_id, user_id, status, vehicle_id, riders, vehicles)
  values (v_ride.id, v_user, v_status, p_vehicle, p_riders, p_vehicles)
  on conflict (ride_id, user_id) do update
    set status = excluded.status, vehicle_id = excluded.vehicle_id,
        riders = excluded.riders, vehicles = excluded.vehicles, left_at = null,
        created_at = case when ride_members.status = 'cancelled' then now() else ride_members.created_at end;

  insert into events (user_id, name, props)
  values (v_user, 'ride_join', jsonb_build_object('ride_id', v_ride.id, 'status', v_status, 'via_code', p_invite_code is not null));

  return v_status;
end;
$$;

-- Promote waitlisted riders in order while they fit. Called after anyone leaves.
create or replace function promote_waitlist(p_ride uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_ride rides;
  w ride_members;
  v_riders int;
  v_vehicles int;
  v_promoted int := 0;
begin
  select * into v_ride from rides where id = p_ride for update;
  for w in
    select * from ride_members where ride_id = p_ride and status = 'waitlisted' order by created_at
  loop
    select coalesce(sum(riders), 0), coalesce(sum(vehicles), 0) into v_riders, v_vehicles
    from ride_members where ride_id = p_ride and status = 'joined';
    exit when (v_ride.max_riders is not null and v_riders + w.riders > v_ride.max_riders)
           or (v_ride.max_vehicles is not null and v_vehicles + w.vehicles > v_ride.max_vehicles);
    update ride_members set status = 'joined' where ride_id = p_ride and user_id = w.user_id;
    v_promoted := v_promoted + 1;
  end loop;
  return v_promoted;
end;
$$;

-- Leave or cancel. During a live ride this also ends the rider's ride share.
create or replace function leave_ride(p_ride uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update ride_members set status = 'cancelled', left_at = now()
  where ride_id = p_ride and user_id = auth.uid();
  update location_shares set revoked_at = now()
  where user_id = auth.uid() and ride_id = p_ride and revoked_at is null;
  perform promote_waitlist(p_ride);
end;
$$;

-- Start or end Ride Mode. Ending stops every ride share automatically.
create or replace function set_ride_status(p_ride uuid, p_status ride_status)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_ride_manager(p_ride, auth.uid()) then raise exception 'only organizers can do that'; end if;
  update rides set
    status = p_status,
    started_at = case when p_status = 'live' then coalesce(started_at, now()) else started_at end,
    ended_at = case when p_status in ('ended', 'cancelled') then now() else ended_at end
  where id = p_ride;
  if p_status in ('ended', 'cancelled') then
    update location_shares set revoked_at = now()
    where ride_id = p_ride and revoked_at is null;
  end if;
end;
$$;

-- Read-only family link: returns the last point only while the share is active.
create or replace function get_shared_location(p_token text)
returns table (display_name text, lat double precision, lng double precision, recorded_at timestamptz,
               expires_at timestamptz, ride_name text, expected_finish_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.display_name, pos.lat, pos.lng, pos.recorded_at, s.expires_at, r.name, r.expected_finish_at
  from location_shares s
  join profiles p on p.id = s.user_id
  left join positions_latest pos on pos.user_id = s.user_id
  left join rides r on r.id = s.ride_id
  where s.link_token = p_token and share_is_active(s);
$$;
grant execute on function get_shared_location(text) to anon, authenticated;

-- Riders change their own membership only through these, so nobody can promote themselves.
create or replace function check_in(p_ride uuid)
returns void language sql security definer set search_path = public as $$
  update ride_members set checked_in_at = coalesce(checked_in_at, now())
  where ride_id = p_ride and user_id = auth.uid() and status = 'joined';
$$;

create or replace function set_my_vehicle(p_ride uuid, p_vehicle uuid, p_riders int default 1)
returns void language sql security definer set search_path = public as $$
  update ride_members set vehicle_id = p_vehicle, riders = p_riders, vehicles = case when p_vehicle is null then 0 else 1 end
  where ride_id = p_ride and user_id = auth.uid()
    and (p_vehicle is null or exists (select 1 from vehicles where id = p_vehicle and owner_id = auth.uid()));
$$;

-- The organizer is automatically the first joined member of their ride.
create or replace function handle_new_ride()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into ride_members (ride_id, user_id, status, role)
  values (new.id, new.organizer_id, 'joined', 'organizer')
  on conflict (ride_id, user_id) do nothing;
  return new;
end;
$$;
create trigger on_ride_created after insert on rides
  for each row execute function handle_new_ride();

-- Create a profile row for every new auth user (Google, Apple, Facebook, phone or email).
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name, photo_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Live updates for Ride Mode.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table positions_latest, rider_statuses, regroup_points, ride_messages, ride_members, rides;
  end if;
end $$;
