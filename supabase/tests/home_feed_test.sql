-- Home feed (20261102300000_home_feed.sql): who sees whose activity. Runs after friends_test.sql
-- (run_local.sh): as_user and expect_refused come from privacy_test.sql.
--
-- Riders (all new here):
--   Amy  0dd1  the viewer
--   Bob  0dd2  Amy's friend
--   Cat  0dd3  Amy follows her (leader_follows), not friends
--   Dan  0dd4  a stranger to Amy
--   Eve  0dd5  Amy's friend, then blocked by Amy
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000dd1', '{"full_name":"Amy Feed"}'),
  ('00000000-0000-0000-0000-000000000dd2', '{"full_name":"Bob Feed"}'),
  ('00000000-0000-0000-0000-000000000dd3', '{"full_name":"Cat Feed"}'),
  ('00000000-0000-0000-0000-000000000dd4', '{"full_name":"Dan Feed"}'),
  ('00000000-0000-0000-0000-000000000dd5', '{"full_name":"Eve Feed"}');
insert into friendships (user_lo, user_hi, requested_by, status, accepted_at) values
  ('00000000-0000-0000-0000-000000000dd1', '00000000-0000-0000-0000-000000000dd2', '00000000-0000-0000-0000-000000000dd1', 'accepted', now()),
  ('00000000-0000-0000-0000-000000000dd1', '00000000-0000-0000-0000-000000000dd5', '00000000-0000-0000-0000-000000000dd1', 'accepted', now());
insert into leader_follows (follower_id, leader_id) values
  ('00000000-0000-0000-0000-000000000dd1', '00000000-0000-0000-0000-000000000dd3');
-- Everyone earned a badge this week; Dan's is old news too.
insert into rider_badges (user_id, badge, level, earned_at) values
  ('00000000-0000-0000-0000-000000000dd2', 'crew_rider', 1, now() - interval '1 day'),
  ('00000000-0000-0000-0000-000000000dd3', 'trail_boss', 1, now() - interval '2 days'),
  ('00000000-0000-0000-0000-000000000dd4', 'crew_rider', 1, now() - interval '1 day'),
  ('00000000-0000-0000-0000-000000000dd5', 'crew_rider', 1, now() - interval '1 day'),
  ('00000000-0000-0000-0000-000000000dd2', 'mile_eater', 1, now() - interval '60 days');
-- Bob finished a private ride Amy wasn't on, and a public one.
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility, max_vehicles, status, ended_at) values
  ('22222222-2222-2222-2222-222222220b01', '00000000-0000-0000-0000-000000000dd2', 'Bob Secret Spot', now() - interval '2 days', 38.5, -109.5, 'private', 6, 'ended', now() - interval '2 days'),
  ('22222222-2222-2222-2222-222222220b02', '00000000-0000-0000-0000-000000000dd2', 'Black Bear Pass', now() - interval '1 day', 38.5, -109.5, 'public', 6, 'ended', now() - interval '1 day');
insert into rider_ride_credits (ride_id, user_id, led, miles, riders_tracked) values
  ('22222222-2222-2222-2222-222222220b01', '00000000-0000-0000-0000-000000000dd2', true, 12.5, 3),
  ('22222222-2222-2222-2222-222222220b02', '00000000-0000-0000-0000-000000000dd2', true, 84, 7);

create function feed_for(p_viewer text) returns text[] language plpgsql as $$
declare v text[];
begin
  perform as_user(p_viewer::uuid);
  execute 'set local role authenticated';
  select coalesce(array_agg(f.kind || ':' || f.actor_name || ':' || coalesce(f.title, '-') order by f.kind, f.actor_name, f.title), '{}')
    into v from home_feed(30) f;
  execute 'reset role';
  return v;
end $$;

create function settings_as(p_user text, p_from text, p_kinds text[], p_share text) returns void language plpgsql as $$
begin
  perform as_user(p_user::uuid);
  execute 'set local role authenticated';
  perform set_feed_settings(p_from, p_kinds, p_share);
  execute 'reset role';
end $$;

-- H1. Defaults: friends and follows show; strangers and 30+ day old posts don't; Cat shares with
--     friends only by default, so Amy (a follower, not a friend) doesn't see her yet.
do $$
declare v text[] := feed_for('00000000-0000-0000-0000-000000000dd1');
begin
  if v <> array['badge:Bob Feed:-', 'badge:Eve Feed:-', 'ride:Bob Feed:Black Bear Pass', 'ride:Bob Feed:-'] then
    raise exception 'FAIL: default feed was %', v;
  end if;
end $$;

-- H2. Cat lets followers see her activity: now Amy sees Cat's badge.
select settings_as('00000000-0000-0000-0000-000000000dd3', 'groups', array['out', 'ride', 'badge', 'trail', 'group'], 'followers');
do $$ begin
  if not ('badge:Cat Feed:-' = any (feed_for('00000000-0000-0000-0000-000000000dd1'))) then raise exception 'FAIL: follower should see Cat'; end if;
end $$;

-- H3. Amy picks friends only: Cat drops out again. Then badges off: no badges at all.
select settings_as('00000000-0000-0000-0000-000000000dd1', 'friends', array['out', 'ride', 'badge', 'trail', 'group'], 'friends');
do $$ begin
  if 'badge:Cat Feed:-' = any (feed_for('00000000-0000-0000-0000-000000000dd1')) then raise exception 'FAIL: friends-only still showed Cat'; end if;
end $$;
select settings_as('00000000-0000-0000-0000-000000000dd1', 'follows', array['ride'], 'friends');
do $$ declare v text[] := feed_for('00000000-0000-0000-0000-000000000dd1');
begin
  if exists (select 1 from unnest(v) x where x like 'badge:%') then raise exception 'FAIL: badges switched off but shown: %', v; end if;
  if cardinality(v) <> 2 then raise exception 'FAIL: rides only should be 2 posts, got %', v; end if;
