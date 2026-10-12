-- Admin Dashboard functions (20261018300000_admin_dashboard.sql). Runs after privacy_test.sql.
-- Each block raises an exception if an admin rule is broken.


insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000ad01', 'chris@example.com', '{"full_name":"Chris Admin"}'),
  ('00000000-0000-0000-0000-00000000ad02', 'rider@example.com', '{"full_name":"Rita Rider"}'),
  ('00000000-0000-0000-0000-00000000ad03', 'trial@example.com', '{"full_name":"Tom Trial"}');
insert into admin_users (user_id) values ('00000000-0000-0000-0000-00000000ad01');
-- Rita: an expired trial and a paid subscription. Tom: a live trial (may already exist from the signup trigger).
delete from entitlement_grants where user_id in ('00000000-0000-0000-0000-00000000ad02', '00000000-0000-0000-0000-00000000ad03');
insert into entitlement_grants (user_id, source, starts_at, ends_at) values
  ('00000000-0000-0000-0000-00000000ad02', 'trial', now() - interval '40 days', now() - interval '10 days'),
  ('00000000-0000-0000-0000-00000000ad03', 'trial', now() - interval '25 days', now() + interval '5 days');
insert into app_store_subscriptions (original_transaction_id, user_id, product_id, status, expires_at, price_milli, currency, environment)
values ('tx-1', '00000000-0000-0000-0000-00000000ad02', 'com.rusoffroad.onmylead.pro.annual', 'active', now() + interval '300 days', 29990, 'USD', 'Production');
insert into vehicles (owner_id, kind, make, model, vin) values ('00000000-0000-0000-0000-00000000ad02', 'vehicle', 'Toyota', '4Runner', 'SECRETVIN123');
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, meet_area_label, visibility)
values ('22222222-2222-2222-2222-2222222222a1', '00000000-0000-0000-0000-00000000ad02', 'Bad Ride', now() + interval '2 days', 38.6, -109.5, 'Moab area', 'public');
insert into ride_private_details (ride_id, meet_lat, meet_lng, meet_label)
values ('22222222-2222-2222-2222-2222222222a1', 38.5733, -109.5498, 'Secret gate code 4321');
insert into reports (id, reporter_id, kind, ride_id, reason)
values ('33333333-3333-3333-3333-3333333333a1', '00000000-0000-0000-0000-00000000ad03', 'ride', '22222222-2222-2222-2222-2222222222a1', 'Spam');

create function as_admin_session(p uuid, p_aal text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p::text, ''), false),
         set_config('request.jwt.claims', jsonb_build_object('sub', p, 'aal', p_aal)::text, false);
$$;

-- Not an admin, or an admin without the authenticator code: every admin function refuses.
do $$
declare
  f text;
  calls text[] := array[
    'select admin_users()', 'select admin_user(''00000000-0000-0000-0000-00000000ad02'')',
    'select admin_overview(now() - interval ''30 days'', now())', 'select admin_rides()', 'select admin_reports()',
    'select admin_trials()', 'select admin_trial_stats()', 'select admin_settings()', 'select admin_audit()',
    'select * from admin_timeseries(''signups'', now() - interval ''7 days'', now())',
    'select * from admin_account_states()',
    'select admin_remove_ride(''22222222-2222-2222-2222-2222222222a1'', ''testing'')',
    'select admin_resolve_report(''33333333-3333-3333-3333-3333333333a1'', ''dismissed'')',
    'select admin_set_feature_plan(''import_gpx'', ''free'')',
    'select admin_log(''test.action'')'];
  who record;
begin
  for who in select * from (values ('00000000-0000-0000-0000-00000000ad02'::uuid, 'aal2'), ('00000000-0000-0000-0000-00000000ad01'::uuid, 'aal1')) v(uid, aal) loop
    perform as_admin_session(who.uid, who.aal);
    set local role authenticated;
    foreach f in array calls loop
      begin
        execute f;
        raise exception 'FAIL: % ran for % at %', f, who.uid, who.aal;
      exception when insufficient_privilege then null;
      end;
    end loop;
    reset role;
  end loop;
end $$;

-- admin_session never raises and tells the gate what is missing.
select as_admin_session('00000000-0000-0000-0000-00000000ad01', 'aal1');
set role authenticated;
do $$ begin
  if admin_session() <> '{"is_admin": true, "aal": "aal1"}'::jsonb then raise exception 'FAIL: admin_session %', admin_session(); end if;
end $$;
reset role;

-- The admin with the authenticator code.
select as_admin_session('00000000-0000-0000-0000-00000000ad01', 'aal2');
set role authenticated;
do $$
declare
  v jsonb; s text;
