-- Park Trails (migration 20261104180000_park_trails.sql): the import writes lines through an
-- admin-only function, everyone (signed out too) reads the lines crossing a box and the park list,
-- hidden lines stay off the map and survive a re-import, and nobody reads the table directly.
-- Runs after nav_trails_test.sql (run_local.sh), which leaves as_user, as_session and expect_error
-- in place. Each block raises an exception if a rule is broken.

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000e701', 'parkrider@example.test', '{"full_name":"Park Rider"}'),
  ('00000000-0000-0000-0000-00000000e702', 'parkadmin@example.test', '{"full_name":"Park Admin"}');
insert into admin_users (user_id) values ('00000000-0000-0000-0000-00000000e702');

-- P1: the seed migration put Hidden Falls on the map, levels and all.
do $$
declare n int; lv int;
begin
  select count(*), count(*) filter (where level between 1 and 5) into n, lv from park_trails where park_osm_id = 331218708;
  if n < 50 then raise exception 'FAIL: Hidden Falls seed has % lines', n; end if;
  if lv < 20 then raise exception 'FAIL: Hidden Falls levels missing (%)', lv; end if;
  if exists (select 1 from park_trails where park_name ilike '%stonehenge%' and not closed) then raise exception 'FAIL: (CLOSED) in the name should close the trail'; end if;
end $$;

-- P2: a rider can't read or write the table, only call the read functions.
select as_user('00000000-0000-0000-0000-00000000e701');
set role authenticated;
do $$
declare n int;
begin
  -- No policy and no grant: a direct read is refused, or (where a default grant exists) sees nothing.
  begin
    select count(*) into n from park_trails;
    if n <> 0 then raise exception 'FAIL: direct read saw % rows', n; end if;
  exception when insufficient_privilege then null;
  end;
end $$;
select expect_error($q$insert into park_trails (park_osm_id, park_name, source_id, route_enc, length_m, min_lat, min_lng, max_lat, max_lng)
  values (1, 'Fake Park', 1, '_p~iF~ps|U_ulLnnqC', 100, 0, 0, 1, 1)$q$, '%row-level security%', 'direct insert');
select expect_error($q$select admin_import_park_trails(1, '[]'::jsonb)$q$, '%admin only%', 'rider import');
select expect_error($q$select admin_park_trails()$q$, '%admin only%', 'rider admin list');
do $$
declare got jsonb; parks jsonb;
begin
  got := park_trails_in_area(30.58, -98.18, 30.64, -98.12);
  if jsonb_array_length(got) < 50 then raise exception 'FAIL: rider sees % Hidden Falls lines', jsonb_array_length(got); end if;
  if got -> 0 ->> 'park_name' <> 'Hidden Falls Adventure Park' then raise exception 'FAIL: park name'; end if;
  if (got -> 0 ->> 'route_enc') is null or jsonb_array_length(got -> 0 -> 'box') <> 4 then raise exception 'FAIL: line fields'; end if;
  if jsonb_array_length(park_trails_in_area(45, -98.18, 46, -98.12)) <> 0 then raise exception 'FAIL: box filter'; end if;
  parks := park_trail_parks();
  if not exists (select 1 from jsonb_array_elements(parks) p where (p ->> 'park_osm_id')::bigint = 331218708 and (p ->> 'trail_count')::int > 40) then
    raise exception 'FAIL: park list';
  end if;
  -- Trail miles count trails only, like the count beside them (20261104200000).
  if (select (p ->> 'trail_m')::numeric from jsonb_array_elements(parks) p where (p ->> 'park_osm_id')::bigint = 331218708)
     <> (select sum(length_m) from park_trails where park_osm_id = 331218708 and not hidden and kind = 'trail') then
    raise exception 'FAIL: park trail miles include roads';
  end if;
end $$;
reset role;

-- P3: signed out, the website's maps read the same lines.
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);
set role anon;
do $$
begin
  if jsonb_array_length(park_trails_in_area(30.58, -98.18, 30.64, -98.12)) < 50 then raise exception 'FAIL: anon read'; end if;
  if jsonb_array_length(park_trail_parks()) < 1 then raise exception 'FAIL: anon park list'; end if;
end $$;
select expect_error($q$select admin_import_park_trails(1, '[]'::jsonb)$q$, '%admin only%', 'anon import');
reset role;

