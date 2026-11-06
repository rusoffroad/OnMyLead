-- 2.1 Pro features and the launch trial (migration 20261105090000_pro_bluetooth_dot_photos.sql):
-- Bluetooth Sharing, customizing Your Dot, group photos and CarPlay are reported as Pro, Admin can
-- move them, and start_pro_launch_trials gives every rider without Pro a fresh trial, once, without
-- touching paid, complimentary or Admin accounts. Runs after pro_tiers_test.sql (Tia is Free, Pete
-- has complimentary Pro and is an Admin). Each block raises an exception if a rule is broken.

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000e81', 'oldtrial@example.test', '{"full_name":"Olga Oldtrial"}'),
  ('00000000-0000-0000-0000-000000000e82', 'ontrial@example.test', '{"full_name":"Tom Ontrial"}'),
  ('00000000-0000-0000-0000-000000000e83', 'revoked@example.test', '{"full_name":"Rae Revoked"}');
delete from entitlement_grants where user_id in ('00000000-0000-0000-0000-000000000e81', '00000000-0000-0000-0000-000000000e82',
  '00000000-0000-0000-0000-000000000e83', '00000000-0000-0000-0000-000000000d81');
-- Olga's trial ended last month (and her reminders went out); Tom has 5 days left; Rae's was revoked.
insert into entitlement_grants (id, user_id, source, starts_at, ends_at) values
  ('00000000-0000-0000-0000-0000000e8101', '00000000-0000-0000-0000-000000000e81', 'trial', now() - interval '60 days', now() - interval '30 days'),
  ('00000000-0000-0000-0000-0000000e8201', '00000000-0000-0000-0000-000000000e82', 'trial', now() - interval '25 days', now() + interval '5 days');
insert into entitlement_grants (user_id, source, starts_at, ends_at, revoked_at) values
  ('00000000-0000-0000-0000-000000000e83', 'trial', now() - interval '10 days', now() + interval '20 days', now() - interval '1 day');
insert into trial_notices (grant_id, stage) values ('00000000-0000-0000-0000-0000000e8101', '7d'), ('00000000-0000-0000-0000-0000000e8101', 'ended');
delete from app_settings where key = 'launch_trial';

-- Free: every new feature is reported, and off.
select as_user('00000000-0000-0000-0000-000000000d81');
set role authenticated;
do $$
declare e jsonb := my_entitlements(); k text;
begin
  foreach k in array array['bluetooth_sharing', 'custom_dot', 'group_photos', 'carplay'] loop
    if not (e -> 'features') ? k then raise exception 'FAIL: % not reported %', k, e -> 'features'; end if;
    if (e -> 'features' ->> k)::boolean then raise exception 'FAIL: Free has %', k; end if;
  end loop;
end $$;
-- Riders can't hand out trials.
select expect_error($q$select start_pro_launch_trials(30)$q$, '%', 'rider starts launch trials');
reset role;

-- Pro: all on.
select as_user('00000000-0000-0000-0000-000000000d82');
set role authenticated;
do $$
declare e jsonb := my_entitlements(); k text;
begin
  foreach k in array array['bluetooth_sharing', 'custom_dot', 'group_photos', 'carplay'] loop
    if not (e -> 'features' ->> k)::boolean then raise exception 'FAIL: Pro missing %', k; end if;
  end loop;
end $$;
reset role;

-- A Free owner can't add a group photo straight through the API (20261106010000); taking one down stays free.
-- As in production, riders can't call pro_required itself (privacy_test grants every function
-- for the suite): the photo guard has to go through require_my_feature.
revoke execute on function pro_required(uuid, text) from anon, authenticated;
alter table riding_groups disable trigger riding_groups_pro;
insert into riding_groups (id, owner_id, name, invite_code)
values ('d81d81d8-1d81-4d81-8d81-d81d81d81d81', '00000000-0000-0000-0000-000000000d81', 'Tia Crew', 'TIACREW001');
alter table riding_groups enable trigger riding_groups_pro;
select as_user('00000000-0000-0000-0000-000000000d81');
set role authenticated;
select expect_error($q$update riding_groups set photo_path = '00000000-0000-0000-0000-000000000d81/d81d81d8-1d81-4d81-8d81-d81d81d81d81-a-1.jpg' where id = 'd81d81d8-1d81-4d81-8d81-d81d81d81d81'$q$, 'pro_required:group_photos%', 'Free owner sets a group photo');
update riding_groups set photo_path = null where id = 'd81d81d8-1d81-4d81-8d81-d81d81d81d81';
reset role;
alter table riding_groups disable trigger riding_groups_pro;
select as_user('00000000-0000-0000-0000-000000000d81');
set role authenticated;
select expect_error($q$insert into riding_groups (owner_id, name, invite_code, photo_path) values ('00000000-0000-0000-0000-000000000d81', 'Sneaky', 'SNEAKY0001', '00000000-0000-0000-0000-000000000d81/x-1.jpg')$q$, 'pro_required:group_photos%', 'Free owner makes a group with a photo');
reset role;
alter table riding_groups enable trigger riding_groups_pro;
delete from riding_groups where id = 'd81d81d8-1d81-4d81-8d81-d81d81d81d81';

