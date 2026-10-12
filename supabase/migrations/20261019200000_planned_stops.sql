-- Planned stops: the leader marks a waypoint as a stop the whole ride will make (fuel, lunch, a
-- viewpoint), in order, with an optional planned time. A planned stop is always shared with every
-- joined rider and, like every waypoint, never public: ride_waypoints' read policy still decides.
-- Built on ride_waypoints (20261018500000) rather than as a second table.

alter table ride_waypoints
  add column planned_stop boolean not null default false,
  -- 1, 2, 3 along the ride. Set by the trigger below; reorder with reorder_planned_stops.
  add column stop_order integer,
  -- The time of day the group expects to be there (the ride's own day), or null.
  add column stop_time time,
  -- A planned stop is for the whole ride, so it is always shared. Sharing already needs the leader
  -- or an organizer (can_share_waypoint, in the insert and update policies), so this also means only
  -- they can plan one.
  add constraint ride_waypoints_planned_stop_shared check (not planned_stop or shared);

create index ride_waypoints_stops_idx on ride_waypoints (ride_id, stop_order) where planned_stop;

-- The leader (or an organizer) can change any planned stop on the ride, not just the ones they added
-- themselves, so the plan survives a leader hand-off. It has to stay a planned stop to use this.
create policy waypoints_update_planned_stop on ride_waypoints for update to authenticated
  using (planned_stop and can_share_waypoint(ride_id, auth.uid()))
  with check (planned_stop and shared and can_share_waypoint(ride_id, auth.uid()));

grant insert (planned_stop, stop_time) on ride_waypoints to authenticated;
grant update (planned_stop, stop_time) on ride_waypoints to authenticated;

-- A new planned stop goes on the end of the list; one that stops being planned loses its place and time.
create function ride_waypoints_planned_stop() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not new.planned_stop then
    new.stop_order := null;
    new.stop_time := null;
  elsif tg_op = 'INSERT' or not old.planned_stop then
    new.stop_order := coalesce((select max(stop_order) from ride_waypoints where ride_id = new.ride_id and planned_stop), 0) + 1;
  elsif coalesce(current_setting('onmylead.reordering_stops', true), '') <> 'on' then
    new.stop_order := old.stop_order;
  end if;
  return new;
end $$;
revoke execute on function ride_waypoints_planned_stop() from public, anon, authenticated;

create trigger ride_waypoints_planned_stop before insert or update on ride_waypoints
  for each row execute function ride_waypoints_planned_stop();

-- Put the ride's planned stops in a new order: p_ids lists every one of them, first stop first.
-- Only the leader or an organizer, and only while joined.
create function reorder_planned_stops(p_ride uuid, p_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can_share_waypoint(p_ride, auth.uid()) then
    raise exception 'not_leader: only the leader can change the planned stops' using errcode = '42501';
  end if;
  if (select coalesce(array_agg(id order by id), '{}') from ride_waypoints where ride_id = p_ride and planned_stop)
     is distinct from (select coalesce(array_agg(x order by x), '{}') from unnest(p_ids) x) then
    raise exception 'stops_changed: the planned stops changed, reload and try again' using errcode = 'P0001';
  end if;
  -- Lets the trigger take the new order (ordinary edits keep a stop's place), for this transaction only.
  perform set_config('onmylead.reordering_stops', 'on', true);
  update ride_waypoints w set stop_order = o.n
  from unnest(p_ids) with ordinality as o(id, n)
  where w.id = o.id and w.ride_id = p_ride;
  perform set_config('onmylead.reordering_stops', 'off', true);
end $$;
revoke execute on function reorder_planned_stops(uuid, uuid[]) from public, anon;
grant execute on function reorder_planned_stops(uuid, uuid[]) to authenticated;