end $$;
select settings_as('00000000-0000-0000-0000-000000000dd1', 'groups', array['out', 'ride', 'badge', 'trail', 'group'], 'friends');

-- H4. Bob shares with nobody: Amy sees none of Bob's posts.
select settings_as('00000000-0000-0000-0000-000000000dd2', 'groups', array['out', 'ride', 'badge', 'trail', 'group'], 'nobody');
do $$ begin
  if exists (select 1 from unnest(feed_for('00000000-0000-0000-0000-000000000dd1')) x where x like '%Bob Feed%') then
    raise exception 'FAIL: Bob shares with nobody but showed up';
  end if;
end $$;

-- H5. Amy blocks Eve: Eve's posts stop, even though they're still friends on paper.
insert into blocked_riders (blocker_id, blocked_id) values ('00000000-0000-0000-0000-000000000dd1', '00000000-0000-0000-0000-000000000dd5');
do $$ begin
  if exists (select 1 from unnest(feed_for('00000000-0000-0000-0000-000000000dd1')) x where x like '%Eve Feed%') then
    raise exception 'FAIL: blocked rider in the feed';
  end if;
end $$;

-- H6. Settings are private and validated; signed-out callers get nothing.
select as_user('00000000-0000-0000-0000-000000000dd4');
set role authenticated;
do $$ begin
  if exists (select 1 from rider_feed_settings where user_id <> '00000000-0000-0000-0000-000000000dd4') then
    raise exception 'FAIL: read another rider''s feed settings';
  end if;
  if (select share_with from my_feed_settings()) <> 'friends' then raise exception 'FAIL: default share_with'; end if;
end $$;
select expect_refused($q$select set_feed_settings('everyone', array['ride'], 'friends')$q$, 'unknown show_from');
select expect_refused($q$select set_feed_settings('groups', array['location'], 'friends')$q$, 'unknown post kind');
select expect_refused($q$select set_feed_settings('groups', array['ride'], 'public')$q$, 'unknown share_with');
select expect_refused($q$insert into rider_feed_settings (user_id) values (auth.uid())$q$, 'direct settings write');
reset role;
select as_user(null);
set role authenticated;
select expect_refused($q$select * from home_feed(10)$q$, 'anonymous feed');
reset role;

-- H7. Trail obstacles: kept tidy, checked, and returned with the trail. Old builds that send no
--     obstacles still share.
insert into shared_trails (id, owner_id, client_id, name, difficulty, vehicles, route, length_m, obstacles)
values ('33333333-3333-3333-3333-333333330dd1', '00000000-0000-0000-0000-000000000dd2', 'tdd1', 'Ledge Loop', 'hard', array['built_4x4'],
        '{"type":"LineString","coordinates":[[-109.5,38.5],[-109.49,38.51]]}', 1500,
        '[{"lat":38.505,"lng":-109.495,"name":"  Waterfall Ledge ","kind":"obstacle","extra":"dropped"}]');
insert into shared_trails (id, owner_id, client_id, name, difficulty, vehicles, route, length_m)
values ('33333333-3333-3333-3333-333333330dd2', '00000000-0000-0000-0000-000000000dd2', 'tdd2', 'Old Build Trail', 'easy', array['atv'],
        '{"type":"LineString","coordinates":[[-109.5,38.5],[-109.49,38.51]]}', 1500);
do $$
declare j jsonb;
begin
  select trail_json(t, null) into j from shared_trails t where id = '33333333-3333-3333-3333-333333330dd1';
  if j -> 'obstacles' <> '[{"lat":38.505,"lng":-109.495,"name":"Waterfall Ledge","kind":"obstacle"}]'::jsonb then
    raise exception 'FAIL: obstacles came back as %', j -> 'obstacles';
  end if;
  select trail_json(t, null) into j from shared_trails t where id = '33333333-3333-3333-3333-333333330dd2';
  if j -> 'obstacles' <> '[]'::jsonb then raise exception 'FAIL: old-build trail obstacles %', j -> 'obstacles'; end if;
end $$;
select expect_refused($q$update shared_trails set obstacles = '[{"lat":38.5,"lng":-109.5,"name":""}]' where id = '33333333-3333-3333-3333-333333330dd1'$q$, 'empty obstacle name');
select expect_refused($q$update shared_trails set obstacles = '[{"lat":95,"lng":-109.5,"name":"X"}]' where id = '33333333-3333-3333-3333-333333330dd1'$q$, 'obstacle off the globe');
select expect_refused($q$update shared_trails set obstacles = '[{"lat":38.5,"lng":-109.5,"name":"X","kind":"party"}]' where id = '33333333-3333-3333-3333-333333330dd1'$q$, 'unknown obstacle kind');
select expect_refused($q$update shared_trails set obstacles = (select jsonb_agg(jsonb_build_object('lat', 38.5, 'lng', -109.5, 'name', 'O' || g)) from generate_series(1, 31) g) where id = '33333333-3333-3333-3333-333333330dd1'$q$, '31 obstacles');

-- H8. Bob shares with friends again: his trail shared this week shows in Amy's feed.
select settings_as('00000000-0000-0000-0000-000000000dd2', 'groups', array['out', 'ride', 'badge', 'trail', 'group'], 'friends');
do $$ begin
  if not ('trail:Bob Feed:Ledge Loop' = any (feed_for('00000000-0000-0000-0000-000000000dd1'))) then
    raise exception 'FAIL: shared trail missing from the feed: %', feed_for('00000000-0000-0000-0000-000000000dd1');
  end if;
end $$;

select 'ALL HOME FEED TESTS PASSED' as result;
