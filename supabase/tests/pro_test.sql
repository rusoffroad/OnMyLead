-- OnMyLead Pro: trials, the Free ride allowance, Pro-only actions, admin rights and trial
-- reminders. Runs after privacy_test.sql and groups_test.sql (run_local.sh), which set up
-- as_user, expect_refused and the pg_net / Vault stand-ins (net.calls).
-- Each block raises an exception if a rule is broken.

create function expect_error(p_sql text, p_like text, p_fail text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm not like p_like then raise exception 'FAIL: % (got "%")', p_fail, sqlerrm; end if;
    return;
  end;
  raise exception 'FAIL: %', p_fail;
end;
$$;
create function set_aal(p text) returns void language sql as $$
  select set_config('request.jwt.claims', case when p is null then '' else jsonb_build_object('aal', p)::text end, false);
$$;
create function new_ride_sql(p_id text) returns text language sql as $$
  select format($q$insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng)
                   values (%L, auth.uid(), 'Test ride', now() + interval '1 day', 38.5, -109.5)$q$, p_id);
$$;

-- People: Tara signs up with trials on, Fred is an existing account without a trial (made
-- with trials off), Ada is the admin.
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000001a1', '{"full_name":"Tara Trial"}');
update app_settings set value = 'false' where key = 'auto_trial';
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000001b1', '{"full_name":"Fred Free"}'),
  ('00000000-0000-0000-0000-0000000001c1', '{"full_name":"Ada Admin"}');
update app_settings set value = 'true' where key = 'auto_trial';
insert into admin_users (user_id, note) values ('00000000-0000-0000-0000-0000000001c1', 'test');

-- 1. A new signup gets 30 days of Pro, once, with no purchase.
do $$
declare
  g entitlement_grants;
begin
  select * into g from entitlement_grants where user_id = '00000000-0000-0000-0000-0000000001a1';
  if g.source is distinct from 'trial' or abs(extract(epoch from g.ends_at - (now() + interval '30 days'))) > 60 then
    raise exception 'FAIL: new signup did not get a 30-day trial';
  end if;
  if exists (select 1 from entitlement_grants where user_id = '00000000-0000-0000-0000-0000000001b1') then
    raise exception 'FAIL: signup got a trial while trials were off';
  end if;
  if not has_pro('00000000-0000-0000-0000-0000000001a1') or has_pro('00000000-0000-0000-0000-0000000001b1') then
    raise exception 'FAIL: has_pro wrong for trial/free';
  end if;
  begin
    insert into entitlement_grants (user_id, source, ends_at) values ('00000000-0000-0000-0000-0000000001a1', 'trial', now() + interval '1 day');
    raise exception 'FAIL: a second trial was allowed';
  exception when unique_violation then null;
  end;
end $$;

