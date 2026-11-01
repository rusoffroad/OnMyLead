-- Rider badges (migration 20261101500000_rider_badges.sql): earned only from real riding, never
-- typed in by hand, readable by every signed-in rider, with the exact numbers private to the rider.
-- Runs after privacy_test.sql (run_local.sh), which sets up as_user and expect_refused.

-- A track heading north from (lat0, lng): n fixes, dlat degrees and dt seconds apart.
create or replace function test_track(lat0 double precision, lng double precision, n int, dlat double precision, dt int)
returns jsonb language sql immutable as $$
  select jsonb_agg(jsonb_build_array(lng, lat0 + i * dlat, 1800000000 + i * dt, 5) order by i)
  from generate_series(0, n - 1) i
$$;

-- Fixtures: Bo leads Ada and Cy (tail gunner). Cy's phone never recorded (no track). Dee rides
-- alone. Ed tries to fake a ride with a track that only jumps (GPS spikes).
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000007a1', '{"full_name":"Ada"}'),
  ('00000000-0000-0000-0000-0000000007b1', '{"full_name":"Bo"}'),
  ('00000000-0000-0000-0000-0000000007c1', '{"full_name":"Cy"}'),
  ('00000000-0000-0000-0000-0000000007d1', '{"full_name":"Dee"}'),
  ('00000000-0000-0000-0000-0000000007e1', '{"full_name":"Ed"}');
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility, max_vehicles, status) values
  ('22222222-2222-2222-2222-2222222227b1', '00000000-0000-0000-0000-0000000007b1', 'Bo''s Loop', now() - interval '3 hours', 38.5, -109.5, 'public', 6, 'live'),
  ('22222222-2222-2222-2222-2222222227d1', '00000000-0000-0000-0000-0000000007d1', 'Dee Alone', now() - interval '3 hours', 38.5, -109.5, 'private', 6, 'live'),
  ('22222222-2222-2222-2222-2222222227e1', '00000000-0000-0000-0000-0000000007e1', 'Ed''s Fake', now() - interval '3 hours', 38.5, -109.5, 'private', 6, 'live');
insert into ride_members (ride_id, user_id, status, role) values
  ('22222222-2222-2222-2222-2222222227b1', '00000000-0000-0000-0000-0000000007a1', 'joined', 'rider'),
  ('22222222-2222-2222-2222-2222222227b1', '00000000-0000-0000-0000-0000000007c1', 'joined', 'sweep')
  on conflict do nothing;
-- About 1.1 km each for Bo and Ada; Dee rides 103 miles alone; Ed's fixes jump 11 km a second.
insert into ride_tracks (ride_id, user_id, points) values
  ('22222222-2222-2222-2222-2222222227b1', '00000000-0000-0000-0000-0000000007b1', test_track(38.5, -109.5, 21, 0.0005, 10)),
  ('22222222-2222-2222-2222-2222222227b1', '00000000-0000-0000-0000-0000000007a1', test_track(38.5, -109.501, 21, 0.0005, 10)),
  ('22222222-2222-2222-2222-2222222227d1', '00000000-0000-0000-0000-0000000007d1', test_track(38.5, -109.5, 151, 0.01, 60)),
  ('22222222-2222-2222-2222-2222222227e1', '00000000-0000-0000-0000-0000000007e1', test_track(38.5, -109.5, 50, 0.1, 1));

-- B1. Nothing counts while the rides are live.
do $$ begin
  if exists (select 1 from rider_badges where user_id::text like '00000000-0000-0000-0000-0000000007%')
     or exists (select 1 from rider_ride_credits where user_id::text like '00000000-0000-0000-0000-0000000007%') then raise exception 'FAIL: badges before any ride ended'; end if;
end $$;

-- B2. The rides end: Bo gets Trail Boss and Crew Rider, Ada gets Crew Rider, Cy (no track) gets
-- nothing, Dee gets Mile Eater but no group badges, Ed's spikes count for nothing.
update rides set status = 'ended', ended_at = now()
where id in ('22222222-2222-2222-2222-2222222227b1', '22222222-2222-2222-2222-2222222227d1', '22222222-2222-2222-2222-2222222227e1');
do $$
declare
  got text;
