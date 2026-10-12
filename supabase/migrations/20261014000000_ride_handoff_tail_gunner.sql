-- Hand off the ride, and the tail gunner.
--   1. hand_off_ride: the leader gives the ride to another joined rider. The organizer hands over
--      the whole ride (the new rider becomes organizer and leader); a rider who was given the
--      Leader role hands over just the lead. Either way the old leader stays on as a rider, and
--      leader-only chat (is_ride_leader) follows the new leader straight away.
--   2. set_tail_gunner: the organizer, a co-organizer or the leader names the one rider who rides
--      at the rear, or clears it. The app calls this "Tail gunner"; it is the existing 'sweep' role,
--      so the Ride Bubble, the group map and Ride Mode read it from ride_members.role as before.
--   3. Guards: the organizer can only change through hand_off_ride, so nobody can take over a
--      ride by editing rides.organizer_id or a roster row directly.
-- Additive: two functions and two triggers. Nothing is dropped and no rows change.

-- ---------------------------------------------------------------------------
-- 3. Guards. Functions below run as their owner, so only direct edits from the app are refused.
-- ---------------------------------------------------------------------------
create or replace function guard_ride_organizer()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.organizer_id is distinct from old.organizer_id and current_user in ('authenticated', 'anon') then
    raise exception 'use hand_off_ride to give the ride to someone else';
  end if;
  return new;
end;
$$;
create trigger rides_guard_organizer before update of organizer_id on rides
  for each row execute function guard_ride_organizer();

create or replace function guard_member_organizer_role()
returns trigger language plpgsql set search_path = public as $$
begin
  if (new.role = 'organizer') is distinct from (old.role = 'organizer') and current_user in ('authenticated', 'anon') then
    raise exception 'use hand_off_ride to give the ride to someone else';
  end if;
  return new;
end;
$$;
create trigger ride_members_guard_organizer before update of role on ride_members
  for each row execute function guard_member_organizer_role();

-- ---------------------------------------------------------------------------
-- 1. Hand off the ride.
-- ---------------------------------------------------------------------------
create or replace function hand_off_ride(p_ride uuid, p_to uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_ride rides;
  v_my_role member_role;
  v_to_role member_role;
begin
  select * into v_ride from rides where id = p_ride for update;
  if v_ride.id is null or v_me is null then raise exception 'ride not found'; end if;
  if v_ride.status in ('ended', 'cancelled') then raise exception 'this ride is over'; end if;
  if p_to is null or p_to = v_me then raise exception 'pick another rider'; end if;

  select role into v_to_role from ride_members where ride_id = p_ride and user_id = p_to and status = 'joined';
  if v_to_role is null then raise exception 'they need to have joined the ride first'; end if;
  select role into v_my_role from ride_members where ride_id = p_ride and user_id = v_me and status = 'joined';

  if v_ride.organizer_id = v_me then
    -- The whole ride: they become organizer and the one leader; everyone else's lead is cleared.
    update rides set organizer_id = p_to where id = p_ride;
    update ride_members set role = 'rider'
      where ride_id = p_ride and (user_id = v_me or (role = 'leader' and user_id <> p_to));
    update ride_members set role = 'organizer' where ride_id = p_ride and user_id = p_to;
  elsif v_my_role = 'leader' then
    -- Just the lead. Handing it to the organizer means the organizer leads again.
    update ride_members set role = 'rider'
      where ride_id = p_ride and role = 'leader' and user_id <> p_to;
    if v_to_role not in ('organizer', 'leader') then
      update ride_members set role = 'leader' where ride_id = p_ride and user_id = p_to;
    end if;
  else
    raise exception 'only the leader can hand off the ride';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. The tail gunner: one rider at the rear, or nobody.
-- ---------------------------------------------------------------------------
create or replace function set_tail_gunner(p_ride uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_role member_role;
begin
  if v_me is null or not (is_ride_manager(p_ride, v_me) or is_ride_leader(p_ride, v_me)) then
    raise exception 'only the leader or organizer can pick the tail gunner';
  end if;
  if p_user is not null then
    select role into v_role from ride_members where ride_id = p_ride and user_id = p_user and status = 'joined';
    if v_role is null then raise exception 'they need to have joined the ride first'; end if;
    if v_role not in ('rider', 'sweep') then raise exception 'the leader and organizers can''t also be tail gunner'; end if;
  end if;
  update ride_members set role = 'rider' where ride_id = p_ride and role = 'sweep' and user_id is distinct from p_user;
  if p_user is not null then
    update ride_members set role = 'sweep' where ride_id = p_ride and user_id = p_user;
  end if;
end;
$$;

revoke execute on function hand_off_ride(uuid, uuid), set_tail_gunner(uuid, uuid) from public, anon;
grant execute on function hand_off_ride(uuid, uuid), set_tail_gunner(uuid, uuid) to authenticated;
