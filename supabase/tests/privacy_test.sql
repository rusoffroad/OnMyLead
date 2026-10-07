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

select 'ALL PRIVACY, JOINING AND GARAGE TESTS PASSED' as result;