begin
  select string_agg(p.display_name || ':' || b.badge || b.level, ',' order by p.display_name, b.badge, b.level) into got
  from rider_badges b join profiles p on p.id = b.user_id where p.display_name in ('Ada', 'Bo', 'Cy', 'Dee', 'Ed');
  if got is distinct from 'Ada:crew_rider1,Bo:crew_rider1,Bo:trail_boss1,Dee:mile_eater1' then
    raise exception 'FAIL: wrong badges after the rides ended: %', got;
  end if;
  if (select miles from rider_ride_credits where user_id = '00000000-0000-0000-0000-0000000007e1') > 0 then
    raise exception 'FAIL: GPS spikes counted as miles';
  end if;
  if (select miles from rider_ride_credits where user_id = '00000000-0000-0000-0000-0000000007d1') not between 100 and 106 then
    raise exception 'FAIL: Dee''s miles wrong: %', (select miles from rider_ride_credits where user_id = '00000000-0000-0000-0000-0000000007d1');
  end if;
end $$;

-- B3. Cy's track arrives late (no signal on the trail): Tail Gunner and Crew Rider catch up.
insert into ride_tracks (ride_id, user_id, points) values
  ('22222222-2222-2222-2222-2222222227b1', '00000000-0000-0000-0000-0000000007c1', test_track(38.5, -109.502, 21, 0.0005, 10));
do $$ begin
  if (select string_agg(badge || level, ',' order by badge) from rider_badges where user_id = '00000000-0000-0000-0000-0000000007c1')
     is distinct from 'crew_rider1,tail_gunner1' then
    raise exception 'FAIL: late track did not earn Cy''s badges';
  end if;
  if (select riders_tracked from rider_ride_credits where user_id = '00000000-0000-0000-0000-0000000007a1') <> 3 then
    raise exception 'FAIL: riders_tracked not recounted after the late track';
  end if;
end $$;

-- B4. Nobody can write badges or credits by hand. privacy_test.sql grants every function to
-- everyone; take back the ones the migration keeps server-only, as in production.
revoke execute on function award_rider_badges(uuid), award_rider_badges(uuid, boolean), credit_ride(uuid, boolean),
  rider_badge_stats(uuid), rider_trail_stats(uuid), rider_track_miles(uuid, uuid), push_batch_account(jsonb) from public, anon, authenticated;
select as_user('00000000-0000-0000-0000-0000000007a1');
set role authenticated;
select expect_refused($q$insert into rider_badges (user_id, badge, level) values (auth.uid(), 'trail_boss', 3)$q$, 'typed in a badge');
select expect_refused($q$insert into rider_ride_credits (ride_id, user_id, led) values ('22222222-2222-2222-2222-2222222227b1', auth.uid(), true)$q$, 'typed in a ride credit');
select expect_refused($q$select award_rider_badges(auth.uid())$q$, 'called award_rider_badges directly');
select expect_refused($q$select credit_ride('22222222-2222-2222-2222-2222222227b1')$q$, 'called credit_ride directly');
do $$ begin
  begin update rider_badges set level = 3; exception when others then null; end;
  begin delete from rider_badges; exception when others then null; end;
end $$;
reset role;
do $$ begin
  if (select count(*) from rider_badges where user_id = '00000000-0000-0000-0000-0000000007a1') <> 1
     or exists (select 1 from rider_badges where level = 3) then
    raise exception 'FAIL: changed or deleted a badge by hand';
  end if;
end $$;

-- B5. Ada sees everyone's badges but only her own numbers, and her new badge until she marks it seen.
select as_user('00000000-0000-0000-0000-0000000007a1');
set role authenticated;
do $$
declare
  mine jsonb := my_badges();
