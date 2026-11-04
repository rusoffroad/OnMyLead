-- 2.0 Free and Pro tiers (migration 20261104000000_pro_tiers.sql): the new Pro features are
-- reported by my_entitlements, Map Mode time counts per UTC month with a Free allowance in hours,
-- a burst of calls can't add more than real time, Pro is unlimited, and Admin can move every new
-- feature. Runs after account_sync_test.sql (run_local.sh), which leaves as_user and expect_error
-- in place. Each block raises an exception if a rule is broken.

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000d81', 'tierfree@example.test', '{"full_name":"Tia Free"}'),
  ('00000000-0000-0000-0000-000000000d82', 'tierpro@example.test', '{"full_name":"Pete Pro"}');
-- Tia is Free (no trial); Pete has complimentary Pro.
delete from entitlement_grants where user_id in ('00000000-0000-0000-0000-000000000d81', '00000000-0000-0000-0000-000000000d82');
insert into entitlement_grants (user_id, source, ends_at) values ('00000000-0000-0000-0000-000000000d82', 'comp', null);

select as_user(null);
set role anon;
select expect_error($q$select my_map_mode_time()$q$, '%not signed in%', 'anon reads map time');
reset role;

select as_user('00000000-0000-0000-0000-000000000d81');
set role authenticated;
do $$
declare e jsonb := my_entitlements(); r jsonb;
begin
  if (e -> 'features' ->> 'route_builder')::boolean or (e -> 'features' ->> 'tablet_web')::boolean
     or (e -> 'features' ->> 'directions')::boolean or (e -> 'features' ->> 'themes')::boolean then
    raise exception 'FAIL: Free has a new Pro feature %', e -> 'features';
  end if;
  if not (e -> 'features' ->> 'map_mode')::boolean then raise exception 'FAIL: Free Map Mode off'; end if;
  r := my_map_mode_time();
  if (r ->> 'used_seconds')::int <> 0 or (r ->> 'allowance_seconds')::int <> 8 * 3600 then raise exception 'FAIL: start %', r; end if;
  -- First report counts (capped at 2 minutes), then a burst right after adds only real time.
  r := log_map_mode_time(60);
  if (r ->> 'used_seconds')::int <> 60 then raise exception 'FAIL: first report %', r; end if;
  r := log_map_mode_time(120);
  if (r ->> 'used_seconds')::int > 66 then raise exception 'FAIL: burst added more than real time %', r; end if;
  r := log_map_mode_time(-50);
  if (r ->> 'used_seconds')::int > 66 then raise exception 'FAIL: negative time %', r; end if;
end $$;
-- The table is only reachable through the functions.
do $$ begin
  if exists (select 1 from map_mode_usage) then raise exception 'FAIL: read raw usage'; end if;
end $$;
reset role;

-- A long gap lets a full report count; last month's time doesn't count this month.
update map_mode_usage set updated_at = now() - interval '10 minutes' where user_id = '00000000-0000-0000-0000-000000000d81';
insert into map_mode_usage (user_id, month, seconds) values
  ('00000000-0000-0000-0000-000000000d81', (date_trunc('month', now() at time zone 'utc') - interval '1 month')::date, 99999);
select as_user('00000000-0000-0000-0000-000000000d81');
set role authenticated;
do $$
declare before int := (my_map_mode_time() ->> 'used_seconds')::int; r jsonb;
begin
  r := log_map_mode_time(300);
  if (r ->> 'used_seconds')::int <> before + 120 then raise exception 'FAIL: capped report % (before %)', r, before; end if;
end $$;
reset role;

-- Pro: unlimited, and every feature on.
select as_user('00000000-0000-0000-0000-000000000d82');
set role authenticated;
do $$
declare e jsonb := my_entitlements(); r jsonb := my_map_mode_time();
begin
  if r ->> 'allowance_seconds' is not null then raise exception 'FAIL: Pro has a Map Mode limit %', r; end if;
  if not (e -> 'features' ->> 'route_builder')::boolean or not (e -> 'features' ->> 'tablet_web')::boolean then
    raise exception 'FAIL: Pro missing a feature %', e -> 'features';
  end if;
end $$;
reset role;

-- Admin moves Directions to Free and gives Free 12 Map Mode hours.
insert into admin_users (user_id) values ('00000000-0000-0000-0000-000000000d82') on conflict do nothing;
select as_session('00000000-0000-0000-0000-000000000d82', 'aal2');
set role authenticated;
select admin_set_feature_plan('directions', 'free', null);
select admin_set_feature_plan('map_mode', 'free', 12);
select expect_error($q$select admin_set_feature_plan('ride_mode', 'pro', null)$q$, '%cannot be configured%', 'safety feature to Pro');
reset role;
select as_user('00000000-0000-0000-0000-000000000d81');
set role authenticated;
do $$ begin
  if not (my_entitlements() -> 'features' ->> 'directions')::boolean then raise exception 'FAIL: directions still Pro'; end if;
  if (my_map_mode_time() ->> 'allowance_seconds')::int <> 12 * 3600 then raise exception 'FAIL: allowance not changed'; end if;
end $$;
reset role;
-- Put them back for any later test.
update feature_plans set min_plan = 'pro' where feature = 'directions';
update feature_plans set free_monthly_allowance = 8 where feature = 'map_mode';
select 'ALL PRO TIER TESTS PASSED';
