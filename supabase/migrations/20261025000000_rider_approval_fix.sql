-- Fix: "I Approve Riders" could be skipped, and approving could go over the ride's limits.
--
-- 1. join_ride treated any invite code as an invitation. The ride page always sends the ride's
--    code (every ride page is opened by it, and the code is on the page, the QR and the share
--    link), so riders on an approval ride went straight in. The code still opens private and
--    invite-only rides, but on an approval ride only an invitation the organizer sent (a riding
--    group invite, status 'invited') skips approval. Same signature, so grants stay as they are.
--
-- 2. Approving a request (the organizer's Approve button updates ride_members directly) didn't
--    check Max Riders or Max Vehicles. A trigger now checks the limits whenever a rider moves
--    into 'joined': if they don't fit, they go on the waitlist instead and move up in order
--    when a spot opens (promote_waitlist).

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
  v_invited boolean;
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
  v_invited := v_has_row and v_existing.status = 'invited';

  -- The invite code opens private and invite-only rides.
  if (v_ride.join_policy = 'invite_only' or v_ride.visibility = 'private')
     and p_invite_code is null and not v_invited then
    raise exception 'this ride is invite only';
  end if;

  select coalesce(sum(riders), 0), coalesce(sum(vehicles), 0)
    into v_joined_riders, v_joined_vehicles
  from ride_members where ride_id = v_ride.id and status = 'joined';

  -- The code is not an invitation: anyone who can see the ride has it. Only an invitation
  -- from the organizer skips approval.
  if v_ride.join_policy = 'approval' and not v_invited then
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

-- Nobody moves into 'joined' past Max Riders or Max Vehicles, however the row is changed
-- (Approve, a manual edit, join_ride, promote_waitlist). A rider who doesn't fit is waitlisted.
create or replace function ride_members_cap_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ride rides;
  v_riders int;
  v_vehicles int;
begin
  if new.status <> 'joined' or old.status = 'joined' then
    return new;
  end if;
  -- Same lock join_ride and promote_waitlist take, so two approvals can't both fill the last spot.
  select * into v_ride from rides where id = new.ride_id for update;
  if v_ride.max_riders is null and v_ride.max_vehicles is null then
    return new;
  end if;
  select coalesce(sum(riders), 0), coalesce(sum(vehicles), 0) into v_riders, v_vehicles
  from ride_members
  where ride_id = new.ride_id and status = 'joined' and user_id <> new.user_id;
  if (v_ride.max_riders is not null and v_riders + new.riders > v_ride.max_riders)
     or (v_ride.max_vehicles is not null and v_vehicles + new.vehicles > v_ride.max_vehicles) then
    new.status := 'waitlisted';
  end if;
  return new;
end;
$$;

create trigger ride_members_cap_guard before update of status on ride_members
  for each row execute function ride_members_cap_guard();
