-- 4.0 Free and Pro plan (migration 20261122000000_pro_plan_4.sql): nothing changes until the
-- pro_plan_4 flag goes on; then new accounts need Pro to create a ride, accounts made before the
-- switch keep 1 a month until 2027-02-01, the seven new features are Pro, voting on polls is Free,
-- Free Map Mode is 5 hours; switching off puts it back. Runs after admin_test_rides_test.sql
-- (run_local.sh), which leaves as_user and expect_error in place. Each block raises an exception if
-- a rule is broken.

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000f41', 'p4old@example.test', '{"full_name":"Olive Old"}'),
  ('00000000-0000-0000-0000-000000000f42', 'p4new@example.test', '{"full_name":"Ned New"}'),
  ('00000000-0000-0000-0000-000000000f43', 'p4pro@example.test', '{"full_name":"Paula Pro"}');
delete from entitlement_grants where user_id in
  ('00000000-0000-0000-0000-000000000f41', '00000000-0000-0000-0000-000000000f42', '00000000-0000-0000-0000-000000000f43');
insert into entitlement_grants (user_id, source, ends_at) values ('00000000-0000-0000-0000-000000000f43', 'comp', null);
update feature_plans set free_monthly_allowance = 8 where feature = 'map_mode';
update feature_plans set min_plan = 'free', free_monthly_allowance = 1 where feature = 'create_ride';
update feature_plans set min_plan = 'pro' where feature = 'vote_polls';
update profiles set created_at = now() - interval '30 days' where id = '00000000-0000-0000-0000-000000000f41';

-- P1. Switch off (as shipped): new rows are Free, the ride allowance is 1 for everyone.
do $$ begin
  if pro_plan_4_on() then raise exception 'FAIL: plan on before the switch'; end if;
  if exists (select 1 from feature_plans where feature in ('places', 'terrain_3d', 'garage', 'trip_planner', 'starlink', 'event_cohost', 'leaderboard_filters') and min_plan <> 'free') then
    raise exception 'FAIL: a new feature is Pro before the switch';
  end if;
  if (select count(*) from feature_plans where feature in ('places', 'terrain_3d', 'garage', 'trip_planner', 'starlink', 'event_cohost', 'leaderboard_filters')) <> 7 then
    raise exception 'FAIL: new feature rows missing';
  end if;
  if ride_allowance('00000000-0000-0000-0000-000000000f42') <> 1 then raise exception 'FAIL: off allowance %', ride_allowance('00000000-0000-0000-0000-000000000f42'); end if;
end $$;
select as_user('00000000-0000-0000-0000-000000000f42');
set role authenticated;
do $$ declare r jsonb := my_pro_plan_4(); begin
  if (r ->> 'on')::boolean or r ->> 'grace_until' is not null then raise exception 'FAIL: my_pro_plan_4 off %', r; end if;
end $$;
reset role;

-- P2. The owner switches it on (another flag in the same setting is kept as it was).
insert into app_settings (key, value) values ('flags', '{"pro_plan_4": true}'::jsonb)
on conflict (key) do update set value = app_settings.value || '{"pro_plan_4": true}'::jsonb;
-- Ned's account is newer than the switch; Olive's is older.
update app_settings set value = jsonb_set(value, '{started_at}', to_jsonb(now() - interval '1 hour')) where key = 'pro_plan_4_start';
do $$ begin
  if not pro_plan_4_on() then raise exception 'FAIL: switch not read'; end if;
  if exists (select 1 from feature_plans where feature in ('places', 'terrain_3d', 'garage', 'trip_planner', 'starlink', 'event_cohost', 'leaderboard_filters') and min_plan <> 'pro') then
    raise exception 'FAIL: a new feature is still Free';
  end if;
  if (select min_plan from feature_plans where feature = 'vote_polls') <> 'free' then raise exception 'FAIL: voting still Pro'; end if;
  if (select free_monthly_allowance from feature_plans where feature = 'map_mode') <> 5 then raise exception 'FAIL: Map Mode hours not 5'; end if;
  if pro_plan_4_grace_until() <> '2027-02-02T08:00:00Z'::timestamptz then raise exception 'FAIL: grace end %', pro_plan_4_grace_until(); end if;
end $$;

-- P3. Ned (new, Free) can't create a ride; his entitlements say 0 and the new features are off.
select as_user('00000000-0000-0000-0000-000000000f42');
set role authenticated;
select expect_error($q$insert into rides (organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility)
  values (auth.uid(), 'Ned ride', now() + interval '1 day', 38.5, -109.5, 'public')$q$, '%ride_limit:0/0%', 'new Free rider creates a ride');
