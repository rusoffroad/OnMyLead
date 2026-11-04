-- Edit Ride Details (migration 20261104120000_edit_ride_details.sql): only the ride's leaders can
-- edit, a live ride keeps its time and place, the exact spot stays out of the public row, what
-- changed is recorded, and riders are told about a new meeting spot exactly once. Runs last
-- (run_local.sh) because it swaps queue_push for a logger to see the notifications.
--
-- Riders (all new here):
--   Ed   e0d01 organizer
--   Flo  e0d02 joined, made co-organizer
--   Gus  e0d03 joined
--   Hal  e0d04 a stranger
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000e0d1', '{"full_name":"Ed Leader"}'),
  ('00000000-0000-0000-0000-00000000e0d2', '{"full_name":"Flo Co"}'),
  ('00000000-0000-0000-0000-00000000e0d3', '{"full_name":"Gus Rider"}'),
  ('00000000-0000-0000-0000-00000000e0d4', '{"full_name":"Hal Stranger"}');

create table pushed (event jsonb);
grant insert, select on pushed to authenticated;
create or replace function queue_push(p_event jsonb) returns void language sql security definer set search_path = public as $$
  insert into pushed values (p_event);
$$;

select as_user('00000000-0000-0000-0000-00000000e0d1');
set role authenticated;
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, meet_area_label, visibility, max_vehicles)
values ('0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e', auth.uid(), 'Gold Bar Rim', now() + interval '3 days', 38.58, -109.56, 'Moab, UT', 'public', 8);
insert into ride_private_details (ride_id, meet_lat, meet_lng, meet_label)
values ('0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e', 38.5733, -109.5498, 'Maverik, Main St, Moab, UT');
reset role;
select as_user('00000000-0000-0000-0000-00000000e0d2');
set role authenticated;
select join_ride('0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e');
reset role;
select as_user('00000000-0000-0000-0000-00000000e0d3');
set role authenticated;
select join_ride('0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e');
reset role;
update ride_members set role = 'co_organizer'
where ride_id = '0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e' and user_id = '00000000-0000-0000-0000-00000000e0d2';
delete from pushed;

-- E1. A rider and a stranger can't edit.
do $$ begin
  perform as_user('00000000-0000-0000-0000-00000000e0d3');
  set local role authenticated;
  begin
    perform edit_ride('0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e', '{"name":"Hijacked"}');
    raise exception 'FAIL: a rider edited the ride';
  exception when insufficient_privilege then null;
  end;
  perform as_user('00000000-0000-0000-0000-00000000e0d4');
  begin
    perform edit_ride('0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e', '{"name":"Hijacked"}');
    raise exception 'FAIL: a stranger edited the ride';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;

-- E2. The organizer renames it and moves it an hour: name and time recorded, one "new time" push.
select as_user('00000000-0000-0000-0000-00000000e0d1');
set role authenticated;
select edit_ride('0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e',
  jsonb_build_object('name', '  Gold Bar Rim at Sunrise ', 'meet_at', (select meet_at + interval '1 hour' from rides where id = '0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e')));
reset role;
do $$ begin
  if (select name from rides where id = '0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e') <> 'Gold Bar Rim at Sunrise' then
    raise exception 'FAIL: the name was not saved (trimmed)';
  end if;
  if (select details_changed from rides where id = '0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e') <> '{name,time}' then
    raise exception 'FAIL: details_changed should be {name,time}, got %', (select details_changed from rides where id = '0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e');
  end if;
  if (select details_edited_at from rides where id = '0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e') is null then
    raise exception 'FAIL: details_edited_at was not set';
  end if;
  if (select count(*) from pushed where event ->> 'change' = 'time') <> 1 or (select count(*) from pushed) <> 1 then
    raise exception 'FAIL: expected one new-time notification, got %', (select jsonb_agg(event) from pushed);
  end if;
end $$;
delete from pushed;

