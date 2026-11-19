-- Admin metrics leave test rides out (migration 20261121700000_admin_metrics_skip_test_rides.sql).
-- A ride organized by a test or admin account counts only when a real rider joined, checked in or
-- shared their location on it. Nothing is deleted. Runs after the files that set up as_user,
-- as_session and expect_refused (run_local.sh), so counts are checked as changes from a baseline.
--
-- Riders (new here):
--   Ada  e71  admin
--   Tom  e72  marked test account (like Chris's phones and the App Review account)
--   Rae  e73  real rider
-- privacy_test.sql grants every function to riders (as Supabase does); put back what the migration revokes.
revoke all on function admin_is_test_ride(uuid, uuid) from public, anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000e71', 'tr-admin@example.test', '{"full_name":"Ada Admin"}'),
  ('00000000-0000-0000-0000-000000000e72', 'tr-test@example.test', '{"full_name":"Tom Test"}'),
  ('00000000-0000-0000-0000-000000000e73', 'tr-real@example.test', '{"full_name":"Rae Real"}');
insert into admin_users (user_id) values ('00000000-0000-0000-0000-000000000e71');
insert into admin_test_accounts (user_id, note) values ('00000000-0000-0000-0000-000000000e72', 'test phone');

create table _tr_base (k text primary key, v numeric not null);
grant select, insert on _tr_base to authenticated;

select as_session('00000000-0000-0000-0000-000000000e71', 'aal2');
set role authenticated;
do $$
declare
  o jsonb := admin_overview(now() - interval '1 day', now() + interval '1 minute');
  a jsonb := admin_analytics_summary(now() - interval '1 day', now() + interval '1 minute');
begin
  insert into _tr_base values
    ('live', (o ->> 'rides_live')::int), ('created', (o ->> 'rides_created')::int),
    ('joins', (o ->> 'ride_joins')::int), ('completed', (o ->> 'rides_completed')::int),
    ('a_created', (a ->> 'rides_created')::int), ('a_completed', (a ->> 'rides_completed')::int),
    ('a_joins', (a ->> 'ride_joins')::int), ('a_messages', (a ->> 'messages')::int),
    ('ts_created', (select coalesce(sum(t.v), 0) from admin_timeseries('rides_created', now() - interval '1 day', now() + interval '1 minute', 'day') t)),
    ('ts_completed', (select coalesce(sum(t.v), 0) from admin_timeseries('rides_completed', now() - interval '1 day', now() + interval '1 minute', 'day') t)),
    ('as_completed', (select coalesce(sum(value), 0) from admin_analytics_series('rides_completed', now() - interval '1 day', now() + interval '1 minute', 'day'))),
    ('as_messages', (select coalesce(sum(value), 0) from admin_analytics_series('messages', now() - interval '1 day', now() + interval '1 minute', 'day')));
end $$;
reset role;

-- TR1. Five rides:
--   b11 Tom alone, live                         -> test
--   b12 Tom organizes, Rae joined, live         -> real
--   b13 Rae organizes, Tom joined, live         -> real (Tom's join left out)
--   b14 Tom organizes, Rae left but shared a track, ended -> real
--   b15 Admin alone, ended                      -> test
--   b16 Tom alone, ended, then deleted          -> test (ride_creations row stays)
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility, status, started_at, ended_at) values
  ('22222222-2222-2222-2222-222222222b11', '00000000-0000-0000-0000-000000000e72', 'TR Solo Test', now(), 30, -97, 'unlisted', 'live', now(), null),
  ('22222222-2222-2222-2222-222222222b12', '00000000-0000-0000-0000-000000000e72', 'TR Test Leads Real', now(), 30, -97, 'unlisted', 'live', now(), null),
  ('22222222-2222-2222-2222-222222222b13', '00000000-0000-0000-0000-000000000e73', 'TR Real Leads', now(), 30, -97, 'unlisted', 'live', now(), null),
  ('22222222-2222-2222-2222-222222222b14', '00000000-0000-0000-0000-000000000e72', 'TR Real Tracked', now(), 30, -97, 'unlisted', 'ended', now(), now()),
  ('22222222-2222-2222-2222-222222222b15', '00000000-0000-0000-0000-000000000e71', 'TR Admin Solo', now(), 30, -97, 'unlisted', 'ended', now(), now()),
  ('22222222-2222-2222-2222-222222222b16', '00000000-0000-0000-0000-000000000e72', 'TR Deleted Test', now(), 30, -97, 'unlisted', 'ended', now(), now());
insert into ride_members (ride_id, user_id, status, role) values
  ('22222222-2222-2222-2222-222222222b12', '00000000-0000-0000-0000-000000000e73', 'joined', 'rider'),
  ('22222222-2222-2222-2222-222222222b13', '00000000-0000-0000-0000-000000000e72', 'joined', 'rider'),
  ('22222222-2222-2222-2222-222222222b14', '00000000-0000-0000-0000-000000000e73', 'cancelled', 'rider')
on conflict (ride_id, user_id) do update set status = excluded.status, role = excluded.role;
insert into ride_tracks (ride_id, user_id, points) values
  ('22222222-2222-2222-2222-222222222b14', '00000000-0000-0000-0000-000000000e73', '[[-97, 30, 1, 5]]'),
  ('22222222-2222-2222-2222-222222222b11', '00000000-0000-0000-0000-000000000e72', '[[-97, 30, 1, 5]]')
on conflict (ride_id, user_id) do update set points = excluded.points;
insert into ride_messages (ride_id, user_id, body) values
  ('22222222-2222-2222-2222-222222222b11', '00000000-0000-0000-0000-000000000e72', 'test ride chat'),
  ('22222222-2222-2222-2222-222222222b12', '00000000-0000-0000-0000-000000000e72', 'test account on a real ride'),
  ('22222222-2222-2222-2222-222222222b12', '00000000-0000-0000-0000-000000000e73', 'real chat');
delete from rides where id = '22222222-2222-2222-2222-222222222b16';

-- TR2. Which rides are test rides.
do $$ begin
  if not admin_is_test_ride('22222222-2222-2222-2222-222222222b11') then raise exception 'FAIL: solo test ride counted as real'; end if;
  if admin_is_test_ride('22222222-2222-2222-2222-222222222b12') then raise exception 'FAIL: test-led ride with a real rider left out'; end if;
  if admin_is_test_ride('22222222-2222-2222-2222-222222222b13') then raise exception 'FAIL: real rider''s ride left out'; end if;
  if admin_is_test_ride('22222222-2222-2222-2222-222222222b14') then raise exception 'FAIL: ride a real rider tracked left out'; end if;
  if not admin_is_test_ride('22222222-2222-2222-2222-222222222b15') then raise exception 'FAIL: admin solo ride counted'; end if;
  if not admin_is_test_ride('22222222-2222-2222-2222-222222222b16', '00000000-0000-0000-0000-000000000e72') then
    raise exception 'FAIL: deleted test ride counted';
  end if;
  -- Nothing was deleted by the metrics.
  if (select count(*) from rides where id::text like '22222222-2222-2222-2222-222222222b1%') <> 5 then
    raise exception 'FAIL: rides went missing';
  end if;
end $$;

-- TR3. The admin's numbers.
select as_session('00000000-0000-0000-0000-000000000e71', 'aal2');
set role authenticated;
do $$
declare
  o jsonb := admin_overview(now() - interval '1 day', now() + interval '1 minute');
  a jsonb := admin_analytics_summary(now() - interval '1 day', now() + interval '1 minute');
  d numeric;
begin
  -- Live: b12 and b13 (b11 is a test ride).
  d := (o ->> 'rides_live')::int - (select v from _tr_base where k = 'live');
  if d <> 2 then raise exception 'FAIL: overview rides_live +% (want 2)', d; end if;
  -- Created: b12, b13, b14 (b11, b15 and the deleted b16 are test rides).
  d := (o ->> 'rides_created')::int - (select v from _tr_base where k = 'created');
  if d <> 3 then raise exception 'FAIL: overview rides_created +% (want 3)', d; end if;
  d := (a ->> 'rides_created')::int - (select v from _tr_base where k = 'a_created');
  if d <> 3 then raise exception 'FAIL: analytics rides_created +% (want 3)', d; end if;
  d := (select coalesce(sum(t.v), 0) from admin_timeseries('rides_created', now() - interval '1 day', now() + interval '1 minute', 'day') t)
       - (select v from _tr_base where k = 'ts_created');
  if d <> 3 then raise exception 'FAIL: rides_created chart +% (want 3)', d; end if;
  -- Completed: b14 only.
  d := (o ->> 'rides_completed')::int - (select v from _tr_base where k = 'completed');
  if d <> 1 then raise exception 'FAIL: overview rides_completed +% (want 1)', d; end if;
  d := (a ->> 'rides_completed')::int - (select v from _tr_base where k = 'a_completed');
  if d <> 1 then raise exception 'FAIL: analytics rides_completed +% (want 1)', d; end if;
  d := (select coalesce(sum(t.v), 0) from admin_timeseries('rides_completed', now() - interval '1 day', now() + interval '1 minute', 'day') t)
       - (select v from _tr_base where k = 'ts_completed');
  if d <> 1 then raise exception 'FAIL: rides_completed chart +% (want 1)', d; end if;
  d := (select coalesce(sum(value), 0) from admin_analytics_series('rides_completed', now() - interval '1 day', now() + interval '1 minute', 'day'))
       - (select v from _tr_base where k = 'as_completed');
  if d <> 1 then raise exception 'FAIL: analytics rides_completed series +% (want 1)', d; end if;
  -- Joins: Rae on b12 only (Tom's join on b13 is a test account's).
  d := (o ->> 'ride_joins')::int - (select v from _tr_base where k = 'joins');
  if d <> 1 then raise exception 'FAIL: overview ride_joins +% (want 1)', d; end if;
  d := (a ->> 'ride_joins')::int - (select v from _tr_base where k = 'a_joins');
  if d <> 1 then raise exception 'FAIL: analytics ride_joins +% (want 1)', d; end if;
  -- Messages: Rae's on b12 only.
  d := (a ->> 'messages')::int - (select v from _tr_base where k = 'a_messages');
  if d <> 1 then raise exception 'FAIL: analytics messages +% (want 1)', d; end if;
  d := (select coalesce(sum(value), 0) from admin_analytics_series('messages', now() - interval '1 day', now() + interval '1 minute', 'day'))
       - (select v from _tr_base where k = 'as_messages');
  if d <> 1 then raise exception 'FAIL: messages series +% (want 1)', d; end if;
  -- Recent list: no test rides.
  if exists (select 1 from jsonb_array_elements(o -> 'recent') e where e ->> 'label' in ('TR Solo Test', 'TR Admin Solo')) then
    raise exception 'FAIL: test ride in Recent';
  end if;
end $$;
reset role;

-- TR4. Riders can't call the helper.
select as_user('00000000-0000-0000-0000-000000000e73');
set role authenticated;
select expect_refused($q$select admin_is_test_ride('22222222-2222-2222-2222-222222222b11')$q$, 'rider calling admin_is_test_ride');
reset role;
select as_user(null);