-- P4: the admin imports a park: new rows, updates in place, lines gone from the source removed,
-- a hidden line stays hidden through a re-import, and the audit log says so.
select as_session('00000000-0000-0000-0000-00000000e702', 'aal2');
set role authenticated;
do $$
declare r jsonb; l jsonb; hid uuid; n int;
begin
  r := admin_import_park_trails(99001, jsonb_build_array(
    jsonb_build_object('park_name', 'Test Park', 'park_state', 'TX', 'source_id', 9900001, 'name', 'Rock Garden', 'level', 4, 'kind', 'trail',
      'route_enc', '_p~iF~ps|U_ulLnnqC', 'length_m', 1200, 'min_lat', 38.5, 'min_lng', -120.95, 'max_lat', 40.7, 'max_lng', -120.2),
    jsonb_build_object('park_name', 'Test Park', 'park_state', 'TX', 'source_id', 9900002, 'name', 'Park Road 1', 'kind', 'road',
      'route_enc', '_p~iF~ps|U_ulLnnqC', 'length_m', 300, 'min_lat', 38.5, 'min_lng', -120.95, 'max_lat', 40.7, 'max_lng', -120.2)));
  if (r ->> 'upserted')::int <> 2 or (r ->> 'removed')::int <> 0 then raise exception 'FAIL: first import %', r; end if;
  -- The admin reads lines through the page function (the table itself has no policy).
  select (x ->> 'id')::uuid into hid from jsonb_array_elements(admin_park_trails(99001, '') -> 'lines') x where (x ->> 'source_id')::bigint = 9900002;
  perform admin_set_park_trail_hidden(hid, true);
  if jsonb_array_length(park_trails_in_area(38, -121, 41, -120)) <> 1 then raise exception 'FAIL: hidden line still on the map'; end if;
  -- Re-import: the road is still in the source (stays hidden), the trail renamed, a third line new.
  r := admin_import_park_trails(99001, jsonb_build_array(
    jsonb_build_object('park_name', 'Test Park', 'park_state', 'TX', 'source_id', 9900001, 'name', 'Rock Garden Loop', 'level', 5, 'kind', 'trail',
      'route_enc', '_p~iF~ps|U_ulLnnqC', 'length_m', 1250, 'min_lat', 38.5, 'min_lng', -120.95, 'max_lat', 40.7, 'max_lng', -120.2),
    jsonb_build_object('park_name', 'Test Park', 'park_state', 'TX', 'source_id', 9900002, 'name', 'Park Road 1', 'kind', 'road',
      'route_enc', '_p~iF~ps|U_ulLnnqC', 'length_m', 300, 'min_lat', 38.5, 'min_lng', -120.95, 'max_lat', 40.7, 'max_lng', -120.2),
    jsonb_build_object('park_name', 'Test Park', 'park_state', 'TX', 'source_id', 9900003, 'name', 'Spur', 'kind', 'trail',
      'route_enc', '_p~iF~ps|U_ulLnnqC', 'length_m', 200, 'min_lat', 38.5, 'min_lng', -120.95, 'max_lat', 40.7, 'max_lng', -120.2)));
  if (r ->> 'upserted')::int <> 3 then raise exception 'FAIL: re-import %', r; end if;
  l := admin_park_trails(99001, '');
  if not exists (select 1 from jsonb_array_elements(l -> 'lines') x where (x ->> 'id')::uuid = hid and (x ->> 'hidden')::boolean) then raise exception 'FAIL: hidden flag lost on re-import'; end if;
  if not exists (select 1 from jsonb_array_elements(l -> 'lines') x where (x ->> 'source_id')::bigint = 9900001 and x ->> 'name' = 'Rock Garden Loop' and (x ->> 'level')::int = 5) then raise exception 'FAIL: update in place'; end if;
  -- Third import drops the spur.
  r := admin_import_park_trails(99001, jsonb_build_array(
    jsonb_build_object('park_name', 'Test Park', 'source_id', 9900001, 'name', 'Rock Garden Loop', 'level', 5,
      'route_enc', '_p~iF~ps|U_ulLnnqC', 'length_m', 1250, 'min_lat', 38.5, 'min_lng', -120.95, 'max_lat', 40.7, 'max_lng', -120.2),
    jsonb_build_object('park_name', 'Test Park', 'source_id', 9900002, 'name', 'Park Road 1', 'kind', 'road',
      'route_enc', '_p~iF~ps|U_ulLnnqC', 'length_m', 300, 'min_lat', 38.5, 'min_lng', -120.95, 'max_lat', 40.7, 'max_lng', -120.2)));
  if (r ->> 'removed')::int <> 1 then raise exception 'FAIL: removal %', r; end if;
  n := jsonb_array_length(admin_park_trails(99001, '') -> 'lines');
  if n <> 2 then raise exception 'FAIL: % lines after third import', n; end if;
  -- Admin page: the park shows with its hidden count; its lines list the hidden one too; show it again.
  l := admin_park_trails(99001, '');
  if not exists (select 1 from jsonb_array_elements(l -> 'parks') p where (p ->> 'park_osm_id')::bigint = 99001 and (p ->> 'hidden')::int = 1 and (p ->> 'trails')::int = 1) then
    raise exception 'FAIL: admin park row %', l -> 'parks';
  end if;
  if jsonb_array_length(l -> 'lines') <> 2 then raise exception 'FAIL: admin lines'; end if;
  if jsonb_array_length(admin_park_trails(99001, 'rock') -> 'lines') <> 1 then raise exception 'FAIL: admin search'; end if;
  perform admin_set_park_trail_hidden(hid, false);
  if jsonb_array_length(park_trails_in_area(38, -121, 41, -120)) <> 2 then raise exception 'FAIL: shown again'; end if;
end $$;
reset role;
do $$
begin
  if (select count(*) from admin_audit_log where action in ('park_trail.hide', 'park_trail.show', 'park_trail.import')) < 5 then raise exception 'FAIL: audit log'; end if;
end $$;
select as_session('00000000-0000-0000-0000-00000000e702', 'aal2');
set role authenticated;
select expect_error($q$select admin_import_park_trails(99001, '{"not":"an array"}'::jsonb)$q$, '%must be an array%', 'bad import body');
reset role;

-- P5: an admin with only a password session can't import or hide.
select as_session('00000000-0000-0000-0000-00000000e702', 'aal1');
set role authenticated;
select expect_error($q$select admin_import_park_trails(99001, '[]'::jsonb)$q$, '%two-factor%', 'aal1 import');
reset role;

delete from park_trails where park_osm_id = 99001;
