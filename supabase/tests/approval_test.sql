-- "I Approve Riders" and ride limits.
-- 1. The invite code is shown to anyone who can open a public ride (ride page, QR, share link),
--    so it never skips approval. Only an invitation the organizer sent (a riding group invite)
--    lets a rider straight in.
-- 2. Approving a request respects Max Riders and Max Vehicles: a rider approved onto a full
--    ride goes on the waitlist and moves up when a spot opens.
-- Runs after privacy_test.sql, which creates the as_user() helper and the test riders.

-- Olivia's approval-only ride, at most 2 riders and 2 vehicles (Olivia is one of each).
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility, join_policy,
                   invite_code, max_riders, max_vehicles)
values ('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a7', auth.uid(), 'Approve me ride', now() + interval '3 days', 38.5, -109.5,
        'public', 'approval', 'APPROVE1', 2, 2);
reset role;

-- Ben opens the ride page (which sends the invite code) and taps Request to Join: he waits.
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
do $$ begin
  if join_ride(p_ride => 'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a7', p_invite_code => 'APPROVE1') <> 'pending' then
    raise exception 'FAIL: invite code from the ride page skipped approval';
  end if;
end $$;
reset role;

-- Cara joins by code only (a shared link or QR): she waits too.
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
do $$ begin
  if join_ride(p_invite_code => 'approve1') <> 'pending' then
    raise exception 'FAIL: invite code link skipped approval';
  end if;
  if (select count(*) from ride_private_details where ride_id = 'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a7') <> 0 then
    raise exception 'FAIL: rider waiting for approval saw the meeting point';
  end if;
end $$;
reset role;

-- Olivia approves Ben: the ride now has 2 riders, so it's full.
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
update ride_members set status = 'joined'
where ride_id = 'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a7' and user_id = '00000000-0000-0000-0000-00000000000b';
-- Olivia approves Cara: no room, so Cara goes on the waitlist instead of over the limit.
update ride_members set status = 'joined'
where ride_id = 'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a7' and user_id = '00000000-0000-0000-0000-00000000000c';
reset role;
do $$ begin
  if (select status from ride_members where ride_id = 'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a7'
      and user_id = '00000000-0000-0000-0000-00000000000b') <> 'joined' then
    raise exception 'FAIL: approved rider with room not let in';
  end if;
  if (select status from ride_members where ride_id = 'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a7'
      and user_id = '00000000-0000-0000-0000-00000000000c') <> 'waitlisted' then
    raise exception 'FAIL: approving a rider on a full ride went over Max Riders';
  end if;
  if (select sum(riders) from ride_members where ride_id = 'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a7' and status = 'joined') > 2 then
    raise exception 'FAIL: ride over Max Riders';
  end if;
end $$;

-- Ben leaves: Cara (approved, on the waitlist) moves up into his spot.
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
select leave_ride('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a7');
reset role;
do $$ begin
  if (select status from ride_members where ride_id = 'a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a7'
      and user_id = '00000000-0000-0000-0000-00000000000c') <> 'joined' then
    raise exception 'FAIL: approved waitlisted rider did not move up when a spot opened';
  end if;
end $$;

-- Ben comes back with the code: a rider who left asks again, so he waits for approval again.
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
do $$ begin
  if join_ride(p_invite_code => 'APPROVE1') <> 'pending' then
    raise exception 'FAIL: rider who left rejoined an approval ride without approval';
  end if;
end $$;
reset role;

-- Max Vehicles counts too. A vehicle-capped approval ride: 1 vehicle (Olivia's).
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility, join_policy,
                   invite_code, max_vehicles)
values ('a8a8a8a8-a8a8-a8a8-a8a8-a8a8a8a8a8a8', auth.uid(), 'One truck ride', now() + interval '3 days', 38.5, -109.5,
        'public', 'approval', 'ONETRUCK', 1);
reset role;
select as_user('00000000-0000-0000-0000-00000000000d');
set role authenticated;
select join_ride('a8a8a8a8-a8a8-a8a8-a8a8-a8a8a8a8a8a8');
reset role;
-- Directly writing the row as the organizer (what the Approve button does) can't go over either.
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
update ride_members set status = 'joined'
where ride_id = 'a8a8a8a8-a8a8-a8a8-a8a8-a8a8a8a8a8a8' and user_id = '00000000-0000-0000-0000-00000000000d';
reset role;
do $$ begin
  if (select status from ride_members where ride_id = 'a8a8a8a8-a8a8-a8a8-a8a8-a8a8a8a8a8a8'
      and user_id = '00000000-0000-0000-0000-00000000000d') <> 'waitlisted' then
    raise exception 'FAIL: approving a rider went over Max Vehicles';
  end if;
end $$;

-- A rider in a car-share (no vehicle of their own) still fits a vehicle-full ride.
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
select join_ride(p_ride => 'a8a8a8a8-a8a8-a8a8-a8a8-a8a8a8a8a8a8', p_vehicles => 0);
reset role;
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
update ride_members set status = 'joined'
where ride_id = 'a8a8a8a8-a8a8-a8a8-a8a8-a8a8a8a8a8a8' and user_id = '00000000-0000-0000-0000-00000000000c';
reset role;
do $$ begin
  if (select status from ride_members where ride_id = 'a8a8a8a8-a8a8-a8a8-a8a8-a8a8a8a8a8a8'
      and user_id = '00000000-0000-0000-0000-00000000000c') <> 'joined' then
    raise exception 'FAIL: passenger with no vehicle not approved onto a vehicle-full ride';
  end if;
end $$;

-- An invited rider (riding group invite) still skips approval, but not the limits.
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility, join_policy,
                   invite_code, max_riders)
values ('a9a9a9a9-a9a9-a9a9-a9a9-a9a9a9a9a9a9', auth.uid(), 'Invited ride', now() + interval '3 days', 38.5, -109.5,
        'public', 'approval', 'INVITED1', 1);
reset role;
insert into ride_members (ride_id, user_id, status)
values ('a9a9a9a9-a9a9-a9a9-a9a9-a9a9a9a9a9a9', '00000000-0000-0000-0000-00000000000b', 'invited');
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
do $$ begin
  if join_ride(p_invite_code => 'INVITED1') <> 'waitlisted' then
    raise exception 'FAIL: invited rider on a full approval ride not waitlisted';
  end if;
end $$;
reset role;

select 'ALL APPROVAL AND RIDE LIMIT TESTS PASSED' as result;
