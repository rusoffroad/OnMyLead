-- Trail width limits (migration 20261103200000_trail_widths.sql): riders add a width to a public
-- trail, each rider counts once, everyone sees the middle value, nobody reads another rider's entry,
-- the admin removes one, and Garage vehicles take a width. Runs after events_test.sql (run_local.sh),
-- which leaves as_user, as_session and expect_error in place. Each block raises an exception if a
-- rule is broken.

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000c71', 'w1@example.test', '{"full_name":"Wade One"}'),
  ('00000000-0000-0000-0000-000000000c72', 'w2@example.test', '{"full_name":"Wren Two"}'),
  ('00000000-0000-0000-0000-000000000c73', 'w3@example.test', '{"full_name":"Wes Three"}'),
  ('00000000-0000-0000-0000-000000000c74', 'wboss@example.test', '{"full_name":"Width Boss"}');
insert into admin_users (user_id) values ('00000000-0000-0000-0000-000000000c74');

-- Signed out: nothing.
select as_user(null);
set role anon;
select expect_error($q$select trail_width_near('mvum', '731@Fishlake', null, 38.5, -111.9)$q$, '%sign in%', 'anon reads widths');
select expect_error($q$select report_trail_width('mvum', '731@Fishlake', null, 38.5, -111.9, 50)$q$, '%sign in%', 'anon adds width');
reset role;

-- Wade adds 60" to Forest Service trail 731, then changes it to 64": still one entry.
select as_user('00000000-0000-0000-0000-000000000c71');
set role authenticated;
do $$
declare r jsonb;
begin
  r := trail_width_near('mvum', '731@Fishlake', null, 38.5, -111.9);
  if (r ->> 'count')::int <> 0 or r ->> 'width_in' is not null then raise exception 'FAIL: empty line %', r; end if;
  r := report_trail_width('mvum', '731@Fishlake', 'Trail 731', 38.5, -111.9, 60);
  if (r ->> 'width_in')::int <> 60 or (r ->> 'mine')::int <> 60 or (r ->> 'count')::int <> 1 then raise exception 'FAIL: first entry %', r; end if;
  -- Tapped a mile further along the same route: same line by its id.
  r := report_trail_width('mvum', '731@Fishlake', 'Trail 731', 38.51, -111.92, 64);
  if (r ->> 'width_in')::int <> 64 or (r ->> 'count')::int <> 1 then raise exception 'FAIL: change %', r; end if;
end $$;
select expect_error($q$select report_trail_width('mvum', '731@Fishlake', null, 38.5, -111.9, 200)$q$, '%30 to 120%', 'too wide');
select expect_error($q$select report_trail_width('mvum', '731@Fishlake', null, 38.5, -111.9, 10)$q$, '%30 to 120%', 'too narrow');
select expect_error($q$select report_trail_width('google', null, null, 38.5, -111.9, 50)$q$, '%source%', 'bad source');
-- No reading or writing the table directly (privacy_test.sql grants every table, so this is row level security alone).
do $$ begin
  if exists (select 1 from trail_width_reports) then raise exception 'FAIL: read raw entries'; end if;
end $$;
select expect_error($q$insert into trail_width_reports (user_id, source, lat, lng, width_in) values (auth.uid(), 'osm', 1, 1, 50)$q$, '%row-level security%', 'raw insert');
reset role;

-- Wren says 50", Wes says 52": the middle of 50, 52, 64 is 52. Wren sees her own entry.
select as_user('00000000-0000-0000-0000-000000000c72');
set role authenticated;
select report_trail_width('mvum', '731@Fishlake', null, 38.5, -111.9, 50);
reset role;
select as_user('00000000-0000-0000-0000-000000000c73');
set role authenticated;
do $$
declare r jsonb := report_trail_width('mvum', '731@Fishlake', null, 38.5, -111.9, 52);
begin
  if (r ->> 'width_in')::int <> 52 or (r ->> 'count')::int <> 3 or (r ->> 'mine')::int <> 52 then raise exception 'FAIL: middle %', r; end if;
  -- Same route number in another forest is a different line.
  if (trail_width_near('mvum', '731@Dixie', null, 38.5, -111.9) ->> 'count')::int <> 0 then raise exception 'FAIL: other forest matched'; end if;
