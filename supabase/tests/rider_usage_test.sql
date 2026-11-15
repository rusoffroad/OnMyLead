-- Rider usage (migration 20261115100000_rider_usage.sql): every signed-in rider's app logs app
-- opens and Map Mode / Ride Mode time, each call is capped, riders can't read the table, and the
-- admin's numbers leave test and admin accounts out. Runs after the files that set up as_user,
-- as_session and expect_error (run_local.sh). Each block raises an exception if a rule is broken.

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000f51', 'usage-boss@example.test', '{"full_name":"Usage Boss"}'),
  ('00000000-0000-0000-0000-000000000f52', 'usage-ann@example.test', '{"full_name":"Ann Usage"}'),
  ('00000000-0000-0000-0000-000000000f53', 'usage-qa@example.test', '{"full_name":"Quinn Usage"}'),
  ('00000000-0000-0000-0000-000000000f54', 'usage-cal@example.test', '{"full_name":"Cal Usage"}');
insert into admin_users (user_id) values ('00000000-0000-0000-0000-000000000f51');
insert into admin_test_accounts (user_id, note) values ('00000000-0000-0000-0000-000000000f53', 'QA phone');

create table _usage_base (k text primary key, v numeric not null);
grant select, insert on _usage_base to authenticated;

-- A ride Ann leads that started an hour ago, before anyone logs anything.
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility, status, started_at)
values ('22222222-2222-2222-2222-222222222f51', '00000000-0000-0000-0000-000000000f52', 'Usage Ride',
        now() - interval '2 hours', 44.0, -85.0, 'unlisted', 'live', now() - interval '1 hour');

select as_session('00000000-0000-0000-0000-000000000f51', 'aal2');
set role authenticated;
do $$
declare s jsonb := admin_usage_summary(now() - interval '1 day', now() + interval '1 minute');
begin
  insert into _usage_base values ('shared', (s ->> 'rides_shared')::int), ('started', (s ->> 'rides_started')::int),
    ('created', (s ->> 'rides_created')::int);
end $$;
reset role;

-- Signed out: nothing.
select as_user(null);
set role anon;
select expect_error($q$select log_app_usage('app', 1, 60, 'iphone')$q$, '%not signed in%', 'anon logs usage');
reset role;

-- Ann opens the app on her iPhone and spends time in Map Mode and Ride Mode.
select as_user('00000000-0000-0000-0000-000000000f52');
set role authenticated;
select log_app_usage('app', 1, 60, 'iphone');
select log_app_usage('app', 0, 9999, 'iphone');        -- capped at 5 minutes
select log_app_usage('map_mode', 50, 120, 'iphone');   -- capped at 5 sessions
select log_app_usage('ride_mode', 1, 90, 'ipad');
select log_app_usage('app', 1, 30, 'toaster');          -- unknown device: other
select log_app_usage('app', 0, 0, 'iphone');            -- nothing to add
select expect_error($q$select log_app_usage('settings', 1, 1, 'iphone')$q$, '%unknown usage kind%', 'bad kind');
-- No reading the table directly (privacy_test.sql grants every table, so this is row level security alone).
do $$ begin
  if exists (select 1 from rider_usage_days) then raise exception 'FAIL: rider reads the table'; end if;
end $$;
select expect_error($q$insert into rider_usage_days (user_id, day, kind, device, seconds) values (auth.uid(), current_date, 'app', 'web', 99999)$q$, '%row-level security%', 'raw insert');
select expect_error($q$select admin_usage_summary(null, null)$q$, '%', 'rider reads admin usage');
reset role;

-- Quinn's QA phone (a marked test account) and the admin use Map Mode too: left out.
select as_user('00000000-0000-0000-0000-000000000f53');
set role authenticated;
select log_app_usage('map_mode', 1, 300, 'android');
select log_app_usage('app', 1, 300, 'android');
reset role;
select as_user('00000000-0000-0000-0000-000000000f51');
set role authenticated;
select log_app_usage('map_mode', 1, 300, 'web');
reset role;

-- The day's caps hold however many calls come in.
select as_user('00000000-0000-0000-0000-000000000f54');
set role authenticated;
do $$
declare i int;
begin
  for i in 1..300 loop perform log_app_usage('app', 5, 300, 'android'); end loop;
end $$;
reset role;
do $$
declare r record;
begin
  select sessions, seconds into r from rider_usage_days where user_id = '00000000-0000-0000-0000-000000000f54' and kind = 'app';
  if r.sessions <> 500 or r.seconds <> 86400 then raise exception 'FAIL: day caps % %', r.sessions, r.seconds; end if;
  select sessions, seconds into r from rider_usage_days
    where user_id = '00000000-0000-0000-0000-000000000f52' and kind = 'app' and device = 'iphone';
  if r.sessions <> 1 or r.seconds <> 360 then raise exception 'FAIL: Ann app iphone % %', r.sessions, r.seconds; end if;
  select sessions, seconds into r from rider_usage_days where user_id = '00000000-0000-0000-0000-000000000f52' and kind = 'map_mode';
  if r.sessions <> 5 or r.seconds <> 120 then raise exception 'FAIL: Ann map % %', r.sessions, r.seconds; end if;
  if not exists (select 1 from rider_usage_days where user_id = '00000000-0000-0000-0000-000000000f52' and device = 'other') then
    raise exception 'FAIL: unknown device not stored as other';
  end if;
