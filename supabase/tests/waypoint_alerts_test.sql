-- Tap-and-hold waypoints (migration 20261104150000_waypoint_alerts.sql): a shared waypoint on a
-- live ride lands in every other joined rider's inbox (and push batch) once; private waypoints,
-- rides that aren't live and riders who aren't on the ride get nothing. Map Mode waypoint backups
-- are private to the rider and keep the newer copy. Runs after privacy_test.sql (run_local.sh):
-- as_user and expect_refused come from there.
--
-- Riders (new here):
--   Lou  0a71  leads the ride
--   Max  0a72  on the ride, phone registered
--   Nia  0a73  on the ride, phone registered, Announcements off
--   Oz   0a74  not on the ride, phone registered
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000a71', '{"full_name":"Lou Leader"}'),
  ('00000000-0000-0000-0000-000000000a72', '{"full_name":"Max Rider"}'),
  ('00000000-0000-0000-0000-000000000a73', '{"full_name":"Nia Rider"}'),
  ('00000000-0000-0000-0000-000000000a74', '{"full_name":"Oz Outsider"}');
insert into push_tokens (user_id, token, platform) values
  ('00000000-0000-0000-0000-000000000a71', 'lou-phone-00000000000000000000', 'ios'),
  ('00000000-0000-0000-0000-000000000a72', 'max-phone-00000000000000000000', 'ios'),
  ('00000000-0000-0000-0000-000000000a73', 'nia-phone-00000000000000000000', 'android'),
  ('00000000-0000-0000-0000-000000000a74', 'oz-phone-000000000000000000000', 'ios');
insert into notification_settings (user_id, announcements) values ('00000000-0000-0000-0000-000000000a73', false)
  on conflict (user_id) do update set announcements = false;

create function wp_inbox(p_user text) returns table (kind text, title text, body text)
language plpgsql as $$
begin
  perform as_user(p_user::uuid);
  execute 'set local role authenticated';
  return query select n.kind, n.title, n.body from rider_notifications n where n.kind = 'waypoint' order by n.created_at, n.title;
  execute 'reset role';
end $$;

select as_user('00000000-0000-0000-0000-000000000a71');
set role authenticated;
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility)
values ('0a7a7a7a-0a7a-0a7a-0a7a-0a7a7a7a7a7a', auth.uid(), 'Alert Ride', now() + interval '1 day', 38.5, -109.5, 'public');
reset role;
select as_user('00000000-0000-0000-0000-000000000a72');
set role authenticated;
select join_ride('0a7a7a7a-0a7a-0a7a-0a7a-0a7a7a7a7a7a');
reset role;
select as_user('00000000-0000-0000-0000-000000000a73');
set role authenticated;
select join_ride('0a7a7a7a-0a7a-0a7a-0a7a-0a7a7a7a7a7a');
reset role;

-- A1. Before the ride starts, a shared waypoint (route planning) sends nothing.
select as_user('00000000-0000-0000-0000-000000000a71');
set role authenticated;
insert into ride_waypoints (id, ride_id, name, lat, lng, shared)
values ('0a700000-0000-0000-0000-000000000001', '0a7a7a7a-0a7a-0a7a-0a7a-0a7a7a7a7a7a', 'Trailhead Lot', 38.5, -109.5, true);
reset role;
do $$ begin
  if exists (select 1 from wp_inbox('00000000-0000-0000-0000-000000000a72')) then raise exception 'FAIL: pushed before the ride was live'; end if;
end $$;

-- A2. Live: Lou shares a waypoint. Max gets it; Nia turned Announcements off for the push but the
-- inbox still lists it (like every other inbox row); Lou and Oz get nothing.
update rides set status = 'live' where id = '0a7a7a7a-0a7a-0a7a-0a7a-0a7a7a7a7a7a';
select as_user('00000000-0000-0000-0000-000000000a71');
set role authenticated;
insert into ride_waypoints (id, ride_id, name, kind, lat, lng, shared)
values ('0a700000-0000-0000-0000-000000000002', '0a7a7a7a-0a7a-0a7a-0a7a-0a7a7a7a7a7a', 'Fuel Stop', 'fuel', 38.6, -109.6, true);
reset role;
do $$
declare v record;
begin
  select * into v from wp_inbox('00000000-0000-0000-0000-000000000a72');
  if v.title is distinct from 'Lou Leader added a new waypoint: Fuel Stop' then raise exception 'FAIL: title %', v.title; end if;
  if v.body is distinct from 'Alert Ride. Tap to see it on the map.' then raise exception 'FAIL: body %', v.body; end if;
  if exists (select 1 from wp_inbox('00000000-0000-0000-0000-000000000a71')) then raise exception 'FAIL: the leader was told about their own waypoint'; end if;
  if exists (select 1 from wp_inbox('00000000-0000-0000-0000-000000000a74')) then raise exception 'FAIL: a rider not on the ride was told'; end if;
end $$;

-- A3. The push batch: Max's phone only (Nia has Announcements off, Lou added it, Oz isn't on the ride).
do $$
declare v_users uuid[];
begin
  select array_agg(b.user_id) into v_users from push_batch_waypoint('{"type":"waypoint","id":"0a700000-0000-0000-0000-000000000002"}') b;
  if v_users is distinct from array['00000000-0000-0000-0000-000000000a72'::uuid] then raise exception 'FAIL: push went to %', v_users; end if;
  if (select b.data ->> 'waypointId' from push_batch_waypoint('{"type":"waypoint","id":"0a700000-0000-0000-0000-000000000002"}') b) <> '0a700000-0000-0000-0000-000000000002' then
    raise exception 'FAIL: push data has no waypoint id';
  end if;
