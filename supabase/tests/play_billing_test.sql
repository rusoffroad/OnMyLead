-- Google Play Billing and one Pro state for both stores (migration 20261027000000_play_billing.sql).
-- Runs after the other test files (run_local.sh), which set up as_user, as_session (admin
-- analytics) and expect_error (Pro). Each block raises an exception if a rule is broken.

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000009a1', 'gina@example.test', '{"full_name":"Gina Google"}'),
  ('00000000-0000-0000-0000-0000000009a2', 'abe@example.test', '{"full_name":"Abe Apple"}'),
  ('00000000-0000-0000-0000-0000000009a3', 'nora@example.test', '{"full_name":"Nora Neither"}'),
  ('00000000-0000-0000-0000-0000000009ad', 'boss@example.test', '{"full_name":"Bo Boss"}');
insert into admin_users (user_id) values ('00000000-0000-0000-0000-0000000009ad');
-- No trials here: Pro must come from the store.
delete from entitlement_grants where user_id in ('00000000-0000-0000-0000-0000000009a1', '00000000-0000-0000-0000-0000000009a2', '00000000-0000-0000-0000-0000000009a3');

create function play_row(p_token text, p_status text, p_expires interval, p_extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('purchase_token', p_token, 'product_id', 'com.rusoffroad.onmylead.pro.monthly', 'base_plan_id', 'monthly',
    'status', p_status, 'expires_at', now() + p_expires, 'auto_renew', true, 'price_milli', 4990, 'currency', 'USD',
    'environment', 'Production', 'acknowledged', true, 'started_at', now() - interval '1 minute') || p_extra;
$$;

-- 1. A Google Play subscription saved from the app makes its rider Pro everywhere, with the store named.
do $$
declare
  e jsonb;
  owner uuid;
begin
  owner := play_save_subscription(play_row('tok-gina-1', 'active', interval '30 days'), '00000000-0000-0000-0000-0000000009a1', true,
    '{"order_id":"GPA.1111-2222-3333-44444","kind":"purchase","price_milli":4990,"currency":"USD"}');
  if owner is distinct from '00000000-0000-0000-0000-0000000009a1' then raise exception 'FAIL: owner not returned'; end if;
  if not has_pro('00000000-0000-0000-0000-0000000009a1') or not has_paid_pro('00000000-0000-0000-0000-0000000009a1') then
    raise exception 'FAIL: Google Play subscriber is not Pro';
  end if;
  perform as_user('00000000-0000-0000-0000-0000000009a1');
  e := my_entitlements();
  if e ->> 'account_type' <> 'pro' or e ->> 'pro_source' <> 'google' then raise exception 'FAIL: entitlements say % / %', e ->> 'account_type', e ->> 'pro_source'; end if;
  if e -> 'google' ->> 'status' <> 'active' or e -> 'apple' <> 'null'::jsonb then raise exception 'FAIL: google/apple objects wrong: %', e; end if;
  if e -> 'store_subscription' ->> 'store' <> 'google' then raise exception 'FAIL: store_subscription wrong'; end if;
  if jsonb_array_length(e -> 'open_subscriptions') <> 1 then raise exception 'FAIL: open_subscriptions wrong'; end if;
  if (e ->> 'ride_allowance') is not null then raise exception 'FAIL: Google Pro still has a ride limit'; end if;
  perform as_user(null);
end $$;

-- 2. Riders can read their own Play subscription and nobody else's; orders and events stay private.
select as_user('00000000-0000-0000-0000-0000000009a3');
set role authenticated;
do $$
begin
  if exists (select 1 from play_subscriptions) then raise exception 'FAIL: rider can see another rider''s Play subscription'; end if;
  -- Revoked in Supabase; this test database grants every table (privacy_test.sql), so RLS must hide the rows too.
  begin
    if exists (select 1 from play_orders) then raise exception 'FAIL: play_orders readable'; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    if exists (select 1 from play_events) then raise exception 'FAIL: play_events readable'; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    if exists (select 1 from store_subscriptions) then raise exception 'FAIL: store_subscriptions readable'; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    perform play_save_subscription(play_row('tok-forged', 'active', interval '30 days'), auth.uid(), true);
    raise exception 'FAIL: a rider could write a Play subscription';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into play_subscriptions (purchase_token, user_id, product_id, status, environment)
    values ('tok-forged-2', auth.uid(), 'com.rusoffroad.onmylead.pro.monthly', 'active', 'Production');
    raise exception 'FAIL: a rider could insert a Play subscription';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-0000000009a1');
set role authenticated;
do $$
begin
  if (select count(*) from play_subscriptions) <> 1 then raise exception 'FAIL: rider can''t see their own Play subscription'; end if;
end $$;
reset role;
select as_user(null);

-- 3. A notification fills an empty owner from the obfuscated account id, but never moves a
--    subscription that already has one; a restore from the app does move it.
do $$
begin
  perform play_save_subscription(play_row('tok-gina-1', 'active', interval '30 days'), '00000000-0000-0000-0000-0000000009a3', false);
  if (select user_id from play_subscriptions where purchase_token = 'tok-gina-1') <> '00000000-0000-0000-0000-0000000009a1' then
    raise exception 'FAIL: a notification moved the subscription';
  end if;
  perform play_save_subscription(play_row('tok-orphan', 'active', interval '30 days'), null, false);
  perform play_save_subscription(play_row('tok-orphan', 'active', interval '30 days'), '00000000-0000-0000-0000-0000000009a3', false);
  if (select user_id from play_subscriptions where purchase_token = 'tok-orphan') is distinct from '00000000-0000-0000-0000-0000000009a3' then
    raise exception 'FAIL: notification did not fill an empty owner';
  end if;
  -- An account id that isn't an OnMyLead account links nothing.
  perform play_save_subscription(play_row('tok-stranger', 'active', interval '30 days'), '00000000-0000-0000-0000-00000000dead', false);
  if (select user_id from play_subscriptions where purchase_token = 'tok-stranger') is not null then raise exception 'FAIL: linked to a non-account'; end if;
  -- A restore in the app on Gina's account moves it to Gina.
  perform play_save_subscription(play_row('tok-orphan', 'active', interval '30 days'), '00000000-0000-0000-0000-0000000009a1', true);
  if (select user_id from play_subscriptions where purchase_token = 'tok-orphan') <> '00000000-0000-0000-0000-0000000009a1' then
    raise exception 'FAIL: restore from the app did not move the subscription';
  end if;
  delete from play_subscriptions where purchase_token in ('tok-orphan', 'tok-stranger');
  if has_pro('00000000-0000-0000-0000-0000000009a3') then raise exception 'FAIL: Nora is Pro with nothing'; end if;
end $$;

-- 4. Grace keeps Pro until grace_until; on hold (billing_retry), paused and pending never give it
--    but count as open for the duplicate guard; expired is neither.
do $$
declare
  e jsonb;
begin
  perform play_save_subscription(play_row('tok-gina-1', 'grace', interval '-1 hour', jsonb_build_object('grace_until', now() + interval '3 days')),
    '00000000-0000-0000-0000-0000000009a1', true);
  if not has_pro('00000000-0000-0000-0000-0000000009a1') then raise exception 'FAIL: grace period lost Pro'; end if;
  foreach e in array array['"billing_retry"', '"paused"', '"pending"']::jsonb[] loop
    perform play_save_subscription(play_row('tok-gina-1', e #>> '{}', interval '-1 hour'), '00000000-0000-0000-0000-0000000009a1', true);
    if has_pro('00000000-0000-0000-0000-0000000009a1') then raise exception 'FAIL: % gave Pro', e; end if;
    perform as_user('00000000-0000-0000-0000-0000000009a1');
    if jsonb_array_length(my_entitlements() -> 'open_subscriptions') <> 1 then raise exception 'FAIL: % not open', e; end if;
    perform as_user(null);
  end loop;
  perform play_save_subscription(play_row('tok-gina-1', 'expired', interval '-1 hour'), '00000000-0000-0000-0000-0000000009a1', true);
  perform as_user('00000000-0000-0000-0000-0000000009a1');
  e := my_entitlements();
  if e ->> 'account_type' <> 'free' or jsonb_array_length(e -> 'open_subscriptions') <> 0 then raise exception 'FAIL: expired still counts: %', e; end if;
  perform as_user(null);
end $$;

-- 5. A plan change or resubscribe (linked_purchase_token) ends the old token and keeps its owner.
do $$
begin
  perform play_save_subscription(play_row('tok-gina-1', 'active', interval '30 days'), '00000000-0000-0000-0000-0000000009a1', true);
  perform play_save_subscription(play_row('tok-gina-2', 'active', interval '365 days',
      '{"product_id":"com.rusoffroad.onmylead.pro.annual","base_plan_id":"annual","linked_purchase_token":"tok-gina-1","price_milli":29990}'),
    null, false, '{"order_id":"GPA.5555-6666-7777-88888","kind":"purchase","price_milli":29990,"currency":"USD"}');
  if (select status from play_subscriptions where purchase_token = 'tok-gina-1') <> 'expired' then raise exception 'FAIL: replaced token still active'; end if;
  if (select user_id from play_subscriptions where purchase_token = 'tok-gina-2') is distinct from '00000000-0000-0000-0000-0000000009a1' then
    raise exception 'FAIL: new token did not keep the owner';
  end if;
  perform as_user('00000000-0000-0000-0000-0000000009a1');
  if my_entitlements() -> 'google' ->> 'product_id' <> 'com.rusoffroad.onmylead.pro.annual' then raise exception 'FAIL: entitlements show the old plan'; end if;
  if jsonb_array_length(my_entitlements() -> 'open_subscriptions') <> 1 then raise exception 'FAIL: replaced token still open'; end if;
  perform as_user(null);
end $$;

-- 6. Apple and Google side by side: the longer one is shown, both are open, and the Apple
--    rider's entitlements keep the keys old iPhone builds read.
insert into app_store_subscriptions (original_transaction_id, user_id, product_id, status, expires_at, auto_renew, price_milli, currency, environment)
values ('9000000001', '00000000-0000-0000-0000-0000000009a2', 'com.rusoffroad.onmylead.pro.monthly', 'active', now() + interval '20 days', true, 4990, 'USD', 'Production');
do $$
declare
  e jsonb;
begin
  perform as_user('00000000-0000-0000-0000-0000000009a2');
  e := my_entitlements();
  if e ->> 'pro_source' <> 'apple' or e -> 'apple' ->> 'status' <> 'active' or e -> 'google' <> 'null'::jsonb then raise exception 'FAIL: Apple rider wrong: %', e; end if;
  if e -> 'apple' ? 'store' then raise exception 'FAIL: apple object changed shape'; end if;
  perform as_user(null);
  -- Abe also (wrongly) bought on Google Play: Pro stays, both show as open, the longer one wins.
  perform play_save_subscription(play_row('tok-abe', 'active', interval '25 days'), '00000000-0000-0000-0000-0000000009a2', true);
  perform as_user('00000000-0000-0000-0000-0000000009a2');
  e := my_entitlements();
  if e ->> 'pro_source' <> 'google' or jsonb_array_length(e -> 'open_subscriptions') <> 2 then raise exception 'FAIL: two stores wrong: %', e; end if;
  perform as_user(null);
  delete from play_subscriptions where purchase_token = 'tok-abe';
end $$;

-- 7. Refunds: the order's money comes off, and Pro from that order ends until Google charges again.
do $$
begin
  perform play_save_subscription(play_row('tok-gina-2', 'active', interval '365 days',
      '{"product_id":"com.rusoffroad.onmylead.pro.annual","latest_order_id":"GPA.5555-6666-7777-88888","price_milli":29990}'),
    '00000000-0000-0000-0000-0000000009a1', true);
  if play_refund_order('GPA.5555-6666-7777-88888', 'tok-gina-2') <> '00000000-0000-0000-0000-0000000009a1' then raise exception 'FAIL: refund owner'; end if;
  if has_pro('00000000-0000-0000-0000-0000000009a1') then raise exception 'FAIL: refunded subscription still Pro'; end if;
  if (select refunded_at from play_orders where order_id = 'GPA.5555-6666-7777-88888') is null then raise exception 'FAIL: order not marked refunded'; end if;
  -- Google's next answer for the same order doesn't undo the refund...
  perform play_save_subscription(play_row('tok-gina-2', 'active', interval '365 days',
      '{"product_id":"com.rusoffroad.onmylead.pro.annual","latest_order_id":"GPA.5555-6666-7777-88888"}'), '00000000-0000-0000-0000-0000000009a1', true);
  if has_pro('00000000-0000-0000-0000-0000000009a1') then raise exception 'FAIL: refund undone by a repeat'; end if;
  -- ...a new charged order does.
  perform play_save_subscription(play_row('tok-gina-2', 'active', interval '365 days',
      '{"product_id":"com.rusoffroad.onmylead.pro.annual","latest_order_id":"GPA.5555-6666-7777-88888..0"}'), '00000000-0000-0000-0000-0000000009a1', true,
    '{"order_id":"GPA.5555-6666-7777-88888..0","kind":"renewal","price_milli":29990,"currency":"USD"}');
  if not has_pro('00000000-0000-0000-0000-0000000009a1') then raise exception 'FAIL: renewal after refund not Pro'; end if;
end $$;

-- 8. The Admin Dashboard counts both stores: plans, subscriptions, revenue, errors, promo codes.
insert into play_events (message_id, notification_type, type, purchase_token, error) values ('msg-err-1', 4, 'SUBSCRIPTION_PURCHASED', 'tok-gina-2', 'Google Play API 500');
insert into play_subscriptions (purchase_token, user_id, product_id, status, expires_at, environment, offer_type, offer_id, started_at)
values ('tok-promo', '00000000-0000-0000-0000-0000000009a3', 'com.rusoffroad.onmylead.pro.monthly', 'active', now() + interval '30 days', 'Production', 3, 'TRAILFRIENDS', now());
select as_session('00000000-0000-0000-0000-0000000009ad', 'aal2');
set role authenticated;
do $$
declare
  s jsonb := admin_subscription_summary();
  st record;
  r record;
  n int;
begin
  if (s -> 'by_store' -> 'google' ->> 'paying')::int < 2 then raise exception 'FAIL: Google paying count: %', s -> 'by_store'; end if;
  if (s -> 'by_store' -> 'apple' ->> 'paying')::int < 1 then raise exception 'FAIL: Apple paying count: %', s -> 'by_store'; end if;
  select count(*) into n from admin_subscriptions('all', null, 'Production', 0, 200, 'google');
  if n < 2 or exists (select 1 from admin_subscriptions('all', null, 'Production', 0, 200, 'google') x where x.store <> 'google') then
    raise exception 'FAIL: admin_subscriptions store filter';
  end if;
  -- The five-argument call the current dashboard makes still works and includes both stores.
  if not exists (select 1 from admin_subscriptions('all', null, 'Production', 0, 200) x where x.store = 'google')
     or not exists (select 1 from admin_subscriptions('all', null, 'Production', 0, 200) x where x.store = 'apple') then
    raise exception 'FAIL: admin_subscriptions misses a store';
  end if;
  select * into st from admin_user('00000000-0000-0000-0000-0000000009a1') u, jsonb_to_record(u -> 'state') as x(pro_source text, paid_store text, label text);
  if st.pro_source <> 'google' or st.paid_store <> 'google' or st.label <> 'Pro' then raise exception 'FAIL: admin_user state: % %', st.pro_source, st.paid_store; end if;
  if (admin_users(null, 'paid') ->> 'total')::int < 3 then raise exception 'FAIL: paid filter misses Google: %', admin_users(null, 'paid') ->> 'total'; end if;
  if (admin_overview(null, null) ->> 'paid_google')::int < 2 then raise exception 'FAIL: overview Google count'; end if;
  -- Revenue: Gina's annual order (refunded), its renewal, and the first monthly order.
  select coalesce(sum(gross_milli), 0) as gross, coalesce(sum(refunds_milli), 0) as refunds, coalesce(sum(renewals), 0) as renewals into r
  from admin_revenue_series(now() - interval '1 day', now() + interval '1 minute', 'day');
  if r.gross < 4990 + 29990 + 29990 or r.refunds < 29990 or r.renewals < 1 then raise exception 'FAIL: revenue misses Google: %', r; end if;
  if not exists (select 1 from admin_subscription_errors() x where x.original_transaction_id = 'tok-gina-2') then raise exception 'FAIL: Google error not listed'; end if;
  if not exists (select 1 from admin_subscription_history('tok-gina-2')) then raise exception 'FAIL: Google history empty'; end if;
  if not exists (select 1 from admin_promo_redemptions() x where x.offer_id = 'TRAILFRIENDS' and x.status = 'active') then raise exception 'FAIL: Play promo code not listed'; end if;
  if not exists (select 1 from admin_promo_performance() x where x.offer_id = 'TRAILFRIENDS') then raise exception 'FAIL: Play promo code performance'; end if;
  if (admin_health() -> 'google_play' ->> 'errors_7d')::int < 1 then raise exception 'FAIL: health misses Google errors'; end if;
end $$;
reset role;
-- Without a second factor, still refused.
select as_session('00000000-0000-0000-0000-0000000009ad', 'aal1');
set role authenticated;
select expect_error($q$select admin_subscriptions('all', null, 'Production', 0, 50, 'google')$q$, '%two-factor%', 'admin_subscriptions without aal2');
reset role;
select as_user(null);
select set_config('request.jwt.claims', '', false);