-- 2. Changing the trial length later leaves existing trials alone.
update app_settings set value = '14' where key = 'trial_days';
insert into auth.users (id, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000001d1', '{"full_name":"Dan Later"}');
do $$ begin
  if (select ends_at from entitlement_grants where user_id = '00000000-0000-0000-0000-0000000001a1' and source = 'trial') < now() + interval '29 days' then
    raise exception 'FAIL: settings change shortened an existing trial';
  end if;
  if abs(extract(epoch from (select ends_at from entitlement_grants where user_id = '00000000-0000-0000-0000-0000000001d1') - (now() + interval '14 days'))) > 60 then
    raise exception 'FAIL: new trial length not used for a later signup';
  end if;
end $$;
update app_settings set value = '30' where key = 'trial_days';

-- 3. What the app sees, and that riders can't read each other's plans.
select as_user('00000000-0000-0000-0000-0000000001a1');
set role authenticated;
do $$
declare
  e jsonb := my_entitlements();
begin
  if e ->> 'account_type' <> 'pro' or e ->> 'pro_source' <> 'trial' or e -> 'ride_allowance' <> 'null'::jsonb
     or (e -> 'features' ->> 'import_gpx')::boolean is not true or e -> 'history_limit' <> 'null'::jsonb then
    raise exception 'FAIL: trial entitlements wrong: %', e;
  end if;
  if (select count(*) from entitlement_grants) <> 1 then raise exception 'FAIL: rider saw other riders'' grants'; end if;
end $$;
select expect_refused($q$insert into entitlement_grants (user_id, source, ends_at) values (auth.uid(), 'comp', null)$q$, 'rider granted themself Pro');
select expect_refused($q$insert into admin_users (user_id) values (auth.uid())$q$, 'rider made themself admin');
update app_settings set value = '999' where key = 'trial_days';
do $$ begin
  if setting('trial_days')::text <> '30' then raise exception 'FAIL: rider changed a setting'; end if;
end $$;
select expect_refused($q$insert into app_store_subscriptions (original_transaction_id, user_id, product_id, status, environment) values ('x', auth.uid(), 'p', 'active', 'Production')$q$, 'rider wrote their own subscription');
select expect_refused($q$select trial_reminder_batch()$q$, 'rider ran the reminder batch');
-- A trial rider creates as many rides as they like.
select new_ride_sql('30000000-0000-0000-0000-000000000001') \gexec
select new_ride_sql('30000000-0000-0000-0000-000000000002') \gexec
reset role;

-- 4. Free: one ride per UTC month, counted at creation; deleting does not give it back.
select as_user('00000000-0000-0000-0000-0000000001b1');
set role authenticated;
do $$
declare
  e jsonb := my_entitlements();
begin
  if e ->> 'account_type' <> 'free' or (e ->> 'ride_allowance')::int <> 1 or (e ->> 'rides_created_this_month')::int <> 0
     or (e ->> 'history_limit')::int <> 5 or (e -> 'features' ->> 'offline_maps')::boolean is not false
     or (e -> 'features' ->> 'create_ride')::boolean is not true then
    raise exception 'FAIL: free entitlements wrong: %', e;
  end if;
end $$;
select new_ride_sql('31000000-0000-0000-0000-000000000001') \gexec
select expect_error(new_ride_sql('31000000-0000-0000-0000-000000000002'), 'ride_limit:1/1', 'free rider created a second ride this month');
select delete_ride('31000000-0000-0000-0000-000000000001');
select expect_error(new_ride_sql('31000000-0000-0000-0000-000000000003'), 'ride_limit:1/1', 'deleting a ride gave the allowance back');
do $$ begin
  if (my_entitlements() ->> 'rides_created_this_month')::int <> 1 then raise exception 'FAIL: monthly count wrong'; end if;
end $$;
reset role;
-- Next month (the ledger entry moves to last month): the allowance is back.
update ride_creations set created_at = utc_month_start() - interval '1 second' where user_id = '00000000-0000-0000-0000-0000000001b1';
select as_user('00000000-0000-0000-0000-0000000001b1');
set role authenticated;
select new_ride_sql('31000000-0000-0000-0000-000000000004') \gexec
-- Joining other rides stays unlimited.
select join_ride(p_ride := '30000000-0000-0000-0000-000000000001');
select join_ride(p_ride := '30000000-0000-0000-0000-000000000002');
reset role;
do $$ begin
  if utc_month_start('2026-03-01 00:30:00+02') <> '2026-02-01 00:00:00+00' then
    raise exception 'FAIL: months are not UTC';
  end if;
end $$;

-- 5. Free: Pro-only actions are refused with pro_required; voting and group links are free.
select as_user('00000000-0000-0000-0000-0000000001b1');
set role authenticated;
select expect_error($q$insert into ride_messages (ride_id, user_id, kind, body, poll_options)
  values ('31000000-0000-0000-0000-000000000004', auth.uid(), 'chat', 'Lunch?', array['Tacos', 'Burgers'])$q$,
  'pro_required:create_poll', 'free rider created a poll');
insert into ride_messages (ride_id, user_id, kind, body) values ('31000000-0000-0000-0000-000000000004', auth.uid(), 'chat', 'Plain chat still works');
select expect_error($q$insert into riding_groups (owner_id, name) values (auth.uid(), 'Crew')$q$, 'pro_required:saved_groups', 'free rider made a group');
select expect_error($q$insert into ride_private_details (ride_id, meet_lat, meet_lng, route_geojson)
  values ('31000000-0000-0000-0000-000000000004', 38.5, -109.5, '{"type":"Feature","properties":{"source":"gpx"}}')$q$,
  'pro_required:import_gpx', 'free rider saved an imported GPX route');
insert into ride_private_details (ride_id, meet_lat, meet_lng, route_geojson)
  values ('31000000-0000-0000-0000-000000000004', 38.5, -109.5, '{"type":"Feature","properties":{"source":"drawn"}}');
reset role;
-- Tara (trial) polls, and makes a group that Fred joins by its link.
select as_user('00000000-0000-0000-0000-0000000001a1');
set role authenticated;
insert into ride_messages (id, ride_id, user_id, kind, body, poll_options)
  values ('f1000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', auth.uid(), 'chat', 'Pace?', array['Faster', 'Fine']);
insert into riding_groups (id, owner_id, name, invite_code) values ('a1000000-0000-0000-0000-000000000001', auth.uid(), 'Tara''s Crew', 'TARACREW01');
reset role;
select as_user('00000000-0000-0000-0000-0000000001b1');
set role authenticated;
select vote_on_poll('f1000000-0000-0000-0000-000000000001', 1);
select join_group('TARACREW01');
reset role;

-- Dan rides with Tara, so only Pro stands between him and her group.
select as_user('00000000-0000-0000-0000-0000000001d1');
set role authenticated;
select join_ride(p_ride := '30000000-0000-0000-0000-000000000002');
reset role;

-- 6. Trial ends: Pro actions stop, nothing already made goes away, existing GPX stays editable.
update entitlement_grants set starts_at = now() - interval '31 days', ends_at = now() - interval '1 minute'
where user_id = '00000000-0000-0000-0000-0000000001a1' and source = 'trial';
update ride_private_details set route_geojson = '{"type":"Feature","properties":{"source":"gpx"}}'
where ride_id = '30000000-0000-0000-0000-000000000001';
select as_user('00000000-0000-0000-0000-0000000001a1');
set role authenticated;
do $$ begin
  if my_entitlements() ->> 'account_type' <> 'free' or has_pro(auth.uid()) then raise exception 'FAIL: expired trial still Pro'; end if;
  if (select count(*) from riding_groups where id = 'a1000000-0000-0000-0000-000000000001') <> 1
     or (select count(*) from ride_messages where id = 'f1000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'FAIL: expired trial lost a group or poll';
  end if;
end $$;
update ride_private_details set route_geojson = '{"type":"Feature","properties":{"source":"gpx","name":"edited"}}'
where ride_id = '30000000-0000-0000-0000-000000000001';
select expect_error($q$select add_group_members('a1000000-0000-0000-0000-000000000001', array['00000000-0000-0000-0000-0000000001d1'::uuid])$q$,
  'pro_required:saved_groups', 'expired trial added riders to a group');
select expect_error($q$insert into ride_messages (ride_id, user_id, kind, body, poll_options)
  values ('30000000-0000-0000-0000-000000000001', auth.uid(), 'chat', 'Again?', array['Yes', 'No'])$q$,
  'pro_required:create_poll', 'expired trial created a poll');
-- Safety stays free after the trial.
insert into rider_statuses (ride_id, user_id, status) values ('30000000-0000-0000-0000-000000000001', auth.uid(), 'mechanical');
reset role;

-- 7. Admin: only with a second factor; every change is logged; Pro without paying.
select as_user('00000000-0000-0000-0000-0000000001b1');
select set_aal('aal2');
set role authenticated;
select expect_error($q$select admin_extend_trial(auth.uid(), 30)$q$, 'admin only', 'non-admin extended a trial');
select expect_error($q$select admin_grant_comp(auth.uid(), null)$q$, 'admin only', 'non-admin granted Pro');
reset role;
select as_user('00000000-0000-0000-0000-0000000001c1');
select set_aal('aal1');
set role authenticated;
do $$ begin
  if my_entitlements() ->> 'account_type' <> 'admin' or not has_pro(auth.uid()) then raise exception 'FAIL: admin is not Pro'; end if;
  if exists (select 1 from entitlement_grants where user_id = auth.uid()) then raise exception 'FAIL: admin needed a grant'; end if;
end $$;
select expect_error($q$select admin_set_setting('trial_days', '45')$q$, 'admin needs two-factor%', 'admin changed settings without MFA');
select set_aal('aal2');
select admin_set_setting('trial_days', '45');
select expect_error($q$select admin_set_setting('trial_days', '0')$q$, 'trial_days must%', 'bad trial length accepted');
select expect_error($q$select admin_set_setting('flags', '{"x": 1}')$q$, 'flags must%', 'bad flags accepted');
select expect_error($q$select admin_set_setting('nope', '1')$q$, 'unknown setting%', 'unknown setting accepted');
select admin_extend_trial('00000000-0000-0000-0000-0000000001a1', 10);
select admin_grant_comp('00000000-0000-0000-0000-0000000001b1', null, 'RUS customer');
reset role;
select set_aal(null);
do $$ begin
  if setting('trial_days')::text <> '45' then raise exception 'FAIL: admin setting not saved'; end if;
  if not has_pro('00000000-0000-0000-0000-0000000001a1') then raise exception 'FAIL: extended trial not Pro'; end if;
  if not has_pro('00000000-0000-0000-0000-0000000001b1') then raise exception 'FAIL: comp grant not Pro'; end if;
  if (select count(*) from admin_audit_log where actor_id = '00000000-0000-0000-0000-0000000001c1') <> 3 then
    raise exception 'FAIL: admin changes not logged';
  end if;
end $$;
select id as comp_grant from entitlement_grants where user_id = '00000000-0000-0000-0000-0000000001b1' and source = 'comp' \gset
select as_user('00000000-0000-0000-0000-0000000001c1');
select set_aal('aal2');
set role authenticated;
select admin_revoke_grant(:'comp_grant');
reset role;
select set_aal(null);
do $$ begin
  if has_pro('00000000-0000-0000-0000-0000000001b1') then raise exception 'FAIL: revoked comp still Pro'; end if;
end $$;
update app_settings set value = '30' where key = 'trial_days';

-- 8. Paid Pro from the App Store (as the edge function would write it), grace and refunds.
insert into app_store_subscriptions (original_transaction_id, user_id, product_id, status, expires_at, environment)
values ('2000000123', '00000000-0000-0000-0000-0000000001b1', 'com.rusoffroad.onmylead.pro.annual', 'active', now() + interval '1 year', 'Sandbox');
do $$ begin
  if not has_pro('00000000-0000-0000-0000-0000000001b1') then raise exception 'FAIL: active subscription not Pro'; end if;
  update app_store_subscriptions set status = 'billing_retry', grace_until = now() + interval '3 days' where original_transaction_id = '2000000123';
  if not has_pro('00000000-0000-0000-0000-0000000001b1') then raise exception 'FAIL: grace period not Pro'; end if;
  update app_store_subscriptions set grace_until = now() - interval '1 minute' where original_transaction_id = '2000000123';
  if has_pro('00000000-0000-0000-0000-0000000001b1') then raise exception 'FAIL: billing retry past grace still Pro'; end if;
  update app_store_subscriptions set status = 'refunded', grace_until = null where original_transaction_id = '2000000123';
  if has_pro('00000000-0000-0000-0000-0000000001b1') then raise exception 'FAIL: refunded subscription still Pro'; end if;
  update app_store_subscriptions set status = 'active', expires_at = now() - interval '1 minute' where original_transaction_id = '2000000123';
  if has_pro('00000000-0000-0000-0000-0000000001b1') then raise exception 'FAIL: lapsed subscription still Pro'; end if;
end $$;

-- 9. Trial reminders: the nearest stage once, nothing twice, nothing for paying riders,
--    and push respects the account switch.
truncate net.calls;
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000001e1', '{"full_name":"Ellie Ending"}'),
  ('00000000-0000-0000-0000-0000000001e2', '{"full_name":"Paul Paying"}');
update entitlement_grants set ends_at = now() + interval '2 days' where user_id in ('00000000-0000-0000-0000-0000000001e1', '00000000-0000-0000-0000-0000000001e2');
insert into app_store_subscriptions (original_transaction_id, user_id, product_id, status, expires_at, environment)
values ('2000000456', '00000000-0000-0000-0000-0000000001e2', 'com.rusoffroad.onmylead.pro.monthly', 'active', now() + interval '1 month', 'Sandbox');
insert into push_tokens (user_id, token, platform) values ('00000000-0000-0000-0000-0000000001e1', repeat('ab', 32), 'ios');
do $$
declare
  n int;
begin
  -- Other test trials end weeks away or long ago, so only Ellie and Paul are due.
  n := trial_reminder_batch();
  if n <> 1 or last_push() ->> 'stage' <> '3d' or last_push() ->> 'user' <> '00000000-0000-0000-0000-0000000001e1' then
    raise exception 'FAIL: expected one 3-day reminder for Ellie, got % (%)', n, last_push();
  end if;
  if trial_reminder_batch() <> 0 then raise exception 'FAIL: reminder sent twice'; end if;
  if not exists (select 1 from trial_notices n join entitlement_grants g on g.id = n.grant_id
                 where g.user_id = '00000000-0000-0000-0000-0000000001e1' and n.stage = '7d') then
    raise exception 'FAIL: skipped earlier stage not marked';
  end if;
  update entitlement_grants set ends_at = now() + interval '12 hours' where user_id = '00000000-0000-0000-0000-0000000001e1';
  if trial_reminder_batch() <> 1 or last_push() ->> 'stage' <> '1d' then raise exception 'FAIL: 1-day reminder'; end if;
  update entitlement_grants set starts_at = now() - interval '31 days', ends_at = now() - interval '1 hour' where user_id = '00000000-0000-0000-0000-0000000001e1';
  if trial_reminder_batch() <> 1 or last_push() ->> 'stage' <> 'ended' then raise exception 'FAIL: trial-ended notice'; end if;
  if (select count(*) from push_batch_account(last_push())) <> 1 then raise exception 'FAIL: no push row for the ended notice'; end if;
  if (select title from push_batch_account(last_push())) <> 'Your Pro Trial Has Ended' then raise exception 'FAIL: notice title'; end if;
  insert into notification_settings (user_id, account_push) values ('00000000-0000-0000-0000-0000000001e1', false);
  if (select count(*) from push_batch_account(last_push())) <> 0 then raise exception 'FAIL: push sent with account notices off'; end if;
end $$;
set role authenticated;
select expect_refused($q$select * from push_batch_account('{"type":"trial","user":"00000000-0000-0000-0000-0000000001e1","stage":"ended"}')$q$, 'rider read push rows');
reset role;

-- 10. Account deletion requests and the activity stamp.
select as_user('00000000-0000-0000-0000-0000000001b1');
set role authenticated;
select request_account_deletion('Testing');
select touch_activity();
do $$ begin
  if (select count(*) from account_deletion_requests) <> 1 then raise exception 'FAIL: deletion request not saved'; end if;
end $$;
reset role;
select as_user(null);
set role anon;
select expect_refused($q$select request_account_deletion(null)$q$, 'signed-out visitor requested a deletion');
do $$ begin
  if my_entitlements() is not null then raise exception 'FAIL: signed-out visitor read entitlements'; end if;
end $$;
reset role;
do $$ begin
  if (select last_active_at from profiles where id = '00000000-0000-0000-0000-0000000001b1') is null then
    raise exception 'FAIL: activity not stamped';
  end if;
end $$;

select 'ALL PRO, TRIAL, RIDE LIMIT, ADMIN AND REMINDER TESTS PASSED' as result;