end $$;
reset role;

-- OpenStreetMap: no lasting id. A named track matches by name a few km along; an unnamed one only nearby.
select as_user('00000000-0000-0000-0000-000000000c71');
set role authenticated;
do $$
declare r jsonb;
begin
  perform report_trail_width('osm', null, 'Hells Revenge', 38.58, -109.52, 70);
  r := trail_width_near('osm', null, 'hells revenge', 38.6, -109.5);
  if (r ->> 'width_in')::int <> 70 then raise exception 'FAIL: named osm along the track %', r; end if;
  if (trail_width_near('osm', null, 'Hells Revenge', 39.2, -109.5) ->> 'count')::int <> 0 then raise exception 'FAIL: named osm far away'; end if;
  perform report_trail_width('osm', null, null, 30.0, -98.0, 55);
  if (trail_width_near('osm', null, null, 30.0002, -98.0002) ->> 'width_in')::int <> 55 then raise exception 'FAIL: unnamed nearby'; end if;
  if (trail_width_near('osm', null, null, 30.01, -98.0) ->> 'count')::int <> 0 then raise exception 'FAIL: unnamed 1 km away'; end if;
  -- Clearing removes only Wade's own entry.
  r := report_trail_width('osm', null, null, 30.0, -98.0, null);
  if (r ->> 'count')::int <> 0 or r ->> 'mine' is not null then raise exception 'FAIL: clear %', r; end if;
end $$;
reset role;

-- Garage vehicles take a width (20 to 120 inches).
select as_user('00000000-0000-0000-0000-000000000c71');
set role authenticated;
insert into vehicles (owner_id, kind, nickname, width_in) values (auth.uid(), 'sxs_utv', 'RZR', 64);
select expect_error($q$insert into vehicles (owner_id, kind, nickname, width_in) values (auth.uid(), 'sxs_utv', 'Wide', 200)$q$, '%check%', 'vehicle too wide');
reset role;

-- Riders can't use the admin functions; the admin needs two-factor.
select as_user('00000000-0000-0000-0000-000000000c72');
set role authenticated;
select expect_error($q$select admin_trail_widths()$q$, '%admin%', 'rider lists widths');
reset role;
select as_session('00000000-0000-0000-0000-000000000c74', 'aal1');
set role authenticated;
select expect_error($q$select admin_trail_widths()$q$, '%two-factor%', 'admin widths without aal2');
reset role;

-- The admin removes Wade's 64": the middle of 50 and 52 is now 50, and Wade can't put it back.
select as_session('00000000-0000-0000-0000-000000000c74', 'aal2');
set role authenticated;
do $$
declare
  a jsonb := admin_trail_widths('public', 'Trail 731');
  wade uuid;
begin
  if (a ->> 'total')::int <> 1 then raise exception 'FAIL: admin search %', a; end if;
  wade := (a -> 'rows' -> 0 ->> 'id')::uuid;
  if a -> 'rows' -> 0 ->> 'email' <> 'w1@example.test' or (a -> 'rows' -> 0 #>> '{shown,width_in}')::int <> 52 then raise exception 'FAIL: admin row %', a; end if;
  perform admin_set_trail_width_status(wade, 'removed');
  if (admin_trail_widths('removed') ->> 'total')::int <> 1 then raise exception 'FAIL: removed filter'; end if;
end $$;
select expect_error($q$select admin_set_trail_width_status(gen_random_uuid(), 'gone')$q$, '%status%', 'bad width status');
reset role;
do $$ begin
  if (select count(*) from admin_audit_log where action = 'trail_width.removed') <> 1 then raise exception 'FAIL: removal not logged'; end if;
end $$;
select as_user('00000000-0000-0000-0000-000000000c71');
set role authenticated;
do $$
declare r jsonb := trail_width_near('mvum', '731@Fishlake', null, 38.5, -111.9);
begin
  if (r ->> 'width_in')::int <> 50 or (r ->> 'count')::int <> 2 or r ->> 'mine' is not null then raise exception 'FAIL: after removal %', r; end if;
end $$;
select expect_error($q$select report_trail_width('mvum', '731@Fishlake', null, 38.5, -111.9, 64)$q$, '%removed%', 'removed entry comes back');
reset role;