begin
  v := admin_users('rita');
  if (v ->> 'total')::int <> 1 or v #>> '{rows,0,label}' <> 'Pro' or v #>> '{rows,0,email}' <> 'rider@example.com' then
    raise exception 'FAIL: admin_users search %', v;
  end if;
  if (admin_users(null, 'trial') -> 'rows') @> '[{"display_name":"Rita Rider"}]' then raise exception 'FAIL: expired trial listed as trial'; end if;
  if not (admin_users(null, 'trial') -> 'rows') @> '[{"display_name":"Tom Trial"}]' then raise exception 'FAIL: live trial not listed'; end if;
  if not (admin_users(null, 'admin') -> 'rows') @> '[{"display_name":"Chris Admin","label":"Admin"}]' then raise exception 'FAIL: admin filter'; end if;

  v := admin_user('00000000-0000-0000-0000-00000000ad02');
  s := v::text;
  if s like '%SECRETVIN%' or s like '%Secret gate%' or s like '%38.5733%' then raise exception 'FAIL: admin_user leaks private data'; end if;
  if jsonb_array_length(v -> 'vehicles') <> 1 or v #>> '{state,trial_state}' <> 'expired' then raise exception 'FAIL: admin_user %', v; end if;

  v := admin_ride('22222222-2222-2222-2222-2222222222a1');
  s := v::text;
  if s like '%Secret gate%' or s like '%38.5733%' or s like '%meet_lat%' or s like '%meet_area_lat%' then raise exception 'FAIL: admin_ride leaks the meeting point'; end if;
  if (v #>> '{activity,has_route}') is null then raise exception 'FAIL: admin_ride activity'; end if;
  if (admin_rides('bad') ->> 'total')::int <> 1 or (admin_rides(null, 'reported') ->> 'total')::int < 1 then raise exception 'FAIL: admin_rides'; end if;
  if (admin_rides()::text) like '%meet_area_lat%' then raise exception 'FAIL: admin_rides returns coordinates'; end if;

  v := admin_overview(now() - interval '30 days', now() + interval '1 minute');
  if (v ->> 'paid')::int < 1 or (v ->> 'trial')::int < 1 or (v ->> 'admins')::int < 1 or (v ->> 'reports_open')::int < 1
     or (v ->> 'mrr_milli')::bigint < 2499 then
    raise exception 'FAIL: admin_overview %', v;
  end if;
  if (v #>> '{trial_conversion,ended}')::int < 1 or (v #>> '{trial_conversion,paid}')::int < 1 then raise exception 'FAIL: conversion %', v -> 'trial_conversion'; end if;
  if (select sum(t.v) from admin_timeseries('signups', now() - interval '1 day', now() + interval '1 minute', 'day') t) < 3 then
    raise exception 'FAIL: signups timeseries';
  end if;

  if not (admin_trials('expiring') -> 'rows') @> '[{"display_name":"Tom Trial"}]' then raise exception 'FAIL: expiring trials'; end if;
  if (admin_trial_stats() #>> '{settings,trial_days}')::int <> 30 then raise exception 'FAIL: trial stats settings'; end if;

  begin
    perform admin_set_feature_plan('ride_mode', 'pro');
    raise exception 'FAIL: a safety feature was put behind Pro';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  perform admin_set_feature_plan('create_poll', 'free');

  perform admin_resolve_report('33333333-3333-3333-3333-3333333333a1', 'reviewing', 'Looking');
  perform admin_remove_ride('22222222-2222-2222-2222-2222222222a1', 'Spam ride');

  v := admin_audit();
  if not (v -> 'rows') @> '[{"action":"ride.remove","actor_name":"Chris Admin"}]'
     or not (v -> 'rows') @> '[{"action":"report.reviewing"}]'
     or not (v -> 'rows') @> '[{"action":"feature_plan.set","target_id":"create_poll"}]' then
    raise exception 'FAIL: audit log %', v;
  end if;
  if (v::text) like '%Secret gate%' then raise exception 'FAIL: audit keeps the exact meeting point'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', '', false);

do $$ begin
  if (select min_plan from feature_plans where feature = 'create_poll') <> 'free' then raise exception 'FAIL: feature plan not saved'; end if;
  if exists (select 1 from rides where id = '22222222-2222-2222-2222-2222222222a1') then raise exception 'FAIL: ride not removed'; end if;
  if (select status from reports where id = '33333333-3333-3333-3333-3333333333a1') <> 'resolved' then raise exception 'FAIL: report not resolved with the ride'; end if;
end $$;

select 'admin tests passed' as result;
