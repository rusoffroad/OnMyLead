-- Waypoints: a rider's own are only theirs; the leader or an organizer can share one with the ride;
-- shared ones are readable only by riders joined to that ride, never by anyone else.
-- Runs after privacy_test.sql (run_local.sh), which sets up as_user and expect_refused, and grants
-- every table to authenticated, so these checks lean on row level security and the trigger alone.
-- Each block raises an exception if a privacy rule is broken.

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f5', '{"full_name":"Wendy Organizer"}'),
  ('00000000-0000-0000-0000-0000000000f6', '{"full_name":"Liam Leader"}'),
  ('00000000-0000-0000-0000-0000000000f7', '{"full_name":"Rae Rider"}'),
  ('00000000-0000-0000-0000-0000000000f8', '{"full_name":"Sam Stranger"}'),
  ('00000000-0000-0000-0000-0000000000f9', '{"full_name":"Pat Pending"}');

-- Wendy's ride; Liam and Rae join, Pat asks to join a second, approval-only ride.
select as_user('00000000-0000-0000-0000-0000000000f5');
set role authenticated;
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility)
values ('51515151-5151-5151-5151-515151515151', auth.uid(), 'Waypoint ride', now() + interval '1 day', 38.5, -109.5, 'public');
insert into ride_private_details (ride_id, meet_lat, meet_lng) values ('51515151-5151-5151-5151-515151515151', 38.51, -109.51);
reset role;
select as_user('00000000-0000-0000-0000-0000000000f6');
set role authenticated;
select join_ride('51515151-5151-5151-5151-515151515151');
reset role;
select as_user('00000000-0000-0000-0000-0000000000f7');
set role authenticated;
select join_ride('51515151-5151-5151-5151-515151515151');
reset role;
select as_user('00000000-0000-0000-0000-0000000000f9');
set role authenticated;
select join_ride('51515151-5151-5151-5151-515151515151');
reset role;
-- Liam leads; Pat is only pending (asked, not yet approved).
update ride_members set role = 'leader' where ride_id = '51515151-5151-5151-5151-515151515151' and user_id = '00000000-0000-0000-0000-0000000000f6';
update ride_members set status = 'pending' where ride_id = '51515151-5151-5151-5151-515151515151' and user_id = '00000000-0000-0000-0000-0000000000f9';

-- W1. Rae (a rider) drops her own waypoint, but can't share one with the ride.
select as_user('00000000-0000-0000-0000-0000000000f7');
set role authenticated;
insert into ride_waypoints (id, ride_id, name, kind, lat, lng)
values ('a1000000-0000-0000-0000-000000000001', '51515151-5151-5151-5151-515151515151', '  Rae''s Camp  ', 'camp', 38.6, -109.6);
select expect_refused(
  $q$insert into ride_waypoints (ride_id, name, lat, lng, shared) values ('51515151-5151-5151-5151-515151515151', 'For All', 38.6, -109.6, true)$q$,
  'a rider shared a waypoint');
select expect_refused(
  $q$insert into ride_waypoints (ride_id, user_id, name, lat, lng) values ('51515151-5151-5151-5151-515151515151', '00000000-0000-0000-0000-0000000000f6', 'Spoof', 38.6, -109.6)$q$,
  'a waypoint in someone else''s name');
reset role;
do $$ begin
  if (select name from ride_waypoints where id = 'a1000000-0000-0000-0000-000000000001') <> 'Rae''s Camp' then
    raise exception 'FAIL: waypoint name not trimmed';
  end if;
end $$;

-- W2. Liam (the leader) shares one and keeps one to himself; Wendy (organizer) shares one too.
select as_user('00000000-0000-0000-0000-0000000000f6');
set role authenticated;
insert into ride_waypoints (id, ride_id, name, kind, lat, lng, shared)
values ('a1000000-0000-0000-0000-000000000002', '51515151-5151-5151-5151-515151515151', 'Fuel Stop', 'fuel', 38.7, -109.7, true);
insert into ride_waypoints (id, ride_id, name, lat, lng)
values ('a1000000-0000-0000-0000-000000000003', '51515151-5151-5151-5151-515151515151', 'Liam Scouting', 38.71, -109.71);
reset role;
select as_user('00000000-0000-0000-0000-0000000000f5');
set role authenticated;
insert into ride_waypoints (id, ride_id, name, kind, lat, lng, shared)
values ('a1000000-0000-0000-0000-000000000004', '51515151-5151-5151-5151-515151515151', 'Washout', 'hazard', 38.8, -109.8, true);
reset role;

-- W3. Each rider sees the shared ones plus only their own.
select as_user('00000000-0000-0000-0000-0000000000f7');
set role authenticated;
do $$ begin
  if (select array_agg(name order by name) from ride_waypoints) <> array['Fuel Stop', 'Rae''s Camp', 'Washout'] then
    raise exception 'FAIL: rider saw the wrong waypoints: %', (select array_agg(name order by name) from ride_waypoints);
  end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-0000000000f6');
set role authenticated;
do $$ begin
  if (select array_agg(name order by name) from ride_waypoints) <> array['Fuel Stop', 'Liam Scouting', 'Washout'] then
    raise exception 'FAIL: leader saw the wrong waypoints (a rider''s own must stay theirs)';
  end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-0000000000f5');
set role authenticated;
do $$ begin
  if exists (select 1 from ride_waypoints where name in ('Rae''s Camp', 'Liam Scouting')) then
    raise exception 'FAIL: organizer saw someone''s own waypoint';
  end if;
end $$;
reset role;

