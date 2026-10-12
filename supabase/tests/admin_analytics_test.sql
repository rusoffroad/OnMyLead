-- Admin Dashboard revenue and analytics functions (migration 20261018400000_admin_analytics.sql).
-- Runs after the other test files (run_local.sh), which set up as_user and expect_refused and
-- leave their own riders and purchases behind, so counts are checked as changes from a baseline. Each block raises an exception if a rule is broken.

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000ad', 'owner@example.test', '{"full_name":"Olga Owner"}'),
  ('00000000-0000-0000-0000-0000000000c5', 'paid@example.test', '{"full_name":"Pat Paid"}'),
  ('00000000-0000-0000-0000-0000000000c6', 'trial@example.test', '{"full_name":"Tess Trial"}');
insert into admin_users (user_id) values ('00000000-0000-0000-0000-0000000000ad');

create function as_session(p uuid, p_aal text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p::text, ''), false),
         set_config('request.jwt.claims', jsonb_build_object('sub', p, 'aal', p_aal)::text, false);
$$;

-- Baseline before this file's fixtures.
create table _admin_base (k text primary key, v numeric not null);
create function base(p text) returns numeric language sql as $$ select v from _admin_base where k = p $$;
grant select on _admin_base to authenticated;
grant execute on function base(text) to authenticated;
select as_session('00000000-0000-0000-0000-0000000000ad', 'aal2');
insert into _admin_base
select 'paid', (admin_subscription_summary()->>'paid')::int
union all select 'admin', (admin_subscription_summary()->>'admin')::int
union all select 'monthly', (admin_subscription_summary()->'subscriptions'->>'monthly')::int
union all select 'sandbox_annual', (admin_subscription_summary('Sandbox')->'subscriptions'->>'annual')::int
union all select 'mrr_usd', coalesce((select sum((m->>'mrr_milli')::bigint) from jsonb_array_elements(admin_subscription_summary()->'mrr') m where m->>'currency' = 'USD'), 0)
union all select 'errors_7d', (admin_subscription_summary()->>'errors_7d')::int
union all select 'offer_code', (select count(*) from admin_subscriptions('offer_code'))
union all select 'gross', (select coalesce(sum(gross_milli), 0) from admin_revenue_series(now() - interval '60 days', now() + interval '1 minute', 'day'))
union all select 'new_subs', (select coalesce(sum(new_subscriptions), 0) from admin_revenue_series(now() - interval '60 days', now() + interval '1 minute', 'day'))
union all select 'refunds', (select coalesce(sum(refunds_milli), 0) from admin_revenue_series(now() - interval '60 days', now() + interval '1 minute', 'day'))
union all select 'refund_count', (select coalesce(sum(refunds), 0) from admin_revenue_series(now() - interval '60 days', now() + interval '1 minute', 'day'))
union all select 'renewals', (select coalesce(sum(renewals), 0) from admin_revenue_series(now() - interval '60 days', now() + interval '1 minute', 'day'))
union all select 'paid_starts_7d', (select coalesce(sum(value), 0) from admin_analytics_series('paid_starts', now() - interval '7 days', now() + interval '1 minute', 'day'))
union all select 'conversions', (select coalesce(sum(value), 0) from admin_analytics_series('trial_conversions', now() - interval '60 days', now() + interval '1 minute', 'week'))
union all select 'cohort_converted', (select coalesce(sum(converted), 0) from admin_trial_cohorts(now() - interval '60 days', now() + interval '1 minute', 'month'))
union all select 'error_rows', (select count(*) from admin_subscription_errors());
select as_user(null);

-- Fixture billing: Pat pays monthly through an offer code and renewed once; Tess is on a trial
-- that started 40 days ago and ended; a sandbox purchase must not count as revenue.
-- Both got a trial at signup (foundation trigger); move them back in time.
update entitlement_grants set starts_at = now() - interval '40 days', ends_at = now() - interval '10 days'
  where user_id = '00000000-0000-0000-0000-0000000000c6' and source = 'trial';
update entitlement_grants set starts_at = now() - interval '20 days', ends_at = now() + interval '10 days'
  where user_id = '00000000-0000-0000-0000-0000000000c5' and source = 'trial';
