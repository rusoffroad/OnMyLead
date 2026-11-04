-- Waypoint symbols: the new symbols save, kind follows them so older app builds still draw every
-- waypoint, an older build changing kind clears the stale symbol, and unknown symbols are refused.
-- Runs after planned_stops_test.sql (run_local.sh), reusing its riders and ride (by its end Rae leads and Liam has left).

-- S1. Rae drops a Gate and a Water Crossing: kind becomes the nearest original kind.
select as_user('00000000-0000-0000-0000-0000000000f7');
set role authenticated;
insert into ride_waypoints (id, ride_id, name, symbol, lat, lng)
values ('c3000000-0000-0000-0000-000000000001', '52525252-5252-5252-5252-525252525252', 'Cattle Gate', 'gate', 38.6, -109.6);
-- The app also sends a kind; the server corrects a wrong one.
insert into ride_waypoints (id, ride_id, name, kind, symbol, lat, lng)
values ('c3000000-0000-0000-0000-000000000002', '52525252-5252-5252-5252-525252525252', 'Deep Crossing', 'camp', 'crossing', 38.61, -109.61);
reset role;
do $$ begin
  if (select kind from ride_waypoints where id = 'c3000000-0000-0000-0000-000000000001') <> 'spot' then
    raise exception 'FAIL: a Gate should show as a Spot in older builds';
  end if;
  if (select kind from ride_waypoints where id = 'c3000000-0000-0000-0000-000000000002') <> 'hazard' then
    raise exception 'FAIL: a Water Crossing should show as a Hazard in older builds';
  end if;
end $$;

-- S2. An older build (kind only) adds a Camp: no symbol, the kind shows.
select as_user('00000000-0000-0000-0000-0000000000f7');
set role authenticated;
insert into ride_waypoints (id, ride_id, name, kind, lat, lng)
values ('c3000000-0000-0000-0000-000000000003', '52525252-5252-5252-5252-525252525252', 'Old Camp', 'camp', 38.62, -109.62);
-- S3. An older build edits the Gate's kind to Fuel: the Gate symbol goes, so Fuel shows everywhere.
update ride_waypoints set kind = 'fuel' where id = 'c3000000-0000-0000-0000-000000000001';
-- S4. A newer build changes the crossing to Photo Spot: kind follows.
update ride_waypoints set symbol = 'photo' where id = 'c3000000-0000-0000-0000-000000000002';
-- An older build renaming a waypoint keeps its symbol.
update ride_waypoints set name = 'Overlook Photo' where id = 'c3000000-0000-0000-0000-000000000002';
reset role;
do $$ begin
  if (select symbol from ride_waypoints where id = 'c3000000-0000-0000-0000-000000000003') is not null then
    raise exception 'FAIL: a kind-only waypoint got a symbol';
  end if;
  if (select symbol is not null or kind <> 'fuel' from ride_waypoints where id = 'c3000000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: an older build changing the kind left a stale symbol';
  end if;
  if (select symbol <> 'photo' or kind <> 'view' from ride_waypoints where id = 'c3000000-0000-0000-0000-000000000002') then
    raise exception 'FAIL: changing the symbol did not carry its kind, or a rename dropped the symbol';
  end if;
end $$;

-- S5. Unknown symbols are refused.
select as_user('00000000-0000-0000-0000-0000000000f7');
set role authenticated;
select expect_refused(
  $q$insert into ride_waypoints (ride_id, name, symbol, lat, lng) values ('52525252-5252-5252-5252-525252525252', 'Helipad', 'helipad', 38.6, -109.6)$q$,
  'an unknown symbol');
reset role;

-- S6. A planned stop carries a symbol too, and stays private to the ride: Sam (not on it) and Liam
-- (who left) see nothing.
select as_user('00000000-0000-0000-0000-0000000000f7');
set role authenticated;
insert into ride_waypoints (id, ride_id, name, symbol, lat, lng, shared, planned_stop)
values ('c3000000-0000-0000-0000-000000000004', '52525252-5252-5252-5252-525252525252', 'Lunch', 'food', 38.7, -109.7, true, true);
reset role;
select as_user('00000000-0000-0000-0000-0000000000f8');
set role authenticated;
do $$ begin
  if exists (select 1 from ride_waypoints where ride_id = '52525252-5252-5252-5252-525252525252') then
    raise exception 'FAIL: a rider not on the ride can see its waypoints';
  end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-0000000000f6');
set role authenticated;
do $$ begin
  if exists (select 1 from ride_waypoints where ride_id = '52525252-5252-5252-5252-525252525252') then
    raise exception 'FAIL: a rider who left can see the ride''s waypoints';
  end if;
end $$;
reset role;
do $$ begin
  if (select symbol <> 'food' or kind <> 'spot' or not planned_stop from ride_waypoints where id = 'c3000000-0000-0000-0000-000000000004') then
    raise exception 'FAIL: the planned stop lost its symbol';
  end if;
end $$;

select 'ALL WAYPOINT SYMBOL TESTS PASSED' as result;