end $$;

-- A4. Rae-style Just Me waypoints send nothing; switching one to Everyone on the Ride sends one,
-- and editing its name afterwards doesn't send another.
select as_user('00000000-0000-0000-0000-000000000a71');
set role authenticated;
insert into ride_waypoints (id, ride_id, name, lat, lng)
values ('0a700000-0000-0000-0000-000000000003', '0a7a7a7a-0a7a-0a7a-0a7a-0a7a7a7a7a7a', 'Scouting', 38.7, -109.7);
reset role;
select as_user('00000000-0000-0000-0000-000000000a72');
set role authenticated;
insert into ride_waypoints (id, ride_id, name, lat, lng)
values ('0a700000-0000-0000-0000-000000000004', '0a7a7a7a-0a7a-0a7a-0a7a-0a7a7a7a7a7a', 'Max Camp', 38.7, -109.7);
reset role;
do $$ begin
  if (select count(*) from wp_inbox('00000000-0000-0000-0000-000000000a72')) <> 1 then raise exception 'FAIL: a private waypoint was announced'; end if;
  if exists (select 1 from wp_inbox('00000000-0000-0000-0000-000000000a71')) then raise exception 'FAIL: a rider''s own waypoint was announced'; end if;
end $$;
select as_user('00000000-0000-0000-0000-000000000a71');
set role authenticated;
update ride_waypoints set shared = true where id = '0a700000-0000-0000-0000-000000000003';
update ride_waypoints set name = 'Scout Point' where id = '0a700000-0000-0000-0000-000000000003';
reset role;
do $$ begin
  if (select count(*) from wp_inbox('00000000-0000-0000-0000-000000000a72')) <> 2 then
    raise exception 'FAIL: sharing a waypoint should notify once, got %', (select count(*) from wp_inbox('00000000-0000-0000-0000-000000000a72'));
  end if;
end $$;

-- A5. A planned stop says so.
select as_user('00000000-0000-0000-0000-000000000a71');
set role authenticated;
insert into ride_waypoints (id, ride_id, name, lat, lng, shared, planned_stop)
values ('0a700000-0000-0000-0000-000000000005', '0a7a7a7a-0a7a-0a7a-0a7a-0a7a7a7a7a7a', 'Lunch', 38.8, -109.8, true, true);
reset role;
do $$ begin
  if not exists (select 1 from wp_inbox('00000000-0000-0000-0000-000000000a72') where title = 'Lou Leader added a planned stop: Lunch') then
    raise exception 'FAIL: planned stop title';
  end if;
end $$;

-- A6. Riders can't call the batch themselves.
select as_user('00000000-0000-0000-0000-000000000a72');
set role authenticated;
select expect_refused($q$select * from push_batch_waypoint('{"type":"waypoint","id":"0a700000-0000-0000-0000-000000000002"}')$q$, 'a rider read the waypoint push batch');
reset role;

-- M1. Map Mode waypoints: signed out, nothing.
select as_user(null);
set role anon;
select expect_refused($q$select backup_map_waypoint('w1', '{"id":"w1"}', now())$q$, 'anon backed up a map waypoint');
select expect_refused($q$select * from rider_map_waypoints$q$, 'anon read map waypoints');
reset role;

-- M2. Max backs one up; the newer copy wins; a delete leaves a tombstone.
select as_user('00000000-0000-0000-0000-000000000a72');
set role authenticated;
do $$ begin
  if not backup_map_waypoint('w1', '{"id":"w1","name":"Spring"}', '2026-10-01 10:00+00') then raise exception 'FAIL: first backup'; end if;
  if backup_map_waypoint('w1', '{"id":"w1","name":"Old"}', '2026-10-01 09:00+00') then raise exception 'FAIL: older copy won'; end if;
  if not backup_map_waypoint('w1', '{"id":"w1","name":"Hot Spring"}', '2026-10-01 11:00+00') then raise exception 'FAIL: newer copy lost'; end if;
  if (select data ->> 'name' from rider_map_waypoints where waypoint_id = 'w1') <> 'Hot Spring' then raise exception 'FAIL: read back'; end if;
  if not backup_map_waypoint('w1', null, '2026-10-01 12:00+00') then raise exception 'FAIL: delete'; end if;
  if not (select deleted from rider_map_waypoints where waypoint_id = 'w1') then raise exception 'FAIL: no tombstone'; end if;
  perform backup_map_waypoint('w2', '{"id":"w2","name":"Gate"}', now());
end $$;
select expect_refused($q$insert into rider_map_waypoints (user_id, waypoint_id, data, updated_at) values (auth.uid(), 'x', '{}', now())$q$, 'wrote map waypoints directly');
select expect_refused($q$select backup_map_waypoint('big', jsonb_build_object('note', repeat('x', 5000)), now())$q$, 'backed up a huge waypoint');
reset role;

-- M3. Nobody else sees Max's.
select as_user('00000000-0000-0000-0000-000000000a73');
set role authenticated;
do $$ begin
  if exists (select 1 from rider_map_waypoints) then raise exception 'FAIL: read another rider''s map waypoints'; end if;
end $$;
reset role;
