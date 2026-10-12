-- Run after the migration on a scratch database:
--   psql -v ON_ERROR_STOP=1 -f auth_stub.sql -f ../migrations/*.sql -f privacy_test.sql
-- Each block raises an exception if a privacy or joining rule is broken.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on rides, feature_plans to anon;
grant execute on all functions in schema public to anon, authenticated;

-- Fixture users (the trigger creates profiles).
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', '{"full_name":"Olivia Organizer"}'),
  ('00000000-0000-0000-0000-00000000000b', '{"full_name":"Ben Rider"}'),
  ('00000000-0000-0000-0000-00000000000c', '{"full_name":"Cara Rider"}'),
  ('00000000-0000-0000-0000-00000000000d', '{"full_name":"Dan Stranger"}');

create function as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p::text, ''), false);
$$;

-- Olivia creates a public ride for 2 vehicles.
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility, max_vehicles)
values ('11111111-1111-1111-1111-111111111111', auth.uid(), 'Moab Saturday', now() + interval '1 day', 38.57, -109.55, 'public', 2);
insert into ride_private_details (ride_id, meet_lat, meet_lng, meet_label)
values ('11111111-1111-1111-1111-111111111111', 38.5733, -109.5498, 'Gas station on Main St');
reset role;
do $$ begin
  if not exists (select 1 from ride_members where user_id = '00000000-0000-0000-0000-00000000000a' and role = 'organizer' and status = 'joined') then
    raise exception 'FAIL: organizer not added to their ride';
  end if;
end $$;

do $$ begin
  if (select display_name from profiles where id = '00000000-0000-0000-0000-00000000000b') <> 'Ben Rider' then
    raise exception 'FAIL: profile not created from sign-in metadata';
  end if;
end $$;

-- 1. A stranger can see the public ride page but not the exact meeting point.
select as_user('00000000-0000-0000-0000-00000000000d');
set role authenticated;
do $$ begin
  if (select count(*) from rides) <> 1 then raise exception 'FAIL: public ride not visible'; end if;
  if (select count(*) from ride_private_details) <> 0 then raise exception 'FAIL: stranger saw exact meeting point'; end if;
end $$;
reset role;

-- 2. Signed-out link preview works for public/unlisted rides.
select as_user(null);
set role anon;
do $$ begin
  if (select count(*) from rides) <> 1 then raise exception 'FAIL: signed-out preview blocked'; end if;
end $$;
reset role;

-- 3. Ben joins (fills the 2nd vehicle), Cara is waitlisted.
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
do $$ begin
  if join_ride('11111111-1111-1111-1111-111111111111') <> 'joined' then raise exception 'FAIL: Ben should join'; end if;
  if (select count(*) from ride_private_details) <> 1 then raise exception 'FAIL: joined rider cannot see meeting point'; end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
do $$ begin
  if join_ride('11111111-1111-1111-1111-111111111111') <> 'waitlisted' then raise exception 'FAIL: Cara should be waitlisted'; end if;
  if (select count(*) from ride_private_details) <> 0 then raise exception 'FAIL: waitlisted rider saw meeting point'; end if;
end $$;
reset role;

-- 3b. A waitlisted rider cannot promote themselves.
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
update ride_members set status = 'joined' where user_id = auth.uid();
reset role;
do $$ begin
  if (select status from ride_members where user_id = '00000000-0000-0000-0000-00000000000c') <> 'waitlisted' then
    raise exception 'FAIL: rider promoted themselves off the waitlist';
  end if;
end $$;

-- 4. Ride starts. Ben shares for 2 hours and posts a position.
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
select set_ride_status('11111111-1111-1111-1111-111111111111', 'live');
reset role;

select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
insert into location_shares (user_id, scope, ride_id, expires_at)
values (auth.uid(), 'ride', '11111111-1111-1111-1111-111111111111', now() + interval '2 hours');
insert into positions_latest (user_id, lat, lng, speed_mps, recorded_at)
values (auth.uid(), 38.6, -109.6, 8, now());
reset role;

-- Olivia (joined) sees Ben; Dan (stranger) and Cara (waitlisted) do not.
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$ begin
  if (select count(*) from positions_latest where user_id = '00000000-0000-0000-0000-00000000000b') <> 1 then
    raise exception 'FAIL: joined rider cannot see a sharing rider';
  end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-00000000000d');
set role authenticated;
do $$ begin
  if (select count(*) from positions_latest) <> 0 then raise exception 'FAIL: stranger saw a live position'; end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
do $$ begin
  if (select count(*) from positions_latest) <> 0 then raise exception 'FAIL: waitlisted rider saw a live position'; end if;
end $$;
reset role;

-- 5. Olivia is not sharing, so nobody else sees her even though she is on the ride.
insert into positions_latest (user_id, lat, lng, recorded_at)
values ('00000000-0000-0000-0000-00000000000a', 38.61, -109.61, now());
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
do $$ begin
  if (select count(*) from positions_latest where user_id = '00000000-0000-0000-0000-00000000000a') <> 0 then
    raise exception 'FAIL: saw a rider who never turned sharing on';
  end if;
end $$;
-- And Ben cannot write a position for someone else.
do $$ begin
  begin
    update positions_latest set lat = 0 where user_id = '00000000-0000-0000-0000-00000000000a';
    if found then raise exception 'FAIL: updated another rider''s position'; end if;
  end;
end $$;
reset role;

-- 6. Expired share: nobody sees Ben any more.
update location_shares set expires_at = now() - interval '1 minute'
where user_id = '00000000-0000-0000-0000-00000000000b';
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$ begin
  if (select count(*) from positions_latest where user_id = '00000000-0000-0000-0000-00000000000b') <> 0 then
    raise exception 'FAIL: expired share still visible';
  end if;
end $$;
reset role;

-- 7. Ben leaves: Cara is promoted off the waitlist.
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
select leave_ride('11111111-1111-1111-1111-111111111111');
reset role;
do $$ begin
  if (select status from ride_members where user_id = '00000000-0000-0000-0000-00000000000c') <> 'joined' then
    raise exception 'FAIL: waitlist not promoted';
  end if;
end $$;

-- 8. Personal share with a recipient and a family link; ends on revoke.
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
insert into location_shares (id, user_id, scope, expires_at, link_token)
values ('22222222-2222-2222-2222-222222222222', auth.uid(), 'personal', now() + interval '1 hour', 'family-token-123');
insert into location_share_recipients values ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-00000000000d');
insert into positions_latest (user_id, lat, lng, recorded_at) values (auth.uid(), 38.7, -109.7, now());
reset role;
select as_user('00000000-0000-0000-0000-00000000000d');
set role authenticated;
do $$ begin
  if (select count(*) from positions_latest where user_id = '00000000-0000-0000-0000-00000000000c') <> 1 then
    raise exception 'FAIL: personal share recipient cannot see location';
  end if;
end $$;
reset role;
select as_user(null);
set role anon;
do $$ begin
  if (select count(*) from get_shared_location('family-token-123')) <> 1 then raise exception 'FAIL: family link not working'; end if;
  if (select count(*) from get_shared_location('wrong-token')) <> 0 then raise exception 'FAIL: bad token returned data'; end if;
end $$;
reset role;
update location_shares set revoked_at = now() where id = '22222222-2222-2222-2222-222222222222';
select as_user(null);
set role anon;
do $$ begin
  if (select count(*) from get_shared_location('family-token-123')) <> 0 then raise exception 'FAIL: revoked family link still works'; end if;
end $$;
reset role;

-- 9. Ending the ride revokes every ride share.
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
insert into location_shares (user_id, scope, ride_id) values (auth.uid(), 'ride', '11111111-1111-1111-1111-111111111111');
reset role;
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
select set_ride_status('11111111-1111-1111-1111-111111111111', 'ended');
reset role;
do $$ begin
  if exists (select 1 from location_shares where scope = 'ride' and revoked_at is null) then
    raise exception 'FAIL: ride share survived ride end';
  end if;
end $$;

-- 10. Only organizers can start or end a ride.
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
do $$ begin
  begin
    perform set_ride_status('11111111-1111-1111-1111-111111111111', 'live');
    raise exception 'FAIL: rider changed ride status';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
reset role;

-- 11. Garage: owners manage their own machines and build lists; nobody else can.
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
insert into vehicles (id, owner_id, kind, nickname, make, model, tank_gallons, extra_fuel_gallons, mpg)
values ('33333333-3333-3333-3333-333333333333', auth.uid(), 'sxs_utv', 'Dusty', 'Polaris', 'RZR', 10, 3.5, 12);
insert into vehicle_items (id, vehicle_id, area, name, cost_cents)
values ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 'lighting', 'Light bar', 45000);
do $$ begin
  if (select count(*) from vehicle_items) <> 1 then raise exception 'FAIL: owner cannot see their build list'; end if;
end $$;
reset role;

-- A stranger cannot see, change or add to Cara's machine.
select as_user('00000000-0000-0000-0000-00000000000d');
set role authenticated;
do $$ begin
  if (select count(*) from vehicles) <> 0 then raise exception 'FAIL: stranger saw a vehicle'; end if;
  if (select count(*) from vehicle_items) <> 0 then raise exception 'FAIL: stranger saw build items'; end if;
  update vehicle_items set cost_cents = 1 where id = '44444444-4444-4444-4444-444444444444';
  if found then raise exception 'FAIL: stranger edited a build item'; end if;
  delete from vehicle_items where id = '44444444-4444-4444-4444-444444444444';
  if found then raise exception 'FAIL: stranger deleted a build item'; end if;
  update vehicles set nickname = 'mine now' where id = '33333333-3333-3333-3333-333333333333';
  if found then raise exception 'FAIL: stranger edited a vehicle'; end if;
  delete from vehicles where id = '33333333-3333-3333-3333-333333333333';
  if found then raise exception 'FAIL: stranger deleted a vehicle'; end if;
  begin
    insert into vehicle_items (vehicle_id, area, name) values ('33333333-3333-3333-3333-333333333333', 'other', 'Spam');
    raise exception 'FAIL: stranger added an item to someone else''s vehicle';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into vehicles (owner_id, kind, nickname) values ('00000000-0000-0000-0000-00000000000c', 'vehicle', 'Planted');
    raise exception 'FAIL: stranger created a vehicle in someone else''s garage';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- The owner cannot hand a vehicle or an item to someone else's garage either.
insert into vehicles (id, owner_id, kind, nickname)
values ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-00000000000d', 'vehicle', 'Dan truck');
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
do $$ begin
  begin
    update vehicles set owner_id = '00000000-0000-0000-0000-00000000000d' where id = '33333333-3333-3333-3333-333333333333';
    raise exception 'FAIL: vehicle moved to another owner';
  exception when insufficient_privilege then null;
  end;
  begin
    update vehicle_items set vehicle_id = '55555555-5555-5555-5555-555555555555' where id = '44444444-4444-4444-4444-444444444444';
    raise exception 'FAIL: item moved onto another owner''s vehicle';
  exception when insufficient_privilege then null;
  end;
end $$;
-- Cara brings Dusty on the ride.
select set_my_vehicle('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333');
reset role;
do $$ begin
  if (select vehicle_id from ride_members where user_id = '00000000-0000-0000-0000-00000000000c') is distinct from '33333333-3333-3333-3333-333333333333' then
    raise exception 'FAIL: set_my_vehicle did not attach the owner''s vehicle';
  end if;
end $$;

-- 12. Ride lineup: a joined rider sees the machine but not its build list; a stranger sees neither.
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$ begin
  if (select count(*) from vehicles where id = '33333333-3333-3333-3333-333333333333') <> 1 then
    raise exception 'FAIL: ride member cannot see a rider''s vehicle in the lineup';
  end if;
  if (select count(*) from vehicle_items) <> 0 then raise exception 'FAIL: ride member saw another rider''s build items'; end if;
  update vehicles set nickname = 'renamed' where id = '33333333-3333-3333-3333-333333333333';
  if found then raise exception 'FAIL: ride member edited another rider''s vehicle'; end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-00000000000d');
set role authenticated;
do $$ begin
  if (select count(*) from vehicles where id = '33333333-3333-3333-3333-333333333333') <> 0 then
    raise exception 'FAIL: non-member saw a vehicle on a ride lineup';
  end if;
end $$;
reset role;

-- 13. Nobody can attach someone else's vehicle to a membership to peek at it.
select as_user('00000000-0000-0000-0000-00000000000d');
set role authenticated;
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility)
values ('66666666-6666-6666-6666-666666666666', auth.uid(), 'Dan''s ride', now() + interval '2 days', 38.5, -109.5, 'public');
do $$ begin
  -- Dan is the organizer (a ride manager) and tries to point his own membership at Cara's vehicle.
  begin
    update ride_members set vehicle_id = '33333333-3333-3333-3333-333333333333'
    where ride_id = '66666666-6666-6666-6666-666666666666' and user_id = auth.uid();
    raise exception 'FAIL: manager attached someone else''s vehicle to a membership';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  perform set_my_vehicle('66666666-6666-6666-6666-666666666666', '33333333-3333-3333-3333-333333333333');
  if (select count(*) from vehicles where id = '33333333-3333-3333-3333-333333333333') <> 0 then
    raise exception 'FAIL: set_my_vehicle exposed someone else''s vehicle';
  end if;
end $$;
reset role;
-- Ben joins Dan's ride claiming Cara's vehicle: refused.
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
do $$ begin
  begin
    perform join_ride('66666666-6666-6666-6666-666666666666', null, '33333333-3333-3333-3333-333333333333');
    raise exception 'FAIL: joined a ride with someone else''s vehicle';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
reset role;
do $$ begin
  if exists (select 1 from ride_members where vehicle_id = '33333333-3333-3333-3333-333333333333' and user_id <> '00000000-0000-0000-0000-00000000000c') then
    raise exception 'FAIL: a membership points at a vehicle its rider does not own';
  end if;
end $$;

-- 14. Deleting a vehicle clears it from memberships and removes its build list.
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
delete from vehicles where id = '33333333-3333-3333-3333-333333333333';
reset role;
do $$ begin
  if exists (select 1 from vehicle_items where id = '44444444-4444-4444-4444-444444444444') then raise exception 'FAIL: items survived vehicle delete'; end if;
  if exists (select 1 from ride_members where vehicle_id is not null) then raise exception 'FAIL: membership kept a deleted vehicle'; end if;
end $$;

-- 15. Trip planner: trips and checklists are private to their owner, even on a shared ride.
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
insert into trips (id, owner_id, name, ride_id) values
  ('77777777-7777-7777-7777-777777777777', auth.uid(), 'Moab packing', '11111111-1111-1111-1111-111111111111');
insert into trip_items (id, trip_id, name, category, quantity) values
  ('88888888-8888-8888-8888-888888888888', '77777777-7777-7777-7777-777777777777', 'Tow strap', 'recovery', 1),
  ('88888888-8888-8888-8888-888888888889', '77777777-7777-7777-7777-777777777777', 'Water', 'food_water', 2);
do $$ begin
  if (select count(*) from trip_items) <> 2 then raise exception 'FAIL: owner cannot see their checklist'; end if;
  -- Dan's truck is not in Cara's garage.
  begin
    update trips set vehicle_id = '55555555-5555-5555-5555-555555555555' where id = '77777777-7777-7777-7777-777777777777';
    raise exception 'FAIL: trip linked to someone else''s vehicle';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  -- One trip per ride per rider.
  begin
    insert into trips (owner_id, name, ride_id) values (auth.uid(), 'Again', '11111111-1111-1111-1111-111111111111');
    raise exception 'FAIL: second trip for the same ride';
  exception when unique_violation then null;
  end;
  begin
    insert into trip_items (trip_id, name, category) values ('77777777-7777-7777-7777-777777777777', 'Junk', 'not_a_category');
    raise exception 'FAIL: bad checklist category accepted';
  exception when check_violation then null;
  end;
end $$;
reset role;

-- The ride organizer (same ride) and a stranger see nothing and change nothing.
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$ begin
  if (select count(*) from trips) <> 0 then raise exception 'FAIL: ride organizer saw a rider''s trip'; end if;
  if (select count(*) from trip_items) <> 0 then raise exception 'FAIL: ride organizer saw a rider''s checklist'; end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-00000000000d');
set role authenticated;
insert into trips (id, owner_id, name) values ('99999999-9999-9999-9999-999999999999', auth.uid(), 'Dan trip');
do $$ begin
  if (select count(*) from trips) <> 1 then raise exception 'FAIL: stranger saw someone else''s trip'; end if;
  if (select count(*) from trip_items) <> 0 then raise exception 'FAIL: stranger saw someone else''s checklist'; end if;
  update trip_items set checked = true where id = '88888888-8888-8888-8888-888888888888';
  if found then raise exception 'FAIL: stranger ticked someone else''s item'; end if;
  delete from trip_items where id = '88888888-8888-8888-8888-888888888888';
  if found then raise exception 'FAIL: stranger deleted someone else''s item'; end if;
  update trips set name = 'mine now' where id = '77777777-7777-7777-7777-777777777777';
  if found then raise exception 'FAIL: stranger renamed someone else''s trip'; end if;
  delete from trips where id = '77777777-7777-7777-7777-777777777777';
  if found then raise exception 'FAIL: stranger deleted someone else''s trip'; end if;
  begin
    insert into trip_items (trip_id, name) values ('77777777-7777-7777-7777-777777777777', 'Spam');
    raise exception 'FAIL: stranger added to someone else''s checklist';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into trips (owner_id, name) values ('00000000-0000-0000-0000-00000000000c', 'Planted');
    raise exception 'FAIL: stranger created a trip for someone else';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- The owner cannot move an item onto someone else's trip, or hand the trip over.
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
do $$ begin
  begin
    update trip_items set trip_id = '99999999-9999-9999-9999-999999999999' where id = '88888888-8888-8888-8888-888888888888';
    raise exception 'FAIL: item moved onto another rider''s trip';
  exception when insufficient_privilege then null;
  end;
  begin
    update trips set owner_id = '00000000-0000-0000-0000-00000000000d' where id = '77777777-7777-7777-7777-777777777777';
    raise exception 'FAIL: trip handed to another rider';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select as_user(null);
set role anon;
do $$ begin
  begin
    if (select count(*) from trips) <> 0 then raise exception 'FAIL: signed-out visitor saw trips'; end if;
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
-- Deleting a trip removes its checklist.
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
delete from trips where id = '77777777-7777-7777-7777-777777777777';
reset role;
do $$ begin
  if exists (select 1 from trip_items where trip_id = '77777777-7777-7777-7777-777777777777') then raise exception 'FAIL: checklist survived trip delete'; end if;
end $$;

-- 16. Starlink setup: private to the rider, one general row plus one per own vehicle.
select as_user('00000000-0000-0000-0000-00000000000d');
set role authenticated;
insert into starlink_setups (owner_id, plan_name, monthly_cost_cents, dish_model, power_source, dish_watts, hours_per_day, battery_wh)
values (auth.uid(), 'Roam Unlimited', 16500, 'mini', 'power_station', 30, 8, 1024);
insert into starlink_setups (owner_id, vehicle_id, dish_model)
values (auth.uid(), '55555555-5555-5555-5555-555555555555', 'standard');
do $$ begin
  if (select count(*) from starlink_setups) <> 2 then raise exception 'FAIL: owner cannot see their Starlink setups'; end if;
  begin
    insert into starlink_setups (owner_id, plan_name) values (auth.uid(), 'Second general row');
    raise exception 'FAIL: two general Starlink rows for one rider';
  exception when unique_violation then null;
  end;
  begin
    insert into starlink_setups (owner_id, dish_model) values (auth.uid(), 'dishy_mcflatface');
    raise exception 'FAIL: unknown dish model accepted';
  exception when check_violation then null;
  end;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
do $$ begin
  if (select count(*) from starlink_setups) <> 0 then raise exception 'FAIL: saw another rider''s Starlink setup'; end if;
  update starlink_setups set plan_name = 'hacked';
  if found then raise exception 'FAIL: edited another rider''s Starlink setup'; end if;
  delete from starlink_setups;
  if found then raise exception 'FAIL: deleted another rider''s Starlink setup'; end if;
  begin
    insert into starlink_setups (owner_id, plan_name) values ('00000000-0000-0000-0000-00000000000d', 'Planted');
    raise exception 'FAIL: created a Starlink setup for someone else';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into starlink_setups (owner_id, vehicle_id) values (auth.uid(), '55555555-5555-5555-5555-555555555555');
    raise exception 'FAIL: Starlink setup linked to someone else''s vehicle';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
reset role;
-- Deleting the vehicle removes its Starlink row; the general row stays.
delete from vehicles where id = '55555555-5555-5555-5555-555555555555';
do $$ begin
  if (select count(*) from starlink_setups where owner_id = '00000000-0000-0000-0000-00000000000d') <> 1 then
    raise exception 'FAIL: vehicle delete did not tidy Starlink rows correctly';
  end if;
end $$;

-- 17. Ride chat: only joined riders read and post; announcements only from organizers.
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc', auth.uid(), 'Chat ride', now() + interval '1 day', 38.5, -109.5, 'public');
reset role;
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
select join_ride('cccccccc-cccc-cccc-cccc-cccccccccccc');
reset role;
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
select join_ride('cccccccc-cccc-cccc-cccc-cccccccccccc');
reset role;
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
update ride_members set role = 'co_organizer'
where ride_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' and user_id = '00000000-0000-0000-0000-00000000000c';
insert into ride_messages (ride_id, user_id, kind, body)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc', auth.uid(), 'announcement', 'Meet at 8, wheels up 8:30');
reset role;

-- Ben (rider) chats, but cannot announce or post as someone else.
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
insert into ride_messages (ride_id, user_id, body) values ('cccccccc-cccc-cccc-cccc-cccccccccccc', auth.uid(), '  See you there  ');
do $$ begin
  if (select body from ride_messages where user_id = auth.uid()) <> 'See you there' then raise exception 'FAIL: message not trimmed'; end if;
  if (select count(*) from ride_messages where ride_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc') <> 2 then
    raise exception 'FAIL: joined rider cannot read the ride chat';
  end if;
  begin
    insert into ride_messages (ride_id, user_id, kind, body) values ('cccccccc-cccc-cccc-cccc-cccccccccccc', auth.uid(), 'announcement', 'I am the boss now');
    raise exception 'FAIL: rider posted an announcement';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into ride_messages (ride_id, user_id, body) values ('cccccccc-cccc-cccc-cccc-cccccccccccc', '00000000-0000-0000-0000-00000000000a', 'Spoofed');
    raise exception 'FAIL: rider posted as someone else';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into ride_messages (ride_id, user_id, body) values ('cccccccc-cccc-cccc-cccc-cccccccccccc', auth.uid(), repeat('x', 501));
    raise exception 'FAIL: overlong message accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    insert into ride_messages (ride_id, user_id, body) values ('cccccccc-cccc-cccc-cccc-cccccccccccc', auth.uid(), '   ');
    raise exception 'FAIL: blank message accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  -- Messages cannot be edited or deleted.
  update ride_messages set body = 'edited' where user_id = auth.uid();
  if found then raise exception 'FAIL: rider edited a chat message'; end if;
  delete from ride_messages where ride_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  if found then raise exception 'FAIL: rider deleted chat messages'; end if;
end $$;
reset role;

-- Cara (co-organizer) can announce. Backdating created_at or future sent_at is ignored.
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
insert into ride_messages (ride_id, user_id, kind, body, created_at, sent_at)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc', auth.uid(), 'announcement', 'Gas in Green River', '2000-01-01', now() + interval '1 day');
do $$ begin
  if not exists (select 1 from ride_messages where user_id = auth.uid() and kind = 'announcement'
                 and created_at > now() - interval '1 minute' and sent_at <= now()) then
    raise exception 'FAIL: co-organizer announcement missing or timestamps not clamped';
  end if;
end $$;
reset role;

-- Dan (not on the ride) can neither read nor post.
select as_user('00000000-0000-0000-0000-00000000000d');
set role authenticated;
do $$ begin
  if (select count(*) from ride_messages) <> 0 then raise exception 'FAIL: non-member read the ride chat'; end if;
  begin
    insert into ride_messages (ride_id, user_id, body) values ('cccccccc-cccc-cccc-cccc-cccccccccccc', auth.uid(), 'Hi strangers');
    raise exception 'FAIL: non-member posted in the ride chat';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select as_user(null);
set role anon;
do $$ begin
  begin
    if (select count(*) from ride_messages) <> 0 then raise exception 'FAIL: signed-out visitor read the ride chat'; end if;
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Rate limit: Ben has 1 message this minute; 9 more are fine, the 11th is refused.
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
do $$ begin
  for i in 1..9 loop
    insert into ride_messages (ride_id, user_id, kind, body) values ('cccccccc-cccc-cccc-cccc-cccccccccccc', auth.uid(), 'status', 'All good');
  end loop;
  begin
    insert into ride_messages (ride_id, user_id, body) values ('cccccccc-cccc-cccc-cccc-cccccccccccc', auth.uid(), 'one too many');
    raise exception 'FAIL: rate limit not enforced';
  exception when raise_exception then
    if sqlerrm not like 'slow down%' then raise; end if;
  end;
end $$;
-- Leaving the ride removes chat access.
select leave_ride('cccccccc-cccc-cccc-cccc-cccccccccccc');
do $$ begin
  if (select count(*) from ride_messages) <> 0 then raise exception 'FAIL: rider who left can still read the chat'; end if;
end $$;
reset role;

-- 18. Post-ride summary: riders read only their own track; group totals only after the ride ends.
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility)
values ('dddddddd-dddd-dddd-dddd-dddddddddddd', auth.uid(), 'Track ride', now(), 38.5, -109.5, 'public');
reset role;
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
select join_ride('dddddddd-dddd-dddd-dddd-dddddddddddd');
reset role;
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
select join_ride('dddddddd-dddd-dddd-dddd-dddddddddddd');
reset role;
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
select set_ride_status('dddddddd-dddd-dddd-dddd-dddddddddddd', 'live');
-- Olivia: 10 segments of about 111 m every 10 s (about 25 mph), so about 0.69 miles.
insert into ride_tracks (ride_id, user_id, points)
select 'dddddddd-dddd-dddd-dddd-dddddddddddd', auth.uid(),
       jsonb_agg(jsonb_build_array(-109.5, 38.5 + i * 0.001, 1760000000 + i * 10, 11) order by i)
from generate_series(0, 10) i;
reset role;
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
-- Ben: twice as far, plus one wild GPS spike that must not add miles or top speed.
insert into ride_tracks (ride_id, user_id, points)
select 'dddddddd-dddd-dddd-dddd-dddddddddddd', auth.uid(),
       jsonb_agg(case when i = 7 then jsonb_build_array(-108.5, 38.5, 1760000000 + i * 10, 300)
                      else jsonb_build_array(-109.5, 38.5 + i * 0.001, 1760000000 + i * 10, 12) end order by i)
from generate_series(0, 21) i;
do $$ begin
  begin
    insert into ride_tracks (ride_id, user_id, points) values ('dddddddd-dddd-dddd-dddd-dddddddddddd', '00000000-0000-0000-0000-00000000000c', '[]');
    raise exception 'FAIL: wrote a track for someone else';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
-- Cara: parked, GPS jitter of about a meter. Adds no distance.
insert into ride_tracks (ride_id, user_id, points)
select 'dddddddd-dddd-dddd-dddd-dddddddddddd', auth.uid(),
       jsonb_agg(jsonb_build_array(-109.5 + (i % 2) * 0.00001, 38.6, 1760000000 + i * 10, 0) order by i)
from generate_series(0, 30) i;
do $$ begin
  if (select count(*) from ride_tracks where ride_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd') <> 1 then
    raise exception 'FAIL: rider can read other riders'' tracks';
  end if;
  if (select count(*) from ride_group_summary('dddddddd-dddd-dddd-dddd-dddddddddddd')) <> 0 then
    raise exception 'FAIL: group summary available before the ride ended';
  end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
select set_ride_status('dddddddd-dddd-dddd-dddd-dddddddddddd', 'ended');
do $$
declare s record;
begin
  if (select count(*) from ride_tracks where ride_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd') <> 1 then
    raise exception 'FAIL: organizer can read riders'' tracks';
  end if;
  select * into s from ride_group_summary('dddddddd-dddd-dddd-dddd-dddddddddddd');
  if s.riders_tracked <> 3 then raise exception 'FAIL: expected 3 tracked riders, got %', s.riders_tracked; end if;
  -- Olivia 0.69 mi + Ben about 1.24 mi (19 good segments; the two around the spike are dropped) + Cara 0.
  if s.longest_miles not between 1.1 and 1.4 then raise exception 'FAIL: longest distance %', s.longest_miles; end if;
  if s.total_miles not between 1.8 and 2.1 then raise exception 'FAIL: total distance %', s.total_miles; end if;
  if s.top_speed_mph <> 27 then raise exception 'FAIL: top speed % (GPS spike leaked?)', s.top_speed_mph; end if;
end $$;
reset role;
-- A stranger and a signed-out visitor get nothing.
select as_user('00000000-0000-0000-0000-00000000000d');
set role authenticated;
do $$ begin
  if (select count(*) from ride_tracks) <> 0 then raise exception 'FAIL: stranger read ride tracks'; end if;
  if (select count(*) from ride_group_summary('dddddddd-dddd-dddd-dddd-dddddddddddd')) <> 0 then
    raise exception 'FAIL: stranger got the group summary';
  end if;
end $$;
reset role;
select as_user(null);
set role anon;
do $$ begin
  if (select count(*) from ride_group_summary('dddddddd-dddd-dddd-dddd-dddddddddddd')) <> 0 then
    raise exception 'FAIL: signed-out visitor got the group summary';
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Discovery by state, and private ride previews by invite code
-- ---------------------------------------------------------------------------
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
insert into rides (id, organizer_id, invite_code, name, meet_at, meet_area_lat, meet_area_lng, meet_state, visibility)
values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', auth.uid(), 'PRIV1234', 'Friends only', now() + interval '2 days', 39.07, -108.55, 'CO', 'private');
insert into ride_private_details (ride_id, meet_lat, meet_lng, meet_label)
values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 39.0712, -108.5501, 'My driveway');
do $$ begin
  begin
    update rides set meet_state = 'Colorado' where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    raise exception 'FAIL: meet_state accepted a full state name';
  exception when check_violation then null;
  end;
end $$;
reset role;

-- A stranger cannot list or search private rides, but the invite code opens the preview.
select as_user('00000000-0000-0000-0000-00000000000d');
set role authenticated;
do $$ begin
  if exists (select 1 from rides where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee') then
    raise exception 'FAIL: stranger can list a private ride';
  end if;
  if exists (select 1 from rides where meet_state = 'CO') then
    raise exception 'FAIL: private ride shows up in state discovery';
  end if;
  if (select count(*) from ride_preview(' priv1234 ')) <> 1 then
    raise exception 'FAIL: invite code does not open the private ride preview';
  end if;
  if (select count(*) from ride_preview('NOPE0000')) <> 0 then
    raise exception 'FAIL: wrong code returned a ride';
  end if;
  if exists (select 1 from ride_private_details where ride_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee') then
    raise exception 'FAIL: stranger saw the private ride''s exact meeting point';
  end if;
  begin
    perform join_ride(p_ride => 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
    raise exception 'FAIL: joined a private ride without the code';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  if join_ride(p_invite_code => 'priv1234') <> 'joined' then
    raise exception 'FAIL: invite code did not join the private ride';
  end if;
  if not exists (select 1 from ride_private_details where ride_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee') then
    raise exception 'FAIL: joined rider cannot see the meeting point';
  end if;
end $$;
reset role;

-- Signed out: the code shows the preview, nothing else.
select as_user(null);
set role anon;
do $$ begin
  if exists (select 1 from rides where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee') then
    raise exception 'FAIL: signed-out visitor can list a private ride';
  end if;
  if (select name from ride_preview('PRIV1234')) <> 'Friends only' then
    raise exception 'FAIL: signed-out preview by code failed';
  end if;
end $$;
reset role;

-- 19. Leader-only chat messages: only the sender and the leader can read them.
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility)
values ('12121212-1212-1212-1212-121212121212', auth.uid(), 'Leader ride', now() + interval '1 day', 38.5, -109.5, 'public');
reset role;
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
select join_ride('12121212-1212-1212-1212-121212121212');
select register_push_token('ben-token-0000000000000000', 'ios');
reset role;
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
select join_ride('12121212-1212-1212-1212-121212121212');
select register_push_token('cara-token-000000000000000', 'ios');
-- No Leader assigned yet, so the organizer (Olivia) leads.
insert into ride_messages (id, ride_id, user_id, audience, body)
values ('e0000000-0000-0000-0000-000000000001', '12121212-1212-1212-1212-121212121212', auth.uid(), 'leader', 'Low on fuel, can we stop?');
insert into ride_messages (id, ride_id, user_id, body)
values ('e0000000-0000-0000-0000-000000000002', '12121212-1212-1212-1212-121212121212', auth.uid(), 'Hi all');
do $$ begin
  if (select count(*) from ride_messages where ride_id = '12121212-1212-1212-1212-121212121212') <> 2 then
    raise exception 'FAIL: sender cannot read their own leader-only message';
  end if;
  begin
    perform * from ride_message_recipients('e0000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: a rider called ride_message_recipients';
  exception when raise_exception or insufficient_privilege then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
select register_push_token('olivia-token-0000000000000', 'ios');
do $$ begin
  if not exists (select 1 from ride_messages where id = 'e0000000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: organizer (leading, no Leader assigned) cannot read a leader-only message';
  end if;
  begin
    insert into ride_messages (ride_id, user_id, kind, audience, body)
    values ('12121212-1212-1212-1212-121212121212', auth.uid(), 'announcement', 'leader', 'Secret announcement');
    raise exception 'FAIL: leader-only announcement accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
do $$ begin
  if exists (select 1 from ride_messages where id = 'e0000000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: another rider read a leader-only message';
  end if;
  if not exists (select 1 from ride_messages where id = 'e0000000-0000-0000-0000-000000000002') then
    raise exception 'FAIL: rider cannot read a message to everyone';
  end if;
  if (select count(*) from push_tokens) <> 1 then raise exception 'FAIL: rider sees push tokens that are not theirs'; end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-00000000000d');
set role authenticated;
do $$ begin
  if (select count(*) from ride_messages where ride_id = '12121212-1212-1212-1212-121212121212') <> 0 then
    raise exception 'FAIL: non-member read the leader ride chat';
  end if;
  if (select count(*) from push_tokens) <> 0 then raise exception 'FAIL: stranger read push tokens'; end if;
end $$;
reset role;

-- Notification recipients (server side): the leader only for leader-only, everyone else otherwise.
do $$ begin
  if (select array_agg(token order by token) from ride_message_recipients('e0000000-0000-0000-0000-000000000001'))
     <> array['olivia-token-0000000000000'] then
    raise exception 'FAIL: leader-only notification not limited to the leader';
  end if;
  if (select array_agg(token order by token) from ride_message_recipients('e0000000-0000-0000-0000-000000000002'))
     <> array['ben-token-0000000000000000', 'olivia-token-0000000000000'] then
    raise exception 'FAIL: message to everyone not notified to everyone but the sender';
  end if;
end $$;

-- Olivia makes Ben the Leader: now Ben reads the leader-only message and Olivia doesn't.
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
update ride_members set role = 'leader'
where ride_id = '12121212-1212-1212-1212-121212121212' and user_id = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  if exists (select 1 from ride_messages where id = 'e0000000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: organizer still reads leader-only messages after assigning a Leader';
  end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
do $$ begin
  if not exists (select 1 from ride_messages where id = 'e0000000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: assigned Leader cannot read a leader-only message';
  end if;
end $$;
reset role;
do $$ begin
  if (select array_agg(token) from ride_message_recipients('e0000000-0000-0000-0000-000000000001'))
     <> array['ben-token-0000000000000000'] then
    raise exception 'FAIL: leader-only notification did not follow the new Leader';
  end if;
end $$;

-- A phone that signs in as someone else moves its token to them.
select as_user('00000000-0000-0000-0000-00000000000d');
set role authenticated;
select register_push_token('ben-token-0000000000000000', 'ios');
reset role;
do $$ begin
  if (select user_id from push_tokens where token = 'ben-token-0000000000000000') <> '00000000-0000-0000-0000-00000000000d' then
    raise exception 'FAIL: device token did not move to the newly signed-in rider';
  end if;
end $$;

-- Ride names: Ben picks a nickname; everyone sees it, nobody else can change it.
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
update profiles set display_name = '   Dusty
   Ben  ' where id = auth.uid();
update profiles set display_name = 'Hacked' where id = '00000000-0000-0000-0000-00000000000c';
insert into profile_private (user_id, emergency_contact_name, emergency_contact_phone)
values (auth.uid(), 'Mom', '555-0100');
reset role;
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
do $$ begin
  if (select display_name from profiles where id = '00000000-0000-0000-0000-00000000000b') <> 'Dusty Ben' then
    raise exception 'FAIL: other riders do not see the tidied nickname';
  end if;
  if (select display_name from profiles where id = '00000000-0000-0000-0000-00000000000c') <> 'Cara Rider' then
    raise exception 'FAIL: a rider changed someone else''s name';
  end if;
  if exists (select 1 from profile_private) then
    raise exception 'FAIL: a rider read someone else''s emergency contact';
  end if;
  if exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name like 'emergency%') then
    raise exception 'FAIL: emergency contact still sits on the readable profile row';
  end if;
end $$;
update profiles set display_name = 'Cara the Extremely Long Named Rider' where id = auth.uid();
do $$ begin
  if (select display_name from profiles where id = auth.uid()) <> 'Cara the Extremely Long' then
    raise exception 'FAIL: ride name longer than 24 characters';
  end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
do $$ begin
  if (select emergency_contact_phone from profile_private where user_id = auth.uid()) <> '555-0100' then
    raise exception 'FAIL: rider cannot read their own emergency contact';
  end if;
end $$;
reset role;

-- A long name from a social sign-in is cut to fit instead of breaking sign-up.
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000e', '{"full_name":"Bartholomew Maximilian Featherstonehaugh"}');
do $$ begin
  if (select display_name from profiles where id = '00000000-0000-0000-0000-00000000000e') <> 'Bartholomew Maximilian F' then
    raise exception 'FAIL: long sign-in name not cut to 24 characters';
  end if;
end $$;


-- 20. Ride route: only the ride's joined riders can read it; only its organizers can change it.
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility, max_vehicles)
values ('20000000-0000-0000-0000-000000000001', auth.uid(), 'Route test', now() + interval '1 day', 38.57, -109.55, 'public', 2);
insert into ride_private_details (ride_id, meet_lat, meet_lng)
values ('20000000-0000-0000-0000-000000000001', 38.5733, -109.5498);
do $$ begin
  update ride_private_details
     set route_geojson = '{"type":"Feature","geometry":{"type":"LineString","coordinates":[[-109.5498,38.5733],[-109.53,38.60]]},"properties":{"source":"drawn"}}',
         waypoints = '[[-109.5498,38.5733],[-109.53,38.60]]'
   where ride_id = '20000000-0000-0000-0000-000000000001';
  if not found then raise exception 'FAIL: organizer could not save the route'; end if;
end $$;
reset role;

select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
do $$ begin
  if join_ride('20000000-0000-0000-0000-000000000001') <> 'joined' then raise exception 'FAIL: Ben should join the route ride'; end if;
  if (select route_geojson from ride_private_details where ride_id = '20000000-0000-0000-0000-000000000001') is null then
    raise exception 'FAIL: joined rider cannot see the route';
  end if;
  update ride_private_details set route_geojson = null where ride_id = '20000000-0000-0000-0000-000000000001';
  if found then raise exception 'FAIL: a rider changed the route'; end if;
end $$;
reset role;

select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
do $$ begin
  if join_ride('20000000-0000-0000-0000-000000000001') <> 'waitlisted' then raise exception 'FAIL: Cara should be waitlisted on the route ride'; end if;
  if exists (select 1 from ride_private_details where ride_id = '20000000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: waitlisted rider saw the route';
  end if;
end $$;
reset role;

select as_user('00000000-0000-0000-0000-00000000000d');
set role authenticated;
do $$ begin
  if exists (select 1 from ride_private_details where ride_id = '20000000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: stranger saw the route';
  end if;
  update ride_private_details set route_geojson = null where ride_id = '20000000-0000-0000-0000-000000000001';
  if found then raise exception 'FAIL: stranger changed the route'; end if;
end $$;
reset role;

-- Leaving the ride takes the route away (Cara moves up from the waitlist and gets it).
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
select leave_ride('20000000-0000-0000-0000-000000000001');
do $$ begin
  if exists (select 1 from ride_private_details where ride_id = '20000000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: rider who left can still see the route';
  end if;
end $$;
reset role;
do $$ begin
  if (select route_geojson from ride_private_details where ride_id = '20000000-0000-0000-0000-000000000001') is null then
    raise exception 'FAIL: a rider changed the route';
  end if;
end $$;

-- 21. Hand off the ride, and the tail gunner.
create function expect_refused(p_sql text, p_fail text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    return;
  end;
  raise exception 'FAIL: %', p_fail;
end;
$$;
create function role_of(p_ride uuid, p_user uuid) returns member_role language sql security definer as $$
  select role from ride_members where ride_id = p_ride and user_id = p_user;
$$;

select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility)
values ('13131313-1313-1313-1313-131313131313', auth.uid(), 'Hand-off ride', now() + interval '1 day', 38.5, -109.5, 'public');
reset role;
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
select join_ride('13131313-1313-1313-1313-131313131313');
reset role;
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
select join_ride('13131313-1313-1313-1313-131313131313');
-- Cara writes to the leader while Olivia still leads.
insert into ride_messages (id, ride_id, user_id, audience, body)
values ('e0000000-0000-0000-0000-000000000013', '13131313-1313-1313-1313-131313131313', auth.uid(), 'leader', 'Need to stop soon');
reset role;

-- A plain rider can't hand off the ride or pick the tail gunner.
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
select expect_refused($q$select hand_off_ride('13131313-1313-1313-1313-131313131313', auth.uid())$q$, 'rider took the ride');
select expect_refused($q$select hand_off_ride('13131313-1313-1313-1313-131313131313', '00000000-0000-0000-0000-00000000000c')$q$, 'rider handed off a ride they don''t lead');
select expect_refused($q$select set_tail_gunner('13131313-1313-1313-1313-131313131313', auth.uid())$q$, 'rider made themself tail gunner');
reset role;
do $$ begin
  if (select organizer_id from rides where id = '13131313-1313-1313-1313-131313131313') <> '00000000-0000-0000-0000-00000000000a' then
    raise exception 'FAIL: organizer changed after refused hand-offs';
  end if;
end $$;

-- Olivia picks a tail gunner; there is only ever one.
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
select set_tail_gunner('13131313-1313-1313-1313-131313131313', '00000000-0000-0000-0000-00000000000c');
select set_tail_gunner('13131313-1313-1313-1313-131313131313', '00000000-0000-0000-0000-00000000000b');
select expect_refused($q$select set_tail_gunner('13131313-1313-1313-1313-131313131313', auth.uid())$q$, 'organizer made tail gunner');
select expect_refused($q$select set_tail_gunner('13131313-1313-1313-1313-131313131313', '00000000-0000-0000-0000-00000000000d')$q$, 'non-member made tail gunner');
-- Nobody takes over a ride by editing it directly, not even a co-organizer.
select expect_refused($q$update rides set organizer_id = '00000000-0000-0000-0000-00000000000b' where id = '13131313-1313-1313-1313-131313131313'$q$, 'organizer changed by a direct edit');
select expect_refused($q$update ride_members set role = 'organizer' where ride_id = '13131313-1313-1313-1313-131313131313' and user_id = '00000000-0000-0000-0000-00000000000c'$q$, 'organizer role given by a direct edit');
select expect_refused($q$update ride_members set role = 'rider' where ride_id = '13131313-1313-1313-1313-131313131313' and user_id = auth.uid()$q$, 'organizer role dropped by a direct edit');
update ride_members set role = 'co_organizer'
where ride_id = '13131313-1313-1313-1313-131313131313' and user_id = '00000000-0000-0000-0000-00000000000c';
reset role;
do $$ begin
  if (select count(*) from ride_members where ride_id = '13131313-1313-1313-1313-131313131313' and role = 'sweep') <> 1
     or role_of('13131313-1313-1313-1313-131313131313', '00000000-0000-0000-0000-00000000000b') <> 'sweep' then
    raise exception 'FAIL: tail gunner not moved to the newly picked rider';
  end if;
end $$;
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
select expect_refused($q$update rides set organizer_id = auth.uid() where id = '13131313-1313-1313-1313-131313131313'$q$, 'co-organizer took the ride by a direct edit');
select expect_refused($q$select hand_off_ride('13131313-1313-1313-1313-131313131313', auth.uid())$q$, 'co-organizer took the ride');
reset role;

-- Olivia can't hand the ride to someone who hasn't joined, then hands it to Ben.
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
select expect_refused($q$select hand_off_ride('13131313-1313-1313-1313-131313131313', '00000000-0000-0000-0000-00000000000d')$q$, 'ride handed to a non-member');
select expect_refused($q$select hand_off_ride('13131313-1313-1313-1313-131313131313', auth.uid())$q$, 'ride handed to yourself');
select hand_off_ride('13131313-1313-1313-1313-131313131313', '00000000-0000-0000-0000-00000000000b');
do $$ begin
  if exists (select 1 from ride_messages where id = 'e0000000-0000-0000-0000-000000000013') then
    raise exception 'FAIL: old leader still reads leader-only messages after handing off the ride';
  end if;
end $$;
select expect_refused($q$select set_tail_gunner('13131313-1313-1313-1313-131313131313', null)$q$, 'old organizer still picks the tail gunner');
reset role;
do $$
declare r constant uuid := '13131313-1313-1313-1313-131313131313';
begin
  if (select organizer_id from rides where id = r) <> '00000000-0000-0000-0000-00000000000b' then
    raise exception 'FAIL: hand-off did not move the ride';
  end if;
  if role_of(r, '00000000-0000-0000-0000-00000000000b') <> 'organizer' or role_of(r, '00000000-0000-0000-0000-00000000000a') <> 'rider' then
    raise exception 'FAIL: hand-off roles wrong (new organizer, old one a rider)';
  end if;
  if (select status from ride_members where ride_id = r and user_id = '00000000-0000-0000-0000-00000000000a') <> 'joined' then
    raise exception 'FAIL: old organizer dropped off the ride';
  end if;
  if not is_ride_leader(r, '00000000-0000-0000-0000-00000000000b') or is_ride_leader(r, '00000000-0000-0000-0000-00000000000a') then
    raise exception 'FAIL: leader did not follow the hand-off';
  end if;
  if not is_ride_manager(r, '00000000-0000-0000-0000-00000000000b') or is_ride_manager(r, '00000000-0000-0000-0000-00000000000a') then
    raise exception 'FAIL: organizer rights did not follow the hand-off';
  end if;
  if exists (select 1 from ride_members where ride_id = r and role = 'sweep') then
    raise exception 'FAIL: the new leader is still tail gunner';
  end if;
  if (select array_agg(token) from ride_message_recipients('e0000000-0000-0000-0000-000000000013')) is not null then
    raise exception 'FAIL: leader-only notification went to someone other than the new leader';
  end if;
end $$;
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
do $$ begin
  if not exists (select 1 from ride_messages where id = 'e0000000-0000-0000-0000-000000000013') then
    raise exception 'FAIL: new leader cannot read leader-only messages';
  end if;
end $$;
-- Ben gives Olivia the Leader role; as the leader she hands the lead (not the ride) to Cara.
update ride_members set role = 'leader'
where ride_id = '13131313-1313-1313-1313-131313131313' and user_id = '00000000-0000-0000-0000-00000000000a';
reset role;
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
select hand_off_ride('13131313-1313-1313-1313-131313131313', '00000000-0000-0000-0000-00000000000c');
reset role;
do $$
declare r constant uuid := '13131313-1313-1313-1313-131313131313';
begin
  if (select organizer_id from rides where id = r) <> '00000000-0000-0000-0000-00000000000b' then
    raise exception 'FAIL: handing off the lead gave away the ride';
  end if;
  if role_of(r, '00000000-0000-0000-0000-00000000000c') <> 'leader' or role_of(r, '00000000-0000-0000-0000-00000000000a') <> 'rider' then
    raise exception 'FAIL: lead hand-off roles wrong';
  end if;
  if not is_ride_leader(r, '00000000-0000-0000-0000-00000000000c') or is_ride_leader(r, '00000000-0000-0000-0000-00000000000b') then
    raise exception 'FAIL: leader did not follow the lead hand-off';
  end if;
end $$;
-- The leader picks the tail gunner, then hands the lead back to the organizer.
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
select set_tail_gunner('13131313-1313-1313-1313-131313131313', '00000000-0000-0000-0000-00000000000a');
select hand_off_ride('13131313-1313-1313-1313-131313131313', '00000000-0000-0000-0000-00000000000b');
reset role;
do $$
declare r constant uuid := '13131313-1313-1313-1313-131313131313';
begin
  if role_of(r, '00000000-0000-0000-0000-00000000000a') <> 'sweep' then
    raise exception 'FAIL: leader could not pick the tail gunner';
  end if;
  if role_of(r, '00000000-0000-0000-0000-00000000000b') <> 'organizer' or role_of(r, '00000000-0000-0000-0000-00000000000c') <> 'rider'
     or not is_ride_leader(r, '00000000-0000-0000-0000-00000000000b') then
    raise exception 'FAIL: lead not back with the organizer';
  end if;
end $$;
-- A finished ride can't be handed off.
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
select set_ride_status('13131313-1313-1313-1313-131313131313', 'ended');
select expect_refused($q$select hand_off_ride('13131313-1313-1313-1313-131313131313', '00000000-0000-0000-0000-00000000000c')$q$, 'ended ride handed off');
reset role;

-- 24. Notification settings and the push events behind them.
-- Test-only stand-ins for pg_net and Vault, so the triggers' events can be read back.
create schema if not exists net;
create table net.calls (id serial primary key, url text, body jsonb, headers jsonb);
create or replace function net.http_post(url text, body jsonb, headers jsonb) returns bigint
language sql as $$ insert into net.calls (url, body, headers) values (url, body, headers) returning id::bigint $$;
create schema if not exists vault;
create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
insert into vault.decrypted_secrets values ('onmylead_push_url', 'https://example.test/notify'), ('onmylead_push_secret', 's3cret');
grant usage on schema net to authenticated;
grant execute on all functions in schema net to authenticated;
grant insert on net.calls to authenticated;
grant usage on sequence net.calls_id_seq to authenticated;
create function last_push() returns jsonb language sql as $$ select body from net.calls order by id desc limit 1 $$;
create function push_tokens_for(p_event jsonb) returns text[] language sql as $$
  select coalesce(array_agg(token order by token), '{}') from push_batch(p_event)
$$;

do $$ begin
  if not in_quiet_window(1320, 360, 1400) or not in_quiet_window(1320, 360, 30) or in_quiet_window(1320, 360, 720)
     or not in_quiet_window(60, 120, 90) or in_quiet_window(60, 120, 120) or in_quiet_window(600, 600, 600) then
    raise exception 'FAIL: quiet hours window math';
  end if;
end $$;

select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
select register_push_token('ben-phone-0000000000000000', 'ios');
reset role;

-- Olivia's approval-only ride. Ben asks to join: the organizer hears about it.
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility, join_policy, invite_code)
values ('14141414-1414-1414-1414-141414141414', auth.uid(), 'Push ride', now() + interval '2 days', 38.5, -109.5, 'public', 'approval', 'PUSHRIDE');
reset role;
truncate net.calls;
-- (Written directly: join_ride's own approval check is not what's under test here.)
select as_user('00000000-0000-0000-0000-00000000000b');
insert into ride_members (ride_id, user_id, status) values ('14141414-1414-1414-1414-141414141414', auth.uid(), 'pending');
do $$ begin
  if last_push() ->> 'change' <> 'pending' or (select count(*) from net.calls) <> 1 then
    raise exception 'FAIL: join request not queued for push';
  end if;
  if push_tokens_for(last_push()) <> array['olivia-token-0000000000000'] then
    raise exception 'FAIL: join request not sent to the organizer only';
  end if;
  if (select title from push_batch(last_push())) not like '% asks to join Push ride' then
    raise exception 'FAIL: join request title';
  end if;
end $$;

-- Olivia approves Ben: Ben hears he's in.
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
update ride_members set status = 'joined'
where ride_id = '14141414-1414-1414-1414-141414141414' and user_id = '00000000-0000-0000-0000-00000000000b';
reset role;
do $$ begin
  if last_push() ->> 'change' <> 'in' or push_tokens_for(last_push()) <> array['ben-phone-0000000000000000'] then
    raise exception 'FAIL: approved rider not told they are in';
  end if;
end $$;

-- Cara joins with the invite code: the organizer hears about it, Ben doesn't.
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
select join_ride(p_invite_code => 'PUSHRIDE');
reset role;
do $$ begin
  if last_push() ->> 'change' <> 'joined' or push_tokens_for(last_push()) <> array['olivia-token-0000000000000'] then
    raise exception 'FAIL: new rider not announced to the organizer only';
  end if;
end $$;

-- Settings are private: each rider reads and writes only their own.
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
insert into notification_settings (user_id, rider_status, previews, time_zone)
values (auth.uid(), false, false, 'America/Denver');
select expect_refused($q$insert into notification_settings (user_id) values ('00000000-0000-0000-0000-00000000000b')$q$, 'rider wrote someone else''s notification settings');
select expect_refused($q$update notification_settings set time_zone = 'Mars/Olympus' where user_id = auth.uid()$q$, 'unknown time zone saved');
select expect_refused($q$select * from push_batch('{"type":"status"}')$q$, 'rider called push_batch');
reset role;
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
do $$ begin
  if exists (select 1 from notification_settings where user_id <> auth.uid()) then
    raise exception 'FAIL: rider read someone else''s notification settings';
  end if;
end $$;
update notification_settings set chat = false where user_id = '00000000-0000-0000-0000-00000000000c';
reset role;
do $$ begin
  if not (select chat from notification_settings where user_id = '00000000-0000-0000-0000-00000000000c') then
    raise exception 'FAIL: rider changed someone else''s notification settings';
  end if;
end $$;

-- Ride status taps. Cara switched rider status off, but help always gets through.
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
insert into rider_statuses (ride_id, user_id, status) values ('14141414-1414-1414-1414-141414141414', auth.uid(), 'flat_tire');
reset role;
do $$ begin
  if last_push() ->> 'type' <> 'status' or push_tokens_for(last_push()) <> array['olivia-token-0000000000000'] then
    raise exception 'FAIL: rider status ignored the setting or went to the sender';
  end if;
  if (select title from push_batch(last_push())) not like '% has a flat tire' then raise exception 'FAIL: flat tire title'; end if;
end $$;
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
insert into rider_statuses (ride_id, user_id, status, created_at) values ('14141414-1414-1414-1414-141414141414', auth.uid(), 'emergency', now() + interval '1 second');
reset role;
do $$ begin
  if push_tokens_for(last_push()) <> array['cara-token-000000000000000', 'olivia-token-0000000000000'] then
    raise exception 'FAIL: EMERGENCY did not reach every rider';
  end if;
  if (select title from push_batch(last_push()) limit 1) not like 'EMERGENCY: % needs help now' then raise exception 'FAIL: emergency title'; end if;
end $$;
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
insert into rider_statuses (ride_id, user_id, status, created_at) values ('14141414-1414-1414-1414-141414141414', auth.uid(), 'ok', now() + interval '2 seconds');
reset role;
do $$ begin
  if push_tokens_for(last_push()) <> array['olivia-token-0000000000000'] then
    raise exception 'FAIL: all good after an emergency not sent';
  end if;
end $$;
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
insert into rider_statuses (ride_id, user_id, status, created_at) values ('14141414-1414-1414-1414-141414141414', auth.uid(), 'ok', now() + interval '3 seconds');
reset role;
do $$ begin
  if push_tokens_for(last_push()) <> '{}' then raise exception 'FAIL: repeated all good was sent'; end if;
end $$;

-- Chat: Cara hides message text, so she gets the notice without the words.
-- (Ben chatted a lot earlier in this script; age those so the rate limit doesn't trip.)
update ride_messages set created_at = created_at - interval '2 minutes' where user_id = '00000000-0000-0000-0000-00000000000b';
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
insert into ride_messages (ride_id, user_id, body) values ('14141414-1414-1414-1414-141414141414', auth.uid(), 'Gas station at mile 12');
reset role;
do $$ begin
  if last_push() ->> 'type' <> 'message' then raise exception 'FAIL: chat message not queued through the new path'; end if;
  if (select body from push_batch(last_push()) where token = 'olivia-token-0000000000000') <> 'Gas station at mile 12'
     or (select body from push_batch(last_push()) where token = 'cara-token-000000000000000') like '%mile 12%' then
    raise exception 'FAIL: message previews setting';
  end if;
end $$;

-- Quiet hours: Olivia's quiet window covers now, so chat waits but an emergency doesn't.
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
insert into notification_settings (user_id, quiet_hours, quiet_start, quiet_end, time_zone)
select auth.uid(), true, (m + 1430) % 1440, (m + 10) % 1440, 'America/Denver'
from (select (extract(hour from now() at time zone 'America/Denver') * 60 + extract(minute from now() at time zone 'America/Denver'))::int as m) x;
reset role;
do $$ begin
  if push_tokens_for(jsonb_build_object('type', 'message', 'id', (select id from ride_messages where body = 'Gas station at mile 12')))
     <> array['cara-token-000000000000000'] then
    raise exception 'FAIL: chat push sent during quiet hours';
  end if;
  if push_tokens_for(jsonb_build_object('type', 'status', 'id', (select id from rider_statuses where status = 'emergency' and ride_id = '14141414-1414-1414-1414-141414141414')))
     <> array['cara-token-000000000000000', 'olivia-token-0000000000000'] then
    raise exception 'FAIL: emergency held back by quiet hours';
  end if;
end $$;
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
update notification_settings set quiet_hours = false where user_id = auth.uid();

-- Olivia moves the meeting time: riders hear it (in their own time zone when known), she doesn't.
update rides set meet_at = '2030-06-01 15:30:00+00' where id = '14141414-1414-1414-1414-141414141414';
reset role;
do $$ begin
  if last_push() ->> 'change' <> 'time' or push_tokens_for(last_push()) <> array['ben-phone-0000000000000000', 'cara-token-000000000000000'] then
    raise exception 'FAIL: new ride time not sent to the riders';
  end if;
  if (select body from push_batch(last_push()) where token = 'cara-token-000000000000000') <> 'Now meeting Saturday, June 1 at 9:30 AM.'
     or (select body from push_batch(last_push()) where token = 'ben-phone-0000000000000000') <> 'Tap to see the new time.' then
    raise exception 'FAIL: new ride time text';
  end if;
end $$;

-- Olivia makes Ben the leader: Ben hears it. Starting the ride reaches everyone else.
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
update ride_members set role = 'leader'
where ride_id = '14141414-1414-1414-1414-141414141414' and user_id = '00000000-0000-0000-0000-00000000000b';
reset role;
do $$ begin
  if last_push() ->> 'role' <> 'leader' or push_tokens_for(last_push()) <> array['ben-phone-0000000000000000'] then
    raise exception 'FAIL: new leader not told';
  end if;
end $$;
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
select set_ride_status('14141414-1414-1414-1414-141414141414', 'live');
reset role;
do $$ begin
  if last_push() ->> 'change' <> 'live' or push_tokens_for(last_push()) <> array['ben-phone-0000000000000000', 'cara-token-000000000000000'] then
    raise exception 'FAIL: ride start not sent';
  end if;
end $$;

-- Ben switches ride changes off; the next change skips him.
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
insert into notification_settings (user_id, ride_changes) values (auth.uid(), false);
reset role;
do $$ begin
  if push_tokens_for(jsonb_build_object('type', 'ride', 'id', '14141414-1414-1414-1414-141414141414', 'change', 'cancelled',
                                        'actor', '00000000-0000-0000-0000-00000000000a'))
     <> array['cara-token-000000000000000'] then
    raise exception 'FAIL: ride changes setting ignored';
  end if;
end $$;

-- Approval-only rides: a new rider asking to join waits for the organizer; an invited rider
-- and a rider with the invite code go straight in.
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility, join_policy, invite_code)
values ('15151515-1515-1515-1515-151515151515', auth.uid(), 'Ask first ride', now() + interval '3 days', 38.5, -109.5, 'public', 'approval', 'ASKFIRST');
reset role;
insert into ride_members (ride_id, user_id, status)
values ('15151515-1515-1515-1515-151515151515', '00000000-0000-0000-0000-00000000000b', 'invited');
select as_user('00000000-0000-0000-0000-00000000000d');
set role authenticated;
do $$ begin
  if join_ride('15151515-1515-1515-1515-151515151515') <> 'pending' then
    raise exception 'FAIL: approval-only ride let a new rider straight in';
  end if;
  if join_ride('15151515-1515-1515-1515-151515151515') <> 'pending' then
    raise exception 'FAIL: asking again changed a pending request';
  end if;
  if (select count(*) from ride_private_details where ride_id = '15151515-1515-1515-1515-151515151515') <> 0 then
    raise exception 'FAIL: pending rider saw the meeting point';
  end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
do $$ begin
  if join_ride('15151515-1515-1515-1515-151515151515') <> 'joined' then
    raise exception 'FAIL: invited rider not let in on an approval-only ride';
  end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
do $$ begin
  if join_ride(p_invite_code => 'askfirst') <> 'joined' then
    raise exception 'FAIL: invite code not let in on an approval-only ride';
  end if;
end $$;
reset role;

-- 25. Cancelling and deleting a ride tells everyone on it, by push and by email.
update auth.users set email = case id
  when '00000000-0000-0000-0000-00000000000a' then 'olivia@example.test'
  when '00000000-0000-0000-0000-00000000000b' then 'ben@example.test'
  when '00000000-0000-0000-0000-00000000000c' then 'cara@example.test'
  else 'dan@example.test' end;
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility)
values ('16161616-1616-1616-1616-161616161616', auth.uid(), 'Cancel me', '2030-06-01 15:00+00', 38.5, -109.5, 'public'),
       ('17171717-1717-1717-1717-171717171717', auth.uid(), 'Delete me', '2030-06-02 15:00+00', 38.5, -109.5, 'public');
reset role;
insert into ride_members (ride_id, user_id, status) values
  ('16161616-1616-1616-1616-161616161616', '00000000-0000-0000-0000-00000000000b', 'joined'),
  ('16161616-1616-1616-1616-161616161616', '00000000-0000-0000-0000-00000000000c', 'pending'),
  ('17171717-1717-1717-1717-171717171717', '00000000-0000-0000-0000-00000000000b', 'joined'),
  ('17171717-1717-1717-1717-171717171717', '00000000-0000-0000-0000-00000000000c', 'joined');

-- Only the organizer can cancel or delete.
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
select expect_refused($q$select cancel_ride('16161616-1616-1616-1616-161616161616')$q$, 'rider cancelled the ride');
select expect_refused($q$select delete_ride('16161616-1616-1616-1616-161616161616')$q$, 'rider deleted the ride');
select expect_refused($q$select * from email_batch('{"type":"ride","change":"cancelled","id":"16161616-1616-1616-1616-161616161616"}')$q$, 'rider called email_batch');
reset role;
do $$ begin
  if (select status from rides where id = '16161616-1616-1616-1616-161616161616') <> 'scheduled' then
    raise exception 'FAIL: rider changed the ride';
  end if;
end $$;

-- Olivia cancels: Cara (pending) gets the push, Ben switched ride changes off; both get the email.
truncate net.calls;
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
select cancel_ride('16161616-1616-1616-1616-161616161616');
select expect_refused($q$select cancel_ride('16161616-1616-1616-1616-161616161616')$q$, 'cancelled the ride twice');
reset role;
do $$ begin
  if (select status from rides where id = '16161616-1616-1616-1616-161616161616') <> 'cancelled' then
    raise exception 'FAIL: ride not cancelled';
  end if;
  if last_push() ->> 'change' <> 'cancelled' or push_tokens_for(last_push()) <> array['cara-token-000000000000000'] then
    raise exception 'FAIL: cancel push not sent to the riders';
  end if;
  if (select array_agg(email order by email) from email_batch(last_push())) <> array['ben@example.test', 'cara@example.test'] then
    raise exception 'FAIL: cancel email recipients';
  end if;
  if (select meet_local from email_batch(last_push()) where email = 'cara@example.test') <> 'Saturday, June 1 at 9:00 AM'
     or (select organizer_name from email_batch(last_push()) limit 1) <> 'Olivia Organizer'
     or (select bool_or(deleted) from email_batch(last_push())) then
    raise exception 'FAIL: cancel email details';
  end if;
end $$;

-- Cara turns the emails off.
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
update notification_settings set ride_emails = false where user_id = auth.uid();
reset role;

-- Olivia deletes a ride people joined: they hear it was cancelled, and the ride is gone.
truncate net.calls;
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
select delete_ride('17171717-1717-1717-1717-171717171717');
reset role;
do $$ begin
  if exists (select 1 from rides where id = '17171717-1717-1717-1717-171717171717')
     or exists (select 1 from ride_members where ride_id = '17171717-1717-1717-1717-171717171717') then
    raise exception 'FAIL: ride not deleted';
  end if;
  if last_push() ->> 'type' <> 'ride_deleted' or push_tokens_for(last_push()) <> array['cara-token-000000000000000'] then
    raise exception 'FAIL: delete push not sent to the riders';
  end if;
  if (select title from push_batch(last_push())) <> 'Delete me is cancelled' then
    raise exception 'FAIL: delete push title';
  end if;
  if (select array_agg(email) from email_batch(last_push())) <> array['ben@example.test']
     or not (select bool_and(deleted) from email_batch(last_push())) then
    raise exception 'FAIL: delete email recipients or emails setting ignored';
  end if;
end $$;

-- Deleting a ride that was already cancelled sends nothing new.
truncate net.calls;
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
select delete_ride('16161616-1616-1616-1616-161616161616');
reset role;
do $$ begin
  if (select count(*) from net.calls) <> 0 or exists (select 1 from rides where id = '16161616-1616-1616-1616-161616161616') then
    raise exception 'FAIL: deleting a cancelled ride notified again or kept the ride';
  end if;
end $$;

select 'ALL PRIVACY, JOINING AND GARAGE, CHAT, SUMMARY, DISCOVERY, LEADER-ONLY CHAT, RIDE NAME, ROUTE, HAND-OFF, TAIL GUNNER, NOTIFICATION, APPROVAL AND CANCEL/DELETE TESTS PASSED' as result;
