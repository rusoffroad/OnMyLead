-- Planned stops: only the leader or an organizer plans them; each one is shared with every joined
-- rider and with nobody else; they keep their order, and only the leader can change it.
-- Runs after waypoints_test.sql (run_local.sh), reusing its riders. privacy_test.sql grants every
-- table to authenticated, so these checks lean on row level security, the check and the trigger alone.
-- Each block raises an exception if a rule is broken.

-- Wendy's second ride; Liam leads, Rae rides, Pat is only pending.
select as_user('00000000-0000-0000-0000-0000000000f5');
set role authenticated;
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility)
values ('52525252-5252-5252-5252-525252525252', auth.uid(), 'Planned stop ride', now() + interval '1 day', 38.5, -109.5, 'public');
insert into ride_private_details (ride_id, meet_lat, meet_lng) values ('52525252-5252-5252-5252-525252525252', 38.51, -109.51);
reset role;
select as_user('00000000-0000-0000-0000-0000000000f6');
set role authenticated;
select join_ride('52525252-5252-5252-5252-525252525252');
reset role;
select as_user('00000000-0000-0000-0000-0000000000f7');
set role authenticated;
select join_ride('52525252-5252-5252-5252-525252525252');
reset role;
select as_user('00000000-0000-0000-0000-0000000000f9');
set role authenticated;
select join_ride('52525252-5252-5252-5252-525252525252');
reset role;
update ride_members set role = 'leader' where ride_id = '52525252-5252-5252-5252-525252525252' and user_id = '00000000-0000-0000-0000-0000000000f6';
update ride_members set role = 'rider' where ride_id = '52525252-5252-5252-5252-525252525252' and user_id = '00000000-0000-0000-0000-0000000000f7';
update ride_members set status = 'pending' where ride_id = '52525252-5252-5252-5252-525252525252' and user_id = '00000000-0000-0000-0000-0000000000f9';

-- S1. Liam (leader) plans two stops; they number themselves in order. Wendy (organizer) adds a third.
select as_user('00000000-0000-0000-0000-0000000000f6');
set role authenticated;
insert into ride_waypoints (id, ride_id, name, kind, lat, lng, shared, planned_stop, stop_time)
values ('b2000000-0000-0000-0000-000000000001', '52525252-5252-5252-5252-525252525252', 'Fuel in Green River', 'fuel', 38.99, -110.16, true, true, '10:30');
insert into ride_waypoints (id, ride_id, name, kind, lat, lng, shared, planned_stop)
values ('b2000000-0000-0000-0000-000000000002', '52525252-5252-5252-5252-525252525252', 'Lunch at the Overlook', 'view', 38.7, -109.9, true, true);
-- A planned stop is always for the whole ride: one that isn't shared is refused.
select expect_refused(
  $q$insert into ride_waypoints (ride_id, name, lat, lng, shared, planned_stop) values ('52525252-5252-5252-5252-525252525252', 'Secret Stop', 38.6, -109.6, false, true)$q$,
  'a planned stop only the leader sees');
reset role;
select as_user('00000000-0000-0000-0000-0000000000f5');
set role authenticated;
insert into ride_waypoints (id, ride_id, name, kind, lat, lng, shared, planned_stop)
values ('b2000000-0000-0000-0000-000000000003', '52525252-5252-5252-5252-525252525252', 'Camp', 'camp', 38.6, -109.4, true, true);
reset role;
do $$ begin
  if (select array_agg(stop_order order by name) from ride_waypoints where ride_id = '52525252-5252-5252-5252-525252525252')
     <> array[3, 1, 2] then
    raise exception 'FAIL: planned stops not numbered in the order they were added';
  end if;
  if (select stop_time from ride_waypoints where id = 'b2000000-0000-0000-0000-000000000001') <> '10:30'::time then
    raise exception 'FAIL: planned time not saved';
  end if;
end $$;

-- S2. A rider can't plan a stop, or turn her own waypoint into one.
select as_user('00000000-0000-0000-0000-0000000000f7');
set role authenticated;
select expect_refused(
  $q$insert into ride_waypoints (ride_id, name, lat, lng, shared, planned_stop) values ('52525252-5252-5252-5252-525252525252', 'My Stop', 38.6, -109.6, true, true)$q$,
  'a rider planned a stop');