-- W4. A stranger, a pending rider and a signed-out visitor see none and can't add any.
select as_user('00000000-0000-0000-0000-0000000000f8');
set role authenticated;
do $$ begin
  if (select count(*) from ride_waypoints) <> 0 then raise exception 'FAIL: stranger saw waypoints'; end if;
end $$;
select expect_refused(
  $q$insert into ride_waypoints (ride_id, name, lat, lng) values ('51515151-5151-5151-5151-515151515151', 'Sneak', 38.6, -109.6)$q$,
  'a stranger added a waypoint');
reset role;
select as_user('00000000-0000-0000-0000-0000000000f9');
set role authenticated;
do $$ begin
  if (select count(*) from ride_waypoints) <> 0 then raise exception 'FAIL: pending rider saw waypoints'; end if;
end $$;
select expect_refused(
  $q$insert into ride_waypoints (ride_id, name, lat, lng) values ('51515151-5151-5151-5151-515151515151', 'Early', 38.6, -109.6)$q$,
  'a pending rider added a waypoint');
reset role;
select as_user(null);
set role anon;
select expect_refused($q$select count(*) from ride_waypoints$q$, 'anonymous read of waypoints');
reset role;

-- W5. Rae can't share her own, or change or remove anyone else's.
select as_user('00000000-0000-0000-0000-0000000000f7');
set role authenticated;
select expect_refused(
  $q$update ride_waypoints set shared = true where id = 'a1000000-0000-0000-0000-000000000001'$q$,
  'a rider shared her waypoint by editing it');
update ride_waypoints set name = 'Mine Now', lat = 0, lng = 0 where id = 'a1000000-0000-0000-0000-000000000002';
delete from ride_waypoints where id in ('a1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000004');
-- Her own she can rename, and moving it to another ride is ignored.
update ride_waypoints set name = 'Camp Spot', ride_id = '11111111-1111-1111-1111-111111111111' where id = 'a1000000-0000-0000-0000-000000000001';
reset role;
do $$ begin
  if (select name from ride_waypoints where id = 'a1000000-0000-0000-0000-000000000002') <> 'Fuel Stop' then
    raise exception 'FAIL: a rider changed the leader''s waypoint';
  end if;
  if (select count(*) from ride_waypoints where id in ('a1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000004')) <> 2 then
    raise exception 'FAIL: a rider removed a shared waypoint';
  end if;
  if (select name || ride_id::text from ride_waypoints where id = 'a1000000-0000-0000-0000-000000000001') <> 'Camp Spot51515151-5151-5151-5151-515151515151' then
    raise exception 'FAIL: own waypoint not renamed, or moved to another ride';
  end if;
end $$;

-- W6. The leader can switch his own between shared and just him, and clear a shared one someone
-- else dropped, but never touch a rider's own.
select as_user('00000000-0000-0000-0000-0000000000f6');
set role authenticated;
update ride_waypoints set shared = true where id = 'a1000000-0000-0000-0000-000000000003';
update ride_waypoints set shared = false where id = 'a1000000-0000-0000-0000-000000000003';
delete from ride_waypoints where id = 'a1000000-0000-0000-0000-000000000004';
delete from ride_waypoints where id = 'a1000000-0000-0000-0000-000000000001';
reset role;
do $$ begin
  if (select shared from ride_waypoints where id = 'a1000000-0000-0000-0000-000000000003') then
    raise exception 'FAIL: leader could not take a waypoint back to just him';
  end if;
  if exists (select 1 from ride_waypoints where id = 'a1000000-0000-0000-0000-000000000004') then
    raise exception 'FAIL: leader could not clear a shared waypoint';
  end if;
  if not exists (select 1 from ride_waypoints where id = 'a1000000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: leader removed a rider''s own waypoint';
  end if;
end $$;

-- W7. After a hand-off, the old leader can't share any more.
update ride_members set role = 'rider' where ride_id = '51515151-5151-5151-5151-515151515151' and user_id = '00000000-0000-0000-0000-0000000000f6';
update ride_members set role = 'leader' where ride_id = '51515151-5151-5151-5151-515151515151' and user_id = '00000000-0000-0000-0000-0000000000f7';
select as_user('00000000-0000-0000-0000-0000000000f6');
set role authenticated;
select expect_refused(
  $q$update ride_waypoints set shared = true where id = 'a1000000-0000-0000-0000-000000000003'$q$,
  'a former leader shared a waypoint');
reset role;
select as_user('00000000-0000-0000-0000-0000000000f7');
set role authenticated;
update ride_waypoints set shared = true where id = 'a1000000-0000-0000-0000-000000000001';
reset role;
do $$ begin
  if not (select shared from ride_waypoints where id = 'a1000000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: the new leader could not share her waypoint';
  end if;
end $$;

-- W8. Leaving the ride hides its waypoints, shared ones included.
select as_user('00000000-0000-0000-0000-0000000000f6');
set role authenticated;
select leave_ride('51515151-5151-5151-5151-515151515151');
do $$ begin
  if (select count(*) from ride_waypoints) <> 0 then raise exception 'FAIL: a rider who left still sees the ride''s waypoints'; end if;
end $$;
reset role;

-- W9. At most 100 waypoints per rider per ride.
select as_user('00000000-0000-0000-0000-0000000000f5');
set role authenticated;
insert into ride_waypoints (ride_id, name, lat, lng)
select '51515151-5151-5151-5151-515151515151', 'Spot ' || g, 38.5, -109.5 from generate_series(1, 100) g;
select expect_refused(
  $q$insert into ride_waypoints (ride_id, name, lat, lng) values ('51515151-5151-5151-5151-515151515151', 'One Too Many', 38.5, -109.5)$q$,
  'the 101st waypoint');
reset role;

select 'ALL WAYPOINT TESTS PASSED' as result;