-- E3. The co-organizer nudges the exact spot inside the same square mile: private row only,
-- the public area untouched, and one "new meeting spot" push sent by edit_ride itself.
select as_user('00000000-0000-0000-0000-00000000e0d2');
set role authenticated;
select edit_ride('0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e', '{}', '{"meet_lat":38.5740,"meet_lng":-109.5502,"meet_label":"Lot behind Maverik, Moab, UT"}');
reset role;
do $$ begin
  if (select meet_lat from ride_private_details where ride_id = '0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e') <> 38.574 then
    raise exception 'FAIL: the exact spot was not saved';
  end if;
  if (select meet_area_lat from rides where id = '0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e') <> 38.58 then
    raise exception 'FAIL: the public area changed when only the exact spot moved';
  end if;
  if (select count(*) from pushed where event ->> 'change' = 'place') <> 1 or (select count(*) from pushed) <> 1 then
    raise exception 'FAIL: expected one new-spot notification, got %', (select jsonb_agg(event) from pushed);
  end if;
  if (select details_changed from rides where id = '0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e') <> '{place}' then
    raise exception 'FAIL: details_changed should be {place}';
  end if;
end $$;
delete from pushed;

-- E4. Moving to a new public area: the trigger sends the push, edit_ride doesn't send a second one.
select as_user('00000000-0000-0000-0000-00000000e0d1');
set role authenticated;
select edit_ride('0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e',
  '{"meet_area_lat":38.99,"meet_area_lng":-110.15,"meet_area_label":"Green River, UT"}',
  '{"meet_lat":38.9951,"meet_lng":-110.1601,"meet_label":"Trailhead, Green River, UT"}');
reset role;
do $$ begin
  if (select count(*) from pushed) <> 1 then
    raise exception 'FAIL: expected exactly one notification for a new area, got %', (select jsonb_agg(event) from pushed);
  end if;
end $$;
delete from pushed;

-- E5. Details: vehicles, limits, instructions, description. No notification for those.
select as_user('00000000-0000-0000-0000-00000000e0d1');
set role authenticated;
select edit_ride('0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e',
  '{"description":"Bring a radio","vehicle_types":["SXS/UTV","ATV"],"max_vehicles":null,"max_riders":20,"route_miles":18.5,"join_policy":"approval"}',
  '{"instructions":"Air down at the lot"}');
reset role;
do $$ begin
  if (select vehicle_types <> '{SXS/UTV,ATV}' or max_vehicles is not null or max_riders <> 20 or join_policy <> 'approval'
      from rides where id = '0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e') then
    raise exception 'FAIL: the details were not saved';
  end if;
  if (select instructions from ride_private_details where ride_id = '0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e') <> 'Air down at the lot' then
    raise exception 'FAIL: the instructions were not saved';
  end if;
  if (select details_changed from rides where id = '0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e') <> '{details}' then
    raise exception 'FAIL: details_changed should be {details}';
  end if;
  if (select count(*) from pushed) <> 0 then raise exception 'FAIL: details alone should not notify'; end if;
end $$;

-- E6. Once live: the time and the spot are locked, the description isn't.
select as_user('00000000-0000-0000-0000-00000000e0d1');
set role authenticated;
select set_ride_status('0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e', 'live');
reset role;
do $$ begin
  perform as_user('00000000-0000-0000-0000-00000000e0d1');
  set local role authenticated;
  begin
    perform edit_ride('0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e', jsonb_build_object('meet_at', now()));
    raise exception 'FAIL: a live ride''s time changed';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform edit_ride('0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e', '{}', '{"meet_lat":1,"meet_lng":1}');
    raise exception 'FAIL: a live ride''s meeting spot changed';
  exception when invalid_parameter_value then null;
  end;
  perform edit_ride('0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e', '{"description":"Fuel stop first"}');
  reset role;
  if (select description from rides where id = '0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e') <> 'Fuel stop first' then
    raise exception 'FAIL: a live ride''s description should still be editable';
  end if;
end $$;

-- E7. Ended rides can't be edited, and an empty name is refused.
select as_user('00000000-0000-0000-0000-00000000e0d1');
set role authenticated;
select set_ride_status('0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e', 'ended');
reset role;
do $$ begin
  perform as_user('00000000-0000-0000-0000-00000000e0d1');
  set local role authenticated;
  begin
    perform edit_ride('0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e', '{"name":"Again"}');
    raise exception 'FAIL: an ended ride was edited';
  exception when invalid_parameter_value then null;
  end;
  reset role;
end $$;

-- E8. Signed out: refused (the migration also revokes it from anon; the test harness grants every
-- function to anon, so the function's own check is what is tested here).
do $$ begin
  perform as_user(null);
  set local role anon;
  begin
    perform edit_ride('0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e', '{"name":"Anon"}');
    raise exception 'FAIL: a signed-out visitor edited the ride';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;

select 'edit_ride_test passed' as result;