insert into ride_waypoints (id, ride_id, name, lat, lng)
values ('b2000000-0000-0000-0000-000000000004', '52525252-5252-5252-5252-525252525252', 'Rae Spot', 38.6, -109.6);
select expect_refused(
  $q$update ride_waypoints set planned_stop = true where id = 'b2000000-0000-0000-0000-000000000004'$q$,
  'a rider made her waypoint a planned stop');
select expect_refused(
  $q$select reorder_planned_stops('52525252-5252-5252-5252-525252525252', array['b2000000-0000-0000-0000-000000000003', 'b2000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000001']::uuid[])$q$,
  'a rider reordered the planned stops');
-- She sees every planned stop (and her own spot), but can't change or remove them.
do $$ begin
  if (select count(*) from ride_waypoints where planned_stop) <> 3 then
    raise exception 'FAIL: a joined rider did not see every planned stop';
  end if;
end $$;
update ride_waypoints set name = 'Hijacked', stop_time = '23:00' where id = 'b2000000-0000-0000-0000-000000000001';
delete from ride_waypoints where id = 'b2000000-0000-0000-0000-000000000002';
reset role;
do $$ begin
  if (select name from ride_waypoints where id = 'b2000000-0000-0000-0000-000000000001') <> 'Fuel in Green River' then
    raise exception 'FAIL: a rider changed a planned stop';
  end if;
  if not exists (select 1 from ride_waypoints where id = 'b2000000-0000-0000-0000-000000000002') then
    raise exception 'FAIL: a rider removed a planned stop';
  end if;
end $$;

-- S3. Nobody off the ride sees a planned stop: a stranger, a pending rider, a signed-out visitor.
select as_user('00000000-0000-0000-0000-0000000000f8');
set role authenticated;
do $$ begin
  if exists (select 1 from ride_waypoints where ride_id = '52525252-5252-5252-5252-525252525252') then
    raise exception 'FAIL: a stranger saw a planned stop';
  end if;
end $$;
select expect_refused(
  $q$select reorder_planned_stops('52525252-5252-5252-5252-525252525252', array['b2000000-0000-0000-0000-000000000003', 'b2000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000001']::uuid[])$q$,
  'a stranger reordered the planned stops');
reset role;
select as_user('00000000-0000-0000-0000-0000000000f9');
set role authenticated;
do $$ begin
  if exists (select 1 from ride_waypoints where ride_id = '52525252-5252-5252-5252-525252525252') then
    raise exception 'FAIL: a pending rider saw a planned stop';
  end if;
end $$;
reset role;
select as_user(null);
set role anon;
select expect_refused($q$select count(*) from ride_waypoints where planned_stop$q$, 'anonymous read of planned stops');
select expect_refused(
  $q$select reorder_planned_stops('52525252-5252-5252-5252-525252525252', '{}'::uuid[])$q$,
  'anonymous reorder of planned stops');
reset role;

-- S4. The leader reorders them; an ordinary edit can't jump the queue; a stale list is refused.
select as_user('00000000-0000-0000-0000-0000000000f6');
set role authenticated;
select reorder_planned_stops('52525252-5252-5252-5252-525252525252',
  array['b2000000-0000-0000-0000-000000000003', 'b2000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002']::uuid[]);
update ride_waypoints set stop_order = 99, stop_time = '11:00' where id = 'b2000000-0000-0000-0000-000000000001';
select expect_refused(
  $q$select reorder_planned_stops('52525252-5252-5252-5252-525252525252', array['b2000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002']::uuid[])$q$,
  'a reorder that left out a stop');
reset role;
do $$ begin
  if (select array_agg(id::text order by stop_order) from ride_waypoints where ride_id = '52525252-5252-5252-5252-525252525252' and planned_stop)
     <> array['b2000000-0000-0000-0000-000000000003', 'b2000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002'] then
    raise exception 'FAIL: planned stops not in the new order';
  end if;
  if (select stop_time from ride_waypoints where id = 'b2000000-0000-0000-0000-000000000001') <> '11:00'::time then
    raise exception 'FAIL: the leader could not change a planned time';
  end if;