begin
  if (select count(distinct user_id) from rider_badges) < 4 then raise exception 'FAIL: other riders'' badges not readable'; end if;
  if exists (select 1 from rider_ride_credits where user_id <> auth.uid()) then raise exception 'FAIL: saw another rider''s ride credits'; end if;
  if (mine -> 'stats' ->> 'crew_rider')::numeric <> 1 or (mine -> 'stats' ->> 'trail_boss')::numeric <> 0 then
    raise exception 'FAIL: my_badges stats wrong: %', mine;
  end if;
  if jsonb_array_length(mine -> 'badges') <> 1 or (mine -> 'badges' -> 0 ->> 'seen')::boolean then
    raise exception 'FAIL: my_badges list wrong: %', mine;
  end if;
  perform mark_badges_seen();
  if (my_badges() -> 'badges' -> 0 ->> 'seen')::boolean is not true then raise exception 'FAIL: mark_badges_seen'; end if;
end $$;
reset role;
-- Not for signed-out visitors.
select as_user(null);
set role anon;
select expect_refused($q$select my_badges()$q$, 'anon read my_badges');
reset role;

-- B6. Badge pushes: the text, the account switch, and the trial reminders unchanged.
do $$ begin
  if (select title from badge_push_text('trail_boss', 2, 1)) <> 'New Badge: Trail Boss Silver' then raise exception 'FAIL: badge push title'; end if;
  if (select title from badge_push_text('crew_rider', 1, 3)) <> 'You Earned 3 New Badges' then raise exception 'FAIL: multi badge push title'; end if;
  if (select count(*) from badge_levels()) <> 21 then raise exception 'FAIL: badge_levels'; end if;
end $$;
insert into push_tokens (user_id, token, platform) values ('00000000-0000-0000-0000-0000000007b1', 'tok-bo-badges-0000000000', 'ios') on conflict do nothing;
do $$ begin
  if (select count(*) from push_batch_account('{"type":"badge","user":"00000000-0000-0000-0000-0000000007b1","badge":"trail_boss","level":1,"count":1}')) <> 1 then
    raise exception 'FAIL: badge push not built';
  end if;
  if (select data ->> 'url' from push_batch_account('{"type":"badge","user":"00000000-0000-0000-0000-0000000007b1","badge":"trail_boss","level":1,"count":1}')) <> '/badges' then
    raise exception 'FAIL: badge push should open /badges';
  end if;
  if (select count(*) from push_batch_account('{"type":"trial","user":"00000000-0000-0000-0000-0000000007b1","stage":"3d"}')) <> 1 then
    raise exception 'FAIL: trial reminder push broke';
  end if;
  if (select count(*) from push_batch_account('{"type":"other","user":"00000000-0000-0000-0000-0000000007b1"}')) <> 0 then
    raise exception 'FAIL: unknown account event built a push';
  end if;
end $$;
insert into notification_settings (user_id, account_push) values ('00000000-0000-0000-0000-0000000007b1', false)
  on conflict (user_id) do update set account_push = false;
do $$ begin
  if (select count(*) from push_batch_account('{"type":"badge","user":"00000000-0000-0000-0000-0000000007b1","badge":"trail_boss","level":1,"count":1}')) <> 0 then
    raise exception 'FAIL: badge push ignored the account notifications switch';
  end if;
end $$;

-- B7. Ten led rides make Trail Boss Silver; a solo "led" ride never counts.
do $$
declare
  i int;
  r uuid;
