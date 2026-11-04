-- Scout, places to ride (migration 20261104170000_riding_spots.sql): nearest first within the
-- rider's distance, filtered by kind, with public rides coming up nearby; anyone can read live
-- places, nobody reads hidden or pending ones or who suggested them; riders suggest places that
-- wait for the admin; the admin approves, hides and edits, and a re-import doesn't undo it.
-- Runs last (run_local.sh), using as_user, as_session and expect_error from earlier files.

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000d71', 'scout1@example.test', '{"full_name":"Sage Scout"}'),
  ('00000000-0000-0000-0000-000000000d72', 'scoutboss@example.test', '{"full_name":"Spot Boss"}');
insert into admin_users (user_id) values ('00000000-0000-0000-0000-000000000d72');

-- Start from an empty table (the seed migration loaded the real places), then fixtures around Marble Falls, TX (30.57, -98.27). Hidden Falls is ~5 mi away, Katemcy ~70 mi,
-- Gator Run ~190 mi, Rasor (CA) ~1,100 mi. One hidden.
do $$ begin
  if (select count(*) from riding_spots where source in ('usfs', 'blm', 'osm')) < 300 then raise exception 'FAIL: seed missing'; end if;
  if not exists (select 1 from riding_spots where source = 'osm' and source_id = '331218708' and name = 'Hidden Falls Adventure Park') then raise exception 'FAIL: Hidden Falls not seeded'; end if;
end $$;
delete from riding_spots;
insert into riding_spots (id, source, source_id, name, kind, lat, lng, state, area_name, website, license, attribution, status) values
  ('00000000-0000-0000-0000-00000000d001', 'osm', '331218708', 'Hidden Falls Adventure Park', 'park', 30.6079, -98.1582, 'TX', 'Burnet County', 'https://hiddenfallsadventure.com', 'ODbL 1.0', '© OpenStreetMap contributors', 'live'),
  ('00000000-0000-0000-0000-00000000d002', 'osm', '1002', 'Katemcy Rocks Offroad Park', 'park', 30.92, -99.27, 'TX', null, null, 'ODbL 1.0', '© OpenStreetMap contributors', 'live'),
  ('00000000-0000-0000-0000-00000000d003', 'osm', '1003', 'Gator Run Offroad Park', 'park', 30.32, -95.47, 'TX', null, null, 'ODbL 1.0', '© OpenStreetMap contributors', 'live'),
  ('00000000-0000-0000-0000-00000000d004', 'blm', 'rasor', 'Rasor OHV Area', 'ohv_area', 35.0799, -116.1937, 'CA', null, null, 'public domain', 'Bureau of Land Management', 'live'),
  ('00000000-0000-0000-0000-00000000d005', 'osm', '1005', 'Old Closed MX', 'track', 30.6, -98.2, 'TX', null, null, 'ODbL 1.0', '© OpenStreetMap contributors', 'hidden');

-- A public ride 3 miles from Hidden Falls, and a private one there that must not count.
select as_user('00000000-0000-0000-0000-000000000d71');
set role authenticated;
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility) values
  ('00000000-0000-0000-0000-00000000d101', auth.uid(), 'Hidden Falls Saturday', now() + interval '2 days', 30.58, -98.13, 'public'),
  ('00000000-0000-0000-0000-00000000d102', auth.uid(), 'Private Crew', now() + interval '2 days', 30.6, -98.15, 'private');
reset role;

-- Signed out (the website): live places within 250 miles, nearest first, with rides coming up.
select as_user(null);
set role anon;
do $$
declare
  ids uuid[];
  r record;
begin
  select array_agg(id order by distance_mi) into ids from riding_spots_near(30.57, -98.27, 250);
  if ids is distinct from array['00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-00000000d003']::uuid[] then
    raise exception 'FAIL: 250 mi gave %', ids;
  end if;
  select * into r from riding_spots_near(30.57, -98.27, 250) limit 1;
  if r.rides_coming_up <> 1 then raise exception 'FAIL: rides near Hidden Falls %', r.rides_coming_up; end if;
  if r.distance_mi not between 4 and 8 then raise exception 'FAIL: distance %', r.distance_mi; end if;
  -- Closer distance, kind filter, and the 1,000 mile cap.
  if (select count(*) from riding_spots_near(30.57, -98.27, 50)) <> 1 then raise exception 'FAIL: 50 mi'; end if;
  if (select count(*) from riding_spots_near(30.57, -98.27, 5000)) <> 3 then raise exception 'FAIL: cap at 1000 mi'; end if;
  if (select count(*) from riding_spots_near(35, -116, 100, array['park'])) <> 0 then raise exception 'FAIL: kind filter'; end if;
  if (select count(*) from riding_spots_near(35, -116, 100, array['ohv_area'])) <> 1 then raise exception 'FAIL: kind filter ohv'; end if;
  -- Reading the table: live rows only, and never the suggester.
  if exists (select 1 from riding_spots where status <> 'live') then raise exception 'FAIL: anon reads hidden'; end if;
  if (select count(*) from riding_spots where id = '00000000-0000-0000-0000-00000000d001') <> 1 then raise exception 'FAIL: anon reads live'; end if;