end $$;

-- Ann and Cal share on Ann's ride (Quinn shares too, but Quinn doesn't count as a real rider).
insert into ride_tracks (ride_id, user_id, points) values
  ('22222222-2222-2222-2222-222222222f51', '00000000-0000-0000-0000-000000000f52', '[[-85.0, 44.0, 1, 3], [-85.001, 44.0, 2, 3]]'),
  ('22222222-2222-2222-2222-222222222f51', '00000000-0000-0000-0000-000000000f54', '[[-85.0, 44.0, 1, 3]]');
-- Quinn's own ride with only Quinn and the admin sharing: not a real ride.
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility, status, started_at)
values ('22222222-2222-2222-2222-222222222f53', '00000000-0000-0000-0000-000000000f53', 'QA Ride',
        now() - interval '2 hours', 44.0, -85.0, 'unlisted', 'live', now() - interval '30 minutes');
insert into ride_tracks (ride_id, user_id, points) values
  ('22222222-2222-2222-2222-222222222f53', '00000000-0000-0000-0000-000000000f53', '[[-85.0, 44.0, 1, 3]]'),
  ('22222222-2222-2222-2222-222222222f53', '00000000-0000-0000-0000-000000000f51', '[[-85.0, 44.0, 1, 3]]');

select as_session('00000000-0000-0000-0000-000000000f51', 'aal2');
set role authenticated;
do $$
declare
  s jsonb := admin_usage_summary(now() - interval '1 day', now() + interval '1 minute');
  l jsonb := admin_usage_riders(now() - interval '1 day', now() + interval '1 minute', 100);
  ann jsonb;
  r record;
begin
  if (s ->> 'rides_shared')::int - (select v from _usage_base where k = 'shared') <> 1 then
    raise exception 'FAIL: rides with 2+ sharing %', s ->> 'rides_shared';
  end if;
  -- Ann's ride counts as started; Quinn's (test organizer, no real sharer) doesn't.
  if (s ->> 'rides_started')::int - (select v from _usage_base where k = 'started') <> 0 then
    raise exception 'FAIL: rides started moved % (both started before the baseline window was read)', s ->> 'rides_started';
  end if;
  if (s ->> 'rides_created')::int - (select v from _usage_base where k = 'created') <> 0 then
    raise exception 'FAIL: the QA ride counted as created';
  end if;
  if (s -> 'map_mode' ->> 'riders')::int <> 1 or (s -> 'map_mode' ->> 'seconds')::int <> 120 then
    raise exception 'FAIL: Map Mode should be Ann alone: %', s -> 'map_mode';
  end if;
  if (s -> 'ride_mode' ->> 'sessions')::int <> 1 then raise exception 'FAIL: Ride Mode %', s -> 'ride_mode'; end if;
  if (s -> 'app' ->> 'riders')::int <> 2 then raise exception 'FAIL: app riders (Ann, Cal) %', s -> 'app'; end if;
  if s ->> 'tracking_since' is null then raise exception 'FAIL: tracking_since'; end if;
  if exists (select 1 from jsonb_array_elements(l) x where x ->> 'user_id' in
      ('00000000-0000-0000-0000-000000000f51', '00000000-0000-0000-0000-000000000f53')) then
    raise exception 'FAIL: test or admin account listed: %', l;
  end if;
  select x into ann from jsonb_array_elements(l) x where x ->> 'user_id' = '00000000-0000-0000-0000-000000000f52';
  if ann is null then raise exception 'FAIL: Ann missing from %', l; end if;
  if (ann ->> 'opens')::int <> 2 or (ann ->> 'map_seconds')::int <> 120 or (ann ->> 'ride_seconds')::int <> 90
     or (ann ->> 'rides_shared')::int <> 1 then
    raise exception 'FAIL: Ann row %', ann;
  end if;
  -- Cal spent the most time in the app: first.
  if l -> 0 ->> 'user_id' <> '00000000-0000-0000-0000-000000000f54' then raise exception 'FAIL: order %', l; end if;
  select sum(map_mode_riders) as m, sum(map_mode_minutes) as mm into r
    from admin_usage_series(now() - interval '1 day', now() + interval '1 minute', 'day');
  if r.m <> 1 or r.mm <> 2 then raise exception 'FAIL: series % %', r.m, r.mm; end if;
end $$;
-- A ride that started in the window counts once it started.
reset role;
update rides set started_at = now() - interval '1 minute' where id = '22222222-2222-2222-2222-222222222f51';
select as_session('00000000-0000-0000-0000-000000000f51', 'aal2');
set role authenticated;
do $$
declare s jsonb := admin_usage_summary(now() - interval '5 minutes', now() + interval '1 minute');
begin
  if (s ->> 'rides_started')::int < 1 or (s ->> 'rides_shared')::int < 1 then raise exception 'FAIL: recent ride %', s; end if;
end $$;
reset role;

-- An admin without a second factor can't read it.
select as_session('00000000-0000-0000-0000-000000000f51', 'aal1');
set role authenticated;
select expect_error($q$select admin_usage_summary(null, null)$q$, '%', 'aal1 admin reads usage');
reset role;
