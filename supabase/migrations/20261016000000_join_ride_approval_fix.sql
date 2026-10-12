-- Fix: approval-only rides let anyone straight in.
-- In join_ride, the capacity select (coalesce(sum(...))) ran before the approval check and set
-- plpgsql's FOUND to true, so "not (found and v_existing.status = 'invited')" was NULL for a
-- rider with no membership row and the ride's approval rule was skipped. FOUND is now captured
-- right after the membership lookup and that copy is used in both checks. Same signature, so
-- existing grants stay as they are.

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
  v_has_row boolean;
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
  v_has_row := found;
  if v_has_row and v_existing.status in ('joined', 'pending', 'waitlisted') then
    return v_existing.status;
  end if;

  -- An invite code counts as an invitation; private and invite-only rides need one.
  if (v_ride.join_policy = 'invite_only' or v_ride.visibility = 'private')
     and p_invite_code is null and not (v_has_row and v_existing.status = 'invited') then
    raise exception 'this ride is invite only';
  end if;

  select coalesce(sum(riders), 0), coalesce(sum(vehicles), 0)
    into v_joined_riders, v_joined_vehicles
  from ride_members where ride_id = v_ride.id and status = 'joined';

  if v_ride.join_policy = 'approval' and p_invite_code is null and not (v_has_row and v_existing.status = 'invited') then
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