begin
  for i in 1..10 loop
    r := gen_random_uuid();
    insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility, max_vehicles, status)
    values (r, '00000000-0000-0000-0000-0000000007d1', 'Dee ' || i, now() - interval '1 day', 38.5, -109.5, 'private', 6, 'live');
    insert into ride_tracks (ride_id, user_id, points) values (r, '00000000-0000-0000-0000-0000000007d1', test_track(38.5, -109.5, 21, 0.0005, 10));
    if i <= 9 then
      insert into ride_members (ride_id, user_id, status) values (r, '00000000-0000-0000-0000-0000000007a1', 'joined');
      insert into ride_tracks (ride_id, user_id, points) values (r, '00000000-0000-0000-0000-0000000007a1', test_track(38.5, -109.501, 21, 0.0005, 10));
    end if;
    update rides set status = 'ended' where id = r;
  end loop;
  if exists (select 1 from rider_badges where user_id = '00000000-0000-0000-0000-0000000007d1' and badge = 'trail_boss' and level = 2) then
    raise exception 'FAIL: a solo ride counted toward Trail Boss';
  end if;
  if not exists (select 1 from rider_badges where user_id = '00000000-0000-0000-0000-0000000007a1' and badge = 'crew_rider' and level = 2) then
    raise exception 'FAIL: Ada should have Crew Rider Silver after 10 group rides';
  end if;
  -- One more group ride for Dee: ten led.
  r := gen_random_uuid();
  insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility, max_vehicles, status)
  values (r, '00000000-0000-0000-0000-0000000007d1', 'Dee 11', now() - interval '1 day', 38.5, -109.5, 'private', 6, 'live');
  insert into ride_members (ride_id, user_id, status) values (r, '00000000-0000-0000-0000-0000000007b1', 'joined');
  insert into ride_tracks (ride_id, user_id, points) values
    (r, '00000000-0000-0000-0000-0000000007d1', test_track(38.5, -109.5, 21, 0.0005, 10)),
    (r, '00000000-0000-0000-0000-0000000007b1', test_track(38.5, -109.501, 21, 0.0005, 10));
  update rides set status = 'ended' where id = r;
  if not exists (select 1 from rider_badges where user_id = '00000000-0000-0000-0000-0000000007d1' and badge = 'trail_boss' and level = 2) then
    raise exception 'FAIL: ten led group rides should make Trail Boss Silver';
  end if;
end $$;

-- B8. Trail badges, when the offroad navigation tables are here (stand-ins if they aren't yet).
do $$
declare
  stand_in boolean := to_regclass('public.shared_trails') is null;
begin
  if not stand_in then
    raise notice 'shared_trails exists; trail badges are covered by the navigation tests';
    return;
  end if;
  create table shared_trails (id uuid primary key default gen_random_uuid(), owner_id uuid, status text, created_at timestamptz default now());
  create table trail_ratings (trail_id uuid, user_id uuid, score smallint, primary key (trail_id, user_id));
  insert into shared_trails (id, owner_id, status) values
    ('44444444-4444-4444-4444-4444444447a1', '00000000-0000-0000-0000-0000000007a1', 'public'),
    ('44444444-4444-4444-4444-4444444447a2', '00000000-0000-0000-0000-0000000007a1', 'hidden');
  insert into trail_ratings values
    ('44444444-4444-4444-4444-4444444447a1', '00000000-0000-0000-0000-0000000007b1', 5),
    ('44444444-4444-4444-4444-4444444447a1', '00000000-0000-0000-0000-0000000007c1', 4);
  perform award_rider_badges('00000000-0000-0000-0000-0000000007a1');
  if (select string_agg(badge, ',' order by badge) from rider_badges where user_id = '00000000-0000-0000-0000-0000000007a1' and badge in ('trailblazer', 'mapmaker'))
     is distinct from 'mapmaker,trailblazer' then
    raise exception 'FAIL: trail badges not earned';
  end if;
  if (select value from rider_badge_stats('00000000-0000-0000-0000-0000000007a1') where badge = 'trailblazer') <> 1 then
    raise exception 'FAIL: a hidden trail counted toward Trailblazer';
  end if;
  if (select value from rider_badge_stats('00000000-0000-0000-0000-0000000007b1') where badge = 'trail_scout') <> 1 then
    raise exception 'FAIL: Trail Scout count';
  end if;
  drop table trail_ratings;
  drop table shared_trails;
end $$;

-- B9. Deleting an account takes its badges with it.
delete from auth.users where id = '00000000-0000-0000-0000-0000000007e1';
delete from profiles where id = '00000000-0000-0000-0000-0000000007e1';
do $$ begin
  if exists (select 1 from rider_ride_credits where user_id = '00000000-0000-0000-0000-0000000007e1') then raise exception 'FAIL: credits outlived the account'; end if;
end $$;

select 'BADGES TESTS PASSED';
