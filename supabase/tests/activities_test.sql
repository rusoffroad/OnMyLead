-- Activities (migration 20261121300000_activities.sql): rides, events and places carry an activity;
-- everything from before is Offroad; the activity lists only show their own; only a host labels an
-- event and only an admin changes a place's activities. Runs after places_to_ride_test.sql (places
-- d001.., the admin d72) and events_test.sql (Eve e0e01 has Pro).

-- A ride saved the old way (no activity) is Offroad; a new one can be a Snowmobile ride; junk is refused.
select as_user('00000000-0000-0000-0000-0000000e0e01');
set role authenticated;
do $$
declare a text; b text;
begin
  insert into rides (organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility)
  values ('00000000-0000-0000-0000-0000000e0e01', 'Old Way', now() + interval '2 days', 30.6, -98.15, 'public')
  returning activity into a;
  insert into rides (organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility, activity)
  values ('00000000-0000-0000-0000-0000000e0e01', 'Sled Day', now() + interval '2 days', 30.6, -98.15, 'public', 'snowmobile')
  returning activity into b;
  if a <> 'offroad' or b <> 'snowmobile' then raise exception 'FAIL: ride activity % %', a, b; end if;
end $$;
select expect_refused($q$insert into rides (organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility, activity)
  values ('00000000-0000-0000-0000-0000000e0e01', 'Bad', now() + interval '2 days', 30.6, -98.15, 'public', 'Snow Mobile!')$q$, 'junk activity');
do $$
begin
  if (select count(*) from rides where visibility = 'public' and activity = 'snowmobile' and name = 'Sled Day') <> 1 then raise exception 'FAIL: filter rides by activity'; end if;
  if exists (select 1 from rides where activity = 'snowmobile' and name = 'Old Way') then raise exception 'FAIL: old ride became a sled ride'; end if;
end $$;

-- Eve makes an event and labels it Snowmobile; it lists under Snowmobile only, and still in the old list.
create temp table act_ids (k text primary key, id uuid);
grant all on act_ids to authenticated, anon;
do $$
declare e uuid;
begin
  e := (save_event(null, '{"title":"Winter Poker Run","starts_at":"2031-01-10T15:00:00Z","location_name":"Snow Park","lat":30.6,"lng":-98.15}') ->> 'id')::uuid;
  insert into act_ids values ('event', e);
  if (select activity from rider_events where id = e) <> 'offroad' then raise exception 'FAIL: new event not Offroad first'; end if;
  perform set_event_activity(e, 'snowmobile');
  if not exists (select 1 from jsonb_array_elements(events_list_for('snowmobile')) x where (x ->> 'id')::uuid = e) then raise exception 'FAIL: not in snowmobile list'; end if;
  if exists (select 1 from jsonb_array_elements(events_list_for('offroad')) x where (x ->> 'id')::uuid = e) then raise exception 'FAIL: in offroad list'; end if;
  if not exists (select 1 from jsonb_array_elements(events_list()) x where (x ->> 'id')::uuid = e) then raise exception 'FAIL: gone from the old list'; end if;
end $$;
select expect_refused($q$select set_event_activity((select id from act_ids where k = 'event'), 'Bad One')$q$, 'bad event activity');
reset role;

-- Rita isn't a host: she can't relabel Eve's event.
select as_user('00000000-0000-0000-0000-0000000e0e03');
set role authenticated;
select expect_refused($q$select set_event_activity((select id from act_ids where k = 'event'), 'offroad')$q$, 'non-host labels an event');
-- Nor change a place's activities.
select expect_refused($q$select admin_set_riding_spot_activities('00000000-0000-0000-0000-00000000d001', array['snowmobile'])$q$, 'rider edits place activities');
reset role;

-- Places: Hidden Falls starts as Offroad only; the admin adds Snowmobile; the old function lists it either way.
select as_user(null);
set role anon;
do $$
begin
  if not exists (select 1 from riding_spots_near_for('offroad', 30.6079, -98.1582, 50) where id = '00000000-0000-0000-0000-00000000d001') then raise exception 'FAIL: offroad place missing'; end if;
  if exists (select 1 from riding_spots_near_for('snowmobile', 30.6079, -98.1582, 50) where id = '00000000-0000-0000-0000-00000000d001') then raise exception 'FAIL: offroad place in snowmobile list'; end if;
  if not exists (select 1 from riding_spots_near(30.6079, -98.1582, 50) where id = '00000000-0000-0000-0000-00000000d001') then raise exception 'FAIL: old function lost the place'; end if;
end $$;
reset role;

select as_session('00000000-0000-0000-0000-000000000d72', 'aal2');
set role authenticated;
do $$
begin
  perform admin_set_riding_spot_activities('00000000-0000-0000-0000-00000000d001', array['snowmobile', 'offroad']);
  if admin_riding_spot_activities(array['00000000-0000-0000-0000-00000000d001'::uuid]) -> '00000000-0000-0000-0000-00000000d001' <> '["offroad", "snowmobile"]'::jsonb then
    raise exception 'FAIL: admin activities %', admin_riding_spot_activities(array['00000000-0000-0000-0000-00000000d001'::uuid]);
  end if;
end $$;
select expect_refused($q$select admin_set_riding_spot_activities('00000000-0000-0000-0000-00000000d001', array[]::text[])$q$, 'no activities');
reset role;

select as_user(null);
set role anon;
do $$
begin
  if not exists (select 1 from riding_spots_near_for('snowmobile', 30.6079, -98.1582, 50) where id = '00000000-0000-0000-0000-00000000d001') then raise exception 'FAIL: snowmobile place missing'; end if;
  if not exists (select 1 from riding_spots_near_for('offroad', 30.6079, -98.1582, 50) where id = '00000000-0000-0000-0000-00000000d001') then raise exception 'FAIL: still offroad'; end if;
end $$;
reset role;
