-- Waypoints: named spots riders drop on a ride's map (camp, fuel, a viewpoint, a washout).
-- A rider's waypoints are only ever theirs. The ride's leader (or an organizer) can also share a
-- waypoint with everyone on the ride. Like every location in OnMyLead, a waypoint is never public:
-- shared ones are readable only by riders who have joined that ride.
-- The route's shape points in ride_private_details.waypoints are a different thing and stay as they are.

create table ride_waypoints (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references rides (id) on delete cascade,
  user_id uuid not null default auth.uid() references profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  kind text not null default 'spot'
    check (kind in ('spot', 'camp', 'fuel', 'water', 'view', 'hazard', 'parking')),
  note text check (note is null or char_length(note) <= 280),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  -- false: only the rider who dropped it. true: everyone joined to the ride.
  shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ride_waypoints_ride_idx on ride_waypoints (ride_id, created_at);

alter table ride_waypoints enable row level security;

-- Who may share a waypoint with the whole ride: the leader (is_ride_leader falls back to the
-- organizer when nobody holds the Leader role) and the ride's organizers.
create or replace function can_share_waypoint(p_ride uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select is_ride_member(p_ride, p_user) and (is_ride_leader(p_ride, p_user) or is_ride_manager(p_ride, p_user));
$$;

-- Your own waypoints while you're on the ride, and shared ones only while you're joined to it.
create policy waypoints_read on ride_waypoints for select to authenticated using (
  is_ride_member(ride_id, auth.uid()) and (user_id = auth.uid() or shared)
);

-- Joined riders add waypoints as themselves; only the leader or an organizer can share one.
create policy waypoints_insert on ride_waypoints for insert to authenticated with check (
  user_id = auth.uid()
  and is_ride_member(ride_id, auth.uid())
  and (not shared or can_share_waypoint(ride_id, auth.uid()))
);

-- You edit your own; sharing still needs the leader or an organizer.
create policy waypoints_update on ride_waypoints for update to authenticated
  using (user_id = auth.uid() and is_ride_member(ride_id, auth.uid()))
  with check (user_id = auth.uid() and (not shared or can_share_waypoint(ride_id, auth.uid())));

-- You remove your own. The leader or an organizer can also clear a shared one (say, after a hand-off).
create policy waypoints_delete on ride_waypoints for delete to authenticated using (
  (user_id = auth.uid() and is_ride_member(ride_id, auth.uid()))
  or (shared and can_share_waypoint(ride_id, auth.uid()))
);

revoke all on ride_waypoints from anon, authenticated;
grant select, delete on ride_waypoints to authenticated;
grant insert (ride_id, name, kind, note, lat, lng, shared) on ride_waypoints to authenticated;
grant update (name, kind, note, lat, lng, shared) on ride_waypoints to authenticated;

-- Tidy names, keep the ride fixed, stamp edits, and cap each rider at 100 waypoints a ride.
create function ride_waypoints_before_write() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.name := btrim(new.name);
  new.note := nullif(btrim(coalesce(new.note, '')), '');
  if tg_op = 'UPDATE' then
    new.ride_id := old.ride_id;
    new.user_id := old.user_id;
    new.created_at := old.created_at;
    new.updated_at := now();
  elsif (select count(*) from ride_waypoints where ride_id = new.ride_id and user_id = new.user_id) >= 100 then
    raise exception 'waypoint_limit: 100 waypoints per ride' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function ride_waypoints_before_write() from public, anon, authenticated;

create trigger ride_waypoints_before_write before insert or update on ride_waypoints
  for each row execute function ride_waypoints_before_write();

-- Live updates in Ride Mode (Realtime applies the read policy above).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table ride_waypoints;
  end if;
end $$;