end $$;
select expect_error($q$select suggested_by from riding_spots$q$, '%permission denied%', 'anon reads suggester');
select expect_error($q$select suggest_riding_spot('X Park', 'park', 30, -98)$q$, '%sign in%', 'anon suggests');
select expect_error($q$select * from riding_spots_near(null, -98, 50)$q$, '%bad spot%', 'no spot');
reset role;

-- Sage suggests a missing place: pending, so nobody sees it yet.
select as_user('00000000-0000-0000-0000-000000000d71');
set role authenticated;
do $$
declare v uuid;
begin
  v := suggest_riding_spot('  Wolf Caves Offroad Park ', 'park', 30.55, -98.0, 'wolfcaves.com', 'Open weekends', 'tx');
  perform set_config('test.spot', v::text, false);
  if exists (select 1 from riding_spots where id = v) then raise exception 'FAIL: pending shows'; end if;
  if exists (select 1 from riding_spots_near(30.57, -98.27, 250) where id = v) then raise exception 'FAIL: pending in search'; end if;
end $$;
select expect_error($q$select suggest_riding_spot('X', 'park', 30, -98)$q$, '%2 to 120%', 'short name');
select expect_error($q$select suggest_riding_spot('Moon Base', 'helipad', 30, -98)$q$, '%kind%', 'bad kind');
select expect_error($q$select suggest_riding_spot('Moon Base', 'park', 95, -98)$q$, '%where%', 'bad spot');
select expect_error($q$insert into riding_spots (source, source_id, name, kind, lat, lng) values ('rider', 'x', 'Sneaky', 'park', 1, 1)$q$, '%row-level security%', 'raw insert');
select expect_error($q$select admin_riding_spots()$q$, '%admin only%', 'rider lists admin');
select expect_error($q$select admin_save_riding_spot('00000000-0000-0000-0000-00000000d001', '{"status":"hidden"}')$q$, '%admin only%', 'rider hides');
reset role;
do $$ begin
  if (select website || '|' || state || '|' || name || '|' || status from riding_spots where id = current_setting('test.spot')::uuid)
     <> 'https://wolfcaves.com|TX|Wolf Caves Offroad Park|pending' then
    raise exception 'FAIL: suggestion saved wrong';
  end if;
end $$;

-- The admin (two-factor) sees it first, approves it, hides Gator Run and renames Katemcy.
select as_session('00000000-0000-0000-0000-000000000d72', 'aal2');
set role authenticated;
do $$
declare
  j jsonb := admin_riding_spots('pending');
  v uuid := current_setting('test.spot')::uuid;
begin
  if (j -> 'counts' ->> 'pending')::int <> 1 or j -> 'rows' -> 0 ->> 'rider' <> 'Sage Scout' or j -> 'rows' -> 0 ->> 'suggestion_note' <> 'Open weekends' then
    raise exception 'FAIL: admin list %', j;
  end if;
  perform admin_save_riding_spot(v, '{"status":"live"}');
  perform admin_save_riding_spot('00000000-0000-0000-0000-00000000d003', '{"status":"hidden"}');
  perform admin_save_riding_spot('00000000-0000-0000-0000-00000000d002', '{"name":"Katemcy Rocks"}');
  if (select attribution from riding_spots where id = v) <> 'OnMyLead riders' then raise exception 'FAIL: rider credit'; end if;
end $$;
reset role;
do $$ begin
  if not exists (select 1 from admin_audit_log where action = 'riding_spot.hidden') then raise exception 'FAIL: audit'; end if;
end $$;

-- Riders see the approved place and not the hidden one; a re-import doesn't undo the admin.
select as_user(null);
set role anon;
do $$ begin
  if not exists (select 1 from riding_spots_near(30.57, -98.27, 250) where id = current_setting('test.spot')::uuid) then raise exception 'FAIL: approved missing'; end if;
  if exists (select 1 from riding_spots_near(30.57, -98.27, 250) where id = '00000000-0000-0000-0000-00000000d003') then raise exception 'FAIL: hidden shows'; end if;
end $$;
reset role;
insert into riding_spots (source, source_id, name, kind, lat, lng, state, license, attribution)
values ('osm', '1002', 'Katemcy Rocks Offroad Park', 'park', 30.92, -99.27, 'TX', 'ODbL 1.0', '© OpenStreetMap contributors'),
       ('osm', '1003', 'Gator Run Offroad Park', 'park', 30.32, -95.47, 'TX', 'ODbL 1.0', '© OpenStreetMap contributors')
on conflict (source, source_id) do update set name = excluded.name, updated_at = now()
where not riding_spots.edited_by_admin;
do $$ begin
  if (select name from riding_spots where source_id = '1002') <> 'Katemcy Rocks' then raise exception 'FAIL: re-import renamed'; end if;
  if (select status from riding_spots where source_id = '1003') <> 'hidden' then raise exception 'FAIL: re-import unhid'; end if;
end $$;

select 'riding spots ok';