do $$ declare e jsonb := my_entitlements(); r jsonb := my_pro_plan_4(); m jsonb := my_map_mode_time(); begin
  if (e ->> 'ride_allowance')::int <> 0 then raise exception 'FAIL: new allowance %', e ->> 'ride_allowance'; end if;
  if (e -> 'features' ->> 'places')::boolean or (e -> 'features' ->> 'garage')::boolean or (e -> 'features' ->> 'leaderboard_filters')::boolean then
    raise exception 'FAIL: Free has a 4.0 Pro feature %', e -> 'features';
  end if;
  if not (e -> 'features' ->> 'vote_polls')::boolean then raise exception 'FAIL: Free cannot vote'; end if;
  if (m ->> 'allowance_seconds')::int <> 5 * 3600 then raise exception 'FAIL: map hours %', m; end if;
  if not (r ->> 'on')::boolean or r ->> 'grace_until' is not null then raise exception 'FAIL: Ned has grace %', r; end if;
end $$;
reset role;

-- P4. Olive (older account) keeps one ride a month until Feb 1, 2027.
select as_user('00000000-0000-0000-0000-000000000f41');
set role authenticated;
do $$ declare r jsonb := my_pro_plan_4(); begin
  if ((r ->> 'grace_until')::timestamptz) <> '2027-02-02T08:00:00Z'::timestamptz then raise exception 'FAIL: Olive grace %', r; end if;
  if (my_entitlements() ->> 'ride_allowance')::int <> 1 then raise exception 'FAIL: Olive allowance'; end if;
end $$;
insert into rides (organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility)
values (auth.uid(), 'Olive ride', now() + interval '1 day', 38.5, -109.5, 'public');
select expect_error($q$insert into rides (organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility)
  values (auth.uid(), 'Olive ride 2', now() + interval '1 day', 38.5, -109.5, 'public')$q$, '%ride_limit:1/1%', 'second ride this month');
reset role;
-- After Feb 1 the grace is over (moved into the past here).
update app_settings set value = jsonb_set(value, '{grace_until}', to_jsonb(now() - interval '1 minute')) where key = 'pro_plan_4_start';
do $$ begin
  if ride_allowance('00000000-0000-0000-0000-000000000f41') <> 0 then raise exception 'FAIL: grace did not end'; end if;
end $$;
update app_settings set value = jsonb_set(value, '{grace_until}', '"2027-02-02T08:00:00Z"') where key = 'pro_plan_4_start';

-- P5. Pro is unlimited.
do $$ begin
  if ride_allowance('00000000-0000-0000-0000-000000000f43') is not null then raise exception 'FAIL: Pro limited'; end if;
end $$;

-- P6. Switching off puts the plan back; switching on again keeps the first start time.
do $$ declare s timestamptz := pro_plan_4_start(); begin
  update app_settings set value = value || '{"pro_plan_4": false}'::jsonb where key = 'flags';
  if exists (select 1 from feature_plans where feature in ('places', 'garage') and min_plan <> 'free') then raise exception 'FAIL: off left Pro'; end if;
  if (select min_plan from feature_plans where feature = 'vote_polls') <> 'pro' then raise exception 'FAIL: voting not back'; end if;
  if (select free_monthly_allowance from feature_plans where feature = 'map_mode') <> 8 then raise exception 'FAIL: hours not back'; end if;
  if ride_allowance('00000000-0000-0000-0000-000000000f42') <> 1 then raise exception 'FAIL: off allowance'; end if;
  update app_settings set value = value || '{"pro_plan_4": true}'::jsonb where key = 'flags';
  if pro_plan_4_start() <> s then raise exception 'FAIL: start moved'; end if;
  -- Leave it off for any later test file.
  update app_settings set value = value || '{"pro_plan_4": false}'::jsonb where key = 'flags';
end $$;

-- P7. Admin can move the new features.
insert into admin_users (user_id) values ('00000000-0000-0000-0000-000000000f43') on conflict do nothing;
select as_session('00000000-0000-0000-0000-000000000f43', 'aal2');
set role authenticated;
select admin_set_feature_plan('starlink', 'pro', null);
reset role;
do $$ begin
  if (select min_plan from feature_plans where feature = 'starlink') <> 'pro' then raise exception 'FAIL: admin move'; end if;
end $$;
update feature_plans set min_plan = 'free' where feature = 'starlink';
select as_user(null);