-- Admin moves CarPlay to Free (the way back if Apple objects), then it's put back.
select as_session('00000000-0000-0000-0000-000000000d82', 'aal2');
set role authenticated;
select admin_set_feature_plan('carplay', 'free', null);
reset role;
select as_user('00000000-0000-0000-0000-000000000d81');
set role authenticated;
do $$ begin
  if not (my_entitlements() -> 'features' ->> 'carplay')::boolean then raise exception 'FAIL: carplay still Pro'; end if;
end $$;
reset role;
update feature_plans set min_plan = 'pro' where feature = 'carplay';

-- The launch trial, run by the owner. Rolled back afterwards so later tests see the riders as before.
reset role;
begin;
select as_user(null);
do $$
declare
  n int;
  before_comp int := (select count(*) from entitlement_grants where user_id = '00000000-0000-0000-0000-000000000d82');
  g entitlement_grants;
begin
  n := start_pro_launch_trials(30);
  if n < 3 then raise exception 'FAIL: only % riders got the launch trial', n; end if;
  -- Tia had no trial: she has one ending in 30 days.
  select * into g from entitlement_grants where user_id = '00000000-0000-0000-0000-000000000d81' and source = 'trial';
  if g.id is null or g.ends_at < now() + interval '29 days' or g.ends_at > now() + interval '31 days' then raise exception 'FAIL: Tia %', g; end if;
  -- Olga's ended trial runs again, and her reminders will come again.
  select * into g from entitlement_grants where id = '00000000-0000-0000-0000-0000000e8101';
  if g.ends_at < now() + interval '29 days' then raise exception 'FAIL: Olga not extended %', g; end if;
  if exists (select 1 from trial_notices where grant_id = g.id) then raise exception 'FAIL: Olga reminders kept'; end if;
  -- Tom's 5 days become 30.
  select * into g from entitlement_grants where id = '00000000-0000-0000-0000-0000000e8201';
  if g.ends_at < now() + interval '29 days' then raise exception 'FAIL: Tom not extended %', g; end if;
  -- Rae's revoked trial stays revoked, and she gets no second one.
  if (select count(*) from entitlement_grants where user_id = '00000000-0000-0000-0000-000000000e83') <> 1
     or exists (select 1 from entitlement_grants where user_id = '00000000-0000-0000-0000-000000000e83' and revoked_at is null) then
    raise exception 'FAIL: Rae';
  end if;
  -- Pete (complimentary Pro, Admin) is untouched.
  if (select count(*) from entitlement_grants where user_id = '00000000-0000-0000-0000-000000000d82') <> before_comp then raise exception 'FAIL: Pete got a trial'; end if;
  -- Runs once.
  if start_pro_launch_trials(30) <> 0 then raise exception 'FAIL: ran twice'; end if;
  if setting('launch_trial') ->> 'days' <> '30' then raise exception 'FAIL: not recorded %', setting('launch_trial'); end if;
end $$;

-- Tia now sees Pro Trial with every feature on.
select as_user('00000000-0000-0000-0000-000000000d81');
set role authenticated;
do $$
declare e jsonb := my_entitlements();
begin
  if e ->> 'pro_source' <> 'trial' or not (e -> 'features' ->> 'bluetooth_sharing')::boolean then raise exception 'FAIL: Tia not on trial %', e; end if;
end $$;
reset role;

rollback;
select 'ALL 2.1 PRO TESTS PASSED';