end $$;

-- S5. The leader can edit a stop the organizer planned (the plan is the ride's, not one person's),
-- but can't use that to take it private or turn it into a plain waypoint.
select as_user('00000000-0000-0000-0000-0000000000f6');
set role authenticated;
update ride_waypoints set name = 'Camp at the Mesa' where id = 'b2000000-0000-0000-0000-000000000003';
select expect_refused(
  $q$update ride_waypoints set shared = false where id = 'b2000000-0000-0000-0000-000000000003'$q$,
  'the leader took someone''s planned stop private');
select expect_refused(
  $q$update ride_waypoints set planned_stop = false where id = 'b2000000-0000-0000-0000-000000000003'$q$,
  'the leader turned someone''s planned stop into a plain waypoint');
reset role;
do $$ begin
  if (select name from ride_waypoints where id = 'b2000000-0000-0000-0000-000000000003') <> 'Camp at the Mesa' then
    raise exception 'FAIL: the leader could not edit the organizer''s planned stop';
  end if;
  if not (select planned_stop from ride_waypoints where id = 'b2000000-0000-0000-0000-000000000003') then
    raise exception 'FAIL: the leader turned someone else''s planned stop into a plain waypoint';
  end if;
end $$;

-- S6. Taking a stop off the plan (its owner, still able to share) clears its place and time.
select as_user('00000000-0000-0000-0000-0000000000f6');
set role authenticated;
update ride_waypoints set planned_stop = false where id = 'b2000000-0000-0000-0000-000000000001';
reset role;
do $$ begin
  if (select stop_order is not null or stop_time is not null or not shared from ride_waypoints where id = 'b2000000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: an unplanned stop kept its place or time, or stopped being shared';
  end if;
end $$;

-- S7. After a hand-off to Rae, Liam can no longer touch the plan; Rae can.
update ride_members set role = 'rider' where ride_id = '52525252-5252-5252-5252-525252525252' and user_id = '00000000-0000-0000-0000-0000000000f6';
update ride_members set role = 'leader' where ride_id = '52525252-5252-5252-5252-525252525252' and user_id = '00000000-0000-0000-0000-0000000000f7';
select as_user('00000000-0000-0000-0000-0000000000f6');
set role authenticated;
select expect_refused(
  $q$update ride_waypoints set stop_time = '09:00' where id = 'b2000000-0000-0000-0000-000000000002'$q$,
  'a former leader changed his own planned stop');
select expect_refused(
  $q$insert into ride_waypoints (ride_id, name, lat, lng, shared, planned_stop) values ('52525252-5252-5252-5252-525252525252', 'Late Stop', 38.6, -109.6, true, true)$q$,
  'a former leader planned a stop');
reset role;
select as_user('00000000-0000-0000-0000-0000000000f7');
set role authenticated;
update ride_waypoints set stop_time = '12:15' where id = 'b2000000-0000-0000-0000-000000000002';
delete from ride_waypoints where id = 'b2000000-0000-0000-0000-000000000003';
reset role;
do $$ begin
  if (select stop_time from ride_waypoints where id = 'b2000000-0000-0000-0000-000000000002') <> '12:15'::time then
    raise exception 'FAIL: the new leader could not change Liam''s planned stop';
  end if;
  if exists (select 1 from ride_waypoints where id = 'b2000000-0000-0000-0000-000000000003') then
    raise exception 'FAIL: the new leader could not remove a planned stop';
  end if;
end $$;

-- S8. Leaving the ride hides its planned stops.
select as_user('00000000-0000-0000-0000-0000000000f6');
set role authenticated;
select leave_ride('52525252-5252-5252-5252-525252525252');
do $$ begin
  if exists (select 1 from ride_waypoints where ride_id = '52525252-5252-5252-5252-525252525252') then
    raise exception 'FAIL: a rider who left still sees the planned stops';
  end if;
end $$;
reset role;

select 'ALL PLANNED STOP TESTS PASSED' as result;