do $$ begin
  if (select count(*) from entitlement_grants where user_id in ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000c6')) <> 2 then
    raise exception 'FAIL: fixture trials missing';
  end if;
end $$;
insert into app_store_subscriptions (original_transaction_id, user_id, product_id, status, expires_at, auto_renew,
  offer_type, offer_id, price_milli, currency, environment) values
  ('1000', '00000000-0000-0000-0000-0000000000c5', 'com.rusoffroad.onmylead.pro.monthly', 'active', now() + interval '20 days', true, null, null, 4990, 'USD', 'Production'),
  ('2000', '00000000-0000-0000-0000-0000000000c6', 'com.rusoffroad.onmylead.pro.annual', 'active', now() + interval '300 days', true, null, null, 29990, 'USD', 'Sandbox'),
  ('3000', '00000000-0000-0000-0000-0000000000c6', 'com.rusoffroad.onmylead.pro.annual', 'refunded', now() + interval '360 days', false, null, null, 29990, 'USD', 'Production');
create function tx(p_tid text, p_otid text, p_env text, p_price int, p_offer text default null) returns jsonb language sql as $$
  select jsonb_build_object('transaction', jsonb_build_object('transactionId', p_tid, 'originalTransactionId', p_otid,
    'environment', p_env, 'price', p_price, 'currency', 'USD', 'productId', 'com.rusoffroad.onmylead.pro.monthly',
    'offerType', case when p_offer is not null then 3 end, 'offerIdentifier', p_offer))
$$;
insert into app_store_events (notification_uuid, type, original_transaction_id, payload, error, received_at) values
  -- Pat redeems SPRING25 (first month free), then renews at full price; Apple sends the renewal twice.
  ('n1', 'SUBSCRIBED', '1000', tx('t1', '1000', 'Production', 0, 'SPRING25'), null, now() - interval '35 days'),
  ('n2', 'DID_RENEW', '1000', tx('t2', '1000', 'Production', 4990), null, now() - interval '5 days'),
  ('n2b', 'DID_RENEW', '1000', tx('t2', '1000', 'Production', 4990), null, now() - interval '5 days' + interval '1 minute'),
  -- A sandbox purchase never counts as revenue.
  ('n3', 'SUBSCRIBED', '2000', tx('t3', '2000', 'Sandbox', 29990), null, now() - interval '2 days'),
  -- Tess buys annual and gets a refund.
  ('n5', 'SUBSCRIBED', '3000', tx('t5', '3000', 'Production', 29990), null, now() - interval '2 days'),
  ('n6', 'REFUND', '3000', tx('t5', '3000', 'Production', 29990), null, now() - interval '1 day'),
  -- A failed notice, and the app's own verify call, which carries no money.
  ('n4', 'DID_RENEW', null, '{}', 'bad signature', now() - interval '1 day'),
  (null, 'APP_VERIFY', '1000', '{"transaction_id":"t2","status":"active","environment":"Production"}', null, now() - interval '5 days');
drop function tx(text, text, text, int, text);

-- A1. Riders, admins without an authenticator session, and signed-out callers are refused.
select as_session('00000000-0000-0000-0000-0000000000c5', 'aal2');
set role authenticated;
select expect_refused($q$select admin_subscription_summary()$q$, 'a rider read the subscription summary');
select expect_refused($q$select * from admin_subscriptions()$q$, 'a rider listed subscriptions');
select expect_refused($q$select admin_health()$q$, 'a rider read app health');
select expect_refused($q$select admin_log_export('revenue', now() - interval '1 day', now(), 1)$q$, 'a rider logged an export');
do $$ begin
  -- The helpers run as the caller, so a rider who reaches them still sees no one's purchases.
  if (select count(*) from admin_charges('Production')) <> 0 or (select count(*) from admin_offer_redemptions('Production')) <> 0 then
    raise exception 'FAIL: a rider read purchases through the revenue helpers';
  end if;
exception when insufficient_privilege then null;
end $$;
reset role;
select as_session('00000000-0000-0000-0000-0000000000ad', 'aal1');
set role authenticated;
select expect_refused($q$select admin_analytics_summary(now() - interval '30 days', now())$q$, 'admin without two-factor read analytics');
select expect_refused($q$select admin_analytics_ping()$q$, 'admin without two-factor passed the edge function check');
reset role;
select as_user(null);
set role anon;
select expect_refused($q$select admin_health()$q$, 'signed-out caller read app health');
reset role;

-- A2. The owner with two-factor sees real numbers; sandbox stays out of revenue.
select as_session('00000000-0000-0000-0000-0000000000ad', 'aal2');
set role authenticated;
do $$
declare s jsonb; r record; n int;
begin
  if not admin_analytics_ping() then raise exception 'FAIL: ping'; end if;
  s := admin_subscription_summary();
  -- Sandbox purchases still give Pro (TestFlight), so Tess counts as paid; only revenue leaves them out.
  if (s->>'paid')::int - base('paid') <> 2 or (s->>'admin')::int < 1
     or (s->'subscriptions'->>'monthly')::int - base('monthly') <> 1 then
    raise exception 'FAIL: summary counts %', s;
  end if;
  if (select sum((m->>'mrr_milli')::bigint) from jsonb_array_elements(s->'mrr') m where m->>'currency' = 'USD') - base('mrr_usd') <> 4990 then
    raise exception 'FAIL: MRR %', s->'mrr';
  end if;
  if (s->>'errors_7d')::int - base('errors_7d') <> 1 then raise exception 'FAIL: errors %', s; end if;
  if (admin_subscription_summary('Sandbox')->'subscriptions'->>'annual')::int - base('sandbox_annual') <> 1 then raise exception 'FAIL: sandbox summary'; end if;

  select count(*) into n from admin_subscriptions('offer_code');
  if n - base('offer_code') <> 1 then raise exception 'FAIL: offer code filter %', n; end if;
  select count(*) into n from admin_subscriptions('all', 'paid@example');
  if n <> 1 then raise exception 'FAIL: search by email %', n; end if;

  -- The free offer month is not a sale; the renewal counts once (4.99), Tess's annual (29.99) and its refund both show.
  select sum(gross_milli) as g, sum(refunds_milli) as rf, sum(new_subscriptions) as ns, sum(renewals) as rn, sum(refunds) as rc,
      count(*) filter (where currency = 'USD') as rows
    into r from admin_revenue_series(now() - interval '60 days', now() + interval '1 minute', 'day');
  if r.g - base('gross') <> 34980 or r.rf - base('refunds') <> 29990 or r.ns - base('new_subs') <> 1
     or r.rn - base('renewals') <> 1 or r.rc - base('refund_count') <> 1 then
    raise exception 'FAIL: revenue %', r;
  end if;
  if r.rows < 60 then raise exception 'FAIL: revenue series not zero-filled (% rows)', r.rows; end if;

  -- Tess's annual is the only paid start this week (the sandbox one is not).
  select sum(value) into n from admin_analytics_series('paid_starts', now() - interval '7 days', now() + interval '1 minute', 'day');
  if n - base('paid_starts_7d') <> 1 then raise exception 'FAIL: paid starts %', n; end if;
  select sum(value) into n from admin_analytics_series('trial_conversions', now() - interval '60 days', now() + interval '1 minute', 'week');
  if n - base('conversions') <> 2 then raise exception 'FAIL: trial conversions %', n; end if;

  select sum(converted) into n from admin_trial_cohorts(now() - interval '60 days', now() + interval '1 minute', 'month');
  if n - base('cohort_converted') <> 2 then raise exception 'FAIL: cohorts converted %', n; end if;

  select * into r from admin_promo_performance() where offer_id = 'SPRING25';
  if r.redemptions <> 1 or r.renewed <> 1 or r.paying_now <> 1 or r.revenue_milli <> 4990 then raise exception 'FAIL: promo performance %', r; end if;
  select count(*) into n from admin_promo_redemptions('spring');
  if n <> 1 then raise exception 'FAIL: redemption search %', n; end if;
  select count(*) into n from admin_subscription_errors();
  if n - base('error_rows') <> 1 then raise exception 'FAIL: errors list %', n; end if;
  if (admin_health()->'push'->>'tokens') is null then raise exception 'FAIL: health'; end if;

  perform admin_log_export('revenue', now() - interval '30 days', now(), 30);
end $$;
select expect_refused($q$select admin_log_export('everyone_locations', now() - interval '1 day', now(), 1)$q$, 'an unknown export was logged');
select expect_refused($q$select * from admin_analytics_series('positions', now() - interval '1 day', now())$q$, 'an unknown series was read');
reset role;

do $$ begin
  if (select count(*) from admin_audit_log where action = 'export_csv' and target_id = 'revenue') <> 1 then
    raise exception 'FAIL: export not audit-logged';
  end if;
end $$;

-- A3. Nothing the analytics functions return carries a position or meeting point.
select as_session('00000000-0000-0000-0000-0000000000ad', 'aal2');
set role authenticated;
do $$
declare blob text;
begin
  blob := admin_subscription_summary()::text || admin_analytics_summary(now() - interval '90 days', now())::text || admin_health()::text
    || coalesce((select jsonb_agg(to_jsonb(s))::text from admin_subscriptions() s), '')
    || coalesce((select jsonb_agg(to_jsonb(s))::text from admin_promo_redemptions() s), '');
  if blob ~* '(lat|lng|latitude|longitude|meet_area|geojson)' then raise exception 'FAIL: location field in admin output'; end if;
end $$;
reset role;
select as_user(null);

drop function base(text);
drop table _admin_base;

select 'ALL ADMIN ANALYTICS TESTS PASSED';
