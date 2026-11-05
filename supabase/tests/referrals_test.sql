-- Refer a friend (20261103800000_referrals.sql): invites, the first-ride reward for both riders,
-- claiming it the Apple or Google way, and Admin > Referrals. Runs after events_test.sql
-- (run_local.sh): as_user and expect_refused come from privacy_test.sql, as_admin_session from
-- admin_test.sql.
--
-- Riders (all new here):
--   Rex  0f01  invites everyone
--   Fia  0f02  new account, invited by Rex, rides
--   Old  0f03  account from last month: too old to be referred
--   Gus  0f04  new account, invited by Rex, rides later (Rex keeps one reward)
--   Hal  0f05  new account, invited by Rex, only rides 5 minutes
--   Ada  0f0a  the admin
insert into auth.users (id, raw_user_meta_data, created_at) values
  ('00000000-0000-0000-0000-000000000f01', '{"full_name":"Rex Ref"}', now() - interval '90 days'),
  ('00000000-0000-0000-0000-000000000f02', '{"full_name":"Fia Ref"}', now()),
  ('00000000-0000-0000-0000-000000000f03', '{"full_name":"Old Ref"}', now() - interval '30 days'),
  ('00000000-0000-0000-0000-000000000f04', '{"full_name":"Gus Ref"}', now()),
  ('00000000-0000-0000-0000-000000000f05', '{"full_name":"Hal Ref"}', now()),
  ('00000000-0000-0000-0000-000000000f0a', '{"full_name":"Ada Ref"}', now() - interval '90 days');
insert into admin_users (user_id) values ('00000000-0000-0000-0000-000000000f0a') on conflict do nothing;
insert into friend_codes (user_id, code) values ('00000000-0000-0000-0000-000000000f01', 'REXREF0001')
on conflict (user_id) do update set code = excluded.code;

create table ref_out (name text primary key, v jsonb);
grant all on ref_out to authenticated;

-- R1. The program starts switched off.
do $$ begin
  if (select value ->> 'referrals' from app_settings where key = 'flags') is distinct from 'false' then
    raise exception 'FAIL: referrals flag not off by default';
  end if;
end $$;
select as_user('00000000-0000-0000-0000-000000000f02');
set role authenticated;
insert into ref_out values ('off', to_jsonb(claim_referral('REXREF0001')));
reset role;
update app_settings set value = value || '{"referrals": true}' where key = 'flags';

-- R2. Who can be referred.
select as_user('00000000-0000-0000-0000-000000000f02');
set role authenticated;
insert into ref_out values ('fia', to_jsonb(claim_referral(' rexref0001 ')));
insert into ref_out values ('fia_again', to_jsonb(claim_referral('REXREF0001')));
do $$ begin
  -- Row level security with no policies: even with table grants a rider reads nothing directly.
  if exists (select 1 from referrals) or exists (select 1 from referral_offer_codes) or exists (select 1 from referral_rewards) then
    raise exception 'FAIL: read referral tables directly';
  end if;
end $$;
select expect_refused($q$insert into referral_rewards (user_id, referral_id, role, expires_at) values (auth.uid(), gen_random_uuid(), 'friend', now())$q$, 'wrote a reward directly');
select expect_refused($q$select admin_referrals()$q$, 'a rider opened Admin > Referrals');
select as_user('00000000-0000-0000-0000-000000000f01');
insert into ref_out values ('self', to_jsonb(claim_referral('REXREF0001')));
select as_user('00000000-0000-0000-0000-000000000f03');
insert into ref_out values ('old', to_jsonb(claim_referral('REXREF0001')));
select as_user('00000000-0000-0000-0000-000000000f04');
insert into ref_out values ('gus', to_jsonb(claim_referral('REXREF0001')));
select as_user('00000000-0000-0000-0000-000000000f05');
insert into ref_out values ('hal', to_jsonb(claim_referral('REXREF0001')));
select as_user('00000000-0000-0000-0000-000000000f03');
insert into ref_out values ('bogus', to_jsonb(claim_referral('NOPE-NOPE')));
reset role;
do $$ begin
  if (select string_agg(name || '=' || (v #>> '{}'), ',' order by name) from ref_out)
     <> 'bogus=not_found,fia=linked,fia_again=already,gus=linked,hal=linked,off=off,old=not_new,self=self' then
    raise exception 'FAIL: claim_referral answers %', (select string_agg(name || '=' || (v #>> '{}'), ',' order by name) from ref_out);
  end if;
end $$;

-- R3. A ride under 10 minutes earns nothing; a real first ride earns both riders a reward.
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, status, started_at)
values ('0f000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000f05', 'Hal quick spin', now() - interval '1 hour', 35.1, -84.1, 'live', now() - interval '5 minutes');
update rides set status = 'ended', ended_at = now() where id = '0f000000-0000-0000-0000-000000000001';
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, status, started_at)
values ('0f000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000f01', 'Windrock loop', now() - interval '3 hours', 36.1, -84.6, 'live', now() - interval '2 hours');
insert into ride_members (ride_id, user_id, status) values
  ('0f000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000f02', 'joined'),
  ('0f000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000f04', 'pending')
on conflict do nothing;
update rides set status = 'ended', ended_at = now() where id = '0f000000-0000-0000-0000-000000000002';
do $$ begin
  if (select count(*) from referral_rewards where user_id = '00000000-0000-0000-0000-000000000f05') <> 0 then
    raise exception 'FAIL: a 5 minute ride earned a reward';
  end if;
  if (select string_agg(role, ',' order by role) from referral_rewards
      where user_id in ('00000000-0000-0000-0000-000000000f01', '00000000-0000-0000-0000-000000000f02')) <> 'friend,referrer' then
    raise exception 'FAIL: Fia''s first ride did not reward Fia and Rex';
  end if;
  if exists (select 1 from referral_rewards where user_id = '00000000-0000-0000-0000-000000000f04') then
    raise exception 'FAIL: Gus earned a reward from a ride he was only pending on';
  end if;
  if (select count(*) from rider_notifications where kind = 'referral'
      and user_id in ('00000000-0000-0000-0000-000000000f01', '00000000-0000-0000-0000-000000000f02')) <> 2 then
    raise exception 'FAIL: reward inbox rows missing';
  end if;
  if (select expires_at from referral_rewards where user_id = '00000000-0000-0000-0000-000000000f02') < now() + interval '180 days' then
    raise exception 'FAIL: reward expires too soon';
  end if;
end $$;

-- R4. What Rex sees.
select as_user('00000000-0000-0000-0000-000000000f01');
set role authenticated;
insert into ref_out values ('rex_view', my_referrals());
reset role;
do $$ declare v jsonb := (select o.v from ref_out o where o.name = 'rex_view'); begin
  if v ->> 'code' <> 'REXREF0001' or (v ->> 'invited')::int <> 3 or (v ->> 'rode')::int <> 1 or not (v ->> 'enabled')::boolean then
    raise exception 'FAIL: my_referrals counts %', v;
  end if;
  if v #>> '{reward,role}' <> 'referrer' or v #>> '{reward,from}' <> 'Fia Ref' or v -> 'reward' ->> 'claimed_at' is not null then
    raise exception 'FAIL: my_referrals reward %', v -> 'reward';
  end if;
  if jsonb_array_length(v -> 'invites') <> 3 then raise exception 'FAIL: invite list %', v -> 'invites'; end if;
end $$;

-- R5. Claiming on Apple: no codes yet, then the admin uploads a batch and Rex gets one, the same
-- one every time.
select as_user('00000000-0000-0000-0000-000000000f01');
set role authenticated;
insert into ref_out values ('rex_nocodes', claim_referral_reward('apple'));
reset role;
select as_admin_session('00000000-0000-0000-0000-000000000f0a', 'aal2');
set role authenticated;
select expect_refused($q$select admin_add_referral_codes(array['bad code!'], 'Batch 1', current_date + 90)$q$, 'a malformed Apple code');
select expect_refused($q$select admin_add_referral_codes(array['AAAA1111'], 'Batch 1', current_date - 1)$q$, 'codes that already expired');
insert into ref_out values ('added', to_jsonb(admin_add_referral_codes(array['aaaa1111', 'BBBB2222', 'BBBB2222', 'CCCC3333'], 'Batch 1', current_date + 90)));
insert into ref_out values ('sandbox', to_jsonb(admin_add_referral_codes(array['SAND0001'], 'Sandbox test', current_date + 90, 'Sandbox')));
reset role;
select as_user('00000000-0000-0000-0000-000000000f01');
set role authenticated;
insert into ref_out values ('rex_apple', claim_referral_reward('apple'));
insert into ref_out values ('rex_apple2', claim_referral_reward('apple'));
insert into ref_out values ('rex_google', claim_referral_reward('google'));
reset role;
do $$ begin
  if (select v ->> 'error' from ref_out where name = 'rex_nocodes') <> 'no_codes' then raise exception 'FAIL: claim with an empty pool'; end if;
  if (select v #>> '{}' from ref_out where name = 'added') <> '3' then raise exception 'FAIL: added % codes, expected 3', (select v from ref_out where name = 'added'); end if;
  if (select v ->> 'code' from ref_out where name = 'rex_apple') <> 'AAAA1111'
     or (select v ->> 'url' from ref_out where name = 'rex_apple') <> 'https://apps.apple.com/redeem?ctx=offercodes&id=6822352321&code=AAAA1111' then
    raise exception 'FAIL: Apple claim %', (select v from ref_out where name = 'rex_apple');
  end if;
  if (select v ->> 'code' from ref_out where name = 'rex_apple2') <> 'AAAA1111' then raise exception 'FAIL: second claim gave a new code'; end if;
  if (select v ->> 'error' from ref_out where name = 'rex_google') <> 'claimed_on_other_store' then raise exception 'FAIL: claimed on both stores'; end if;
  if (select assigned_to from referral_offer_codes where code = 'AAAA1111') <> '00000000-0000-0000-0000-000000000f01' then
    raise exception 'FAIL: code not marked as given';
  end if;
end $$;

-- R6. Claiming on Google Play: the offer, until Fia buys it.
select as_user('00000000-0000-0000-0000-000000000f02');
set role authenticated;
insert into ref_out values ('fia_google', claim_referral_reward('google'));
reset role;
insert into play_subscriptions (purchase_token, user_id, product_id, status, environment, offer_id, expires_at)
values ('fia-referral-token', '00000000-0000-0000-0000-000000000f02', 'com.rusoffroad.onmylead.pro.annual', 'active', 'Production', 'referral-50', now() + interval '365 days');
select as_user('00000000-0000-0000-0000-000000000f02');
set role authenticated;
insert into ref_out values ('fia_google2', claim_referral_reward('google'));
insert into ref_out values ('fia_apple', claim_referral_reward('apple'));
reset role;
do $$ begin
  if (select v ->> 'offer_id' from ref_out where name = 'fia_google') <> 'referral-50' then raise exception 'FAIL: Google claim %', (select v from ref_out where name = 'fia_google'); end if;
  if (select v ->> 'error' from ref_out where name = 'fia_google2') <> 'used' then raise exception 'FAIL: Google offer shown after it was bought'; end if;
  if (select v ->> 'error' from ref_out where name = 'fia_apple') <> 'used' then raise exception 'FAIL: Apple code after the Google offer was bought'; end if;
end $$;

-- R7. A rider already paying through Google Play gets a deferral, recorded by the Edge Function.
insert into ride_members (ride_id, user_id, status) values ('0f000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000f05', 'joined')
on conflict (ride_id, user_id) do update set status = 'joined';
-- Hal is added to a ride that already ended (the trigger never saw him): my_referrals settles it.
update referrals set created_at = now() - interval '4 hours' where friend_id = '00000000-0000-0000-0000-000000000f05';
select as_user('00000000-0000-0000-0000-000000000f05');
set role authenticated;
insert into ref_out values ('hal_view', my_referrals());
reset role;
insert into play_subscriptions (purchase_token, user_id, product_id, status, environment, expires_at)
values ('hal-monthly-token', '00000000-0000-0000-0000-000000000f05', 'com.rusoffroad.onmylead.pro.monthly', 'active', 'Production', now() + interval '20 days');
select as_user('00000000-0000-0000-0000-000000000f05');
set role authenticated;
insert into ref_out values ('hal_google', claim_referral_reward('google'));
reset role;
-- Reserve, Google refuses, the reward goes back unredeemed; reserve again and confirm.
do $$ begin
  if not referral_reserve_deferral('00000000-0000-0000-0000-000000000f05') then raise exception 'FAIL: first reservation not taken'; end if;
  -- A second call at the same time gets false and leaves Google to the first.
  if referral_reserve_deferral('00000000-0000-0000-0000-000000000f05') then raise exception 'FAIL: reserved twice'; end if;
  -- Taking over a stale reservation works once, and only for the reservation that was read.
  if referral_retake_deferral('00000000-0000-0000-0000-000000000f05', now() - interval '1 hour') then raise exception 'FAIL: retook a reservation it never read'; end if;
  if not referral_retake_deferral('00000000-0000-0000-0000-000000000f05', (select deferred_at from referral_rewards where user_id = '00000000-0000-0000-0000-000000000f05')) then
    raise exception 'FAIL: could not take over the reservation';
  end if;
  if (select deferred_at from referral_rewards where user_id = '00000000-0000-0000-0000-000000000f05') is null then raise exception 'FAIL: not reserved'; end if;
  if (select referral_defer_target('00000000-0000-0000-0000-000000000f05') ->> 'redeemed_at') is not null then raise exception 'FAIL: reserved counts as redeemed'; end if;
  perform referral_unmark_deferred('00000000-0000-0000-0000-000000000f05');
  if (select deferred_at from referral_rewards where user_id = '00000000-0000-0000-0000-000000000f05') is not null then raise exception 'FAIL: reservation not lifted'; end if;
  if (select redeemed_at from referral_rewards where user_id = '00000000-0000-0000-0000-000000000f05') is not null then raise exception 'FAIL: redeemed by a refused deferral'; end if;
end $$;
select referral_reserve_deferral('00000000-0000-0000-0000-000000000f05');
select referral_mark_deferred('00000000-0000-0000-0000-000000000f05', now() + interval '202 days');
do $$ begin
  if (select v #>> '{reward,role}' from ref_out where name = 'hal_view') <> 'friend' then
    raise exception 'FAIL: my_referrals did not settle Hal''s earlier ride %', (select v -> 'reward' from ref_out where name = 'hal_view');
  end if;
  if (select v ->> 'kind' from ref_out where name = 'hal_google') <> 'google_defer' then raise exception 'FAIL: Play subscriber not deferred %', (select v from ref_out where name = 'hal_google'); end if;
  if (select referral_defer_target('00000000-0000-0000-0000-000000000f05') ->> 'deferred_at') is null then raise exception 'FAIL: deferral not recorded'; end if;
  if (select expires_at from play_subscriptions where purchase_token = 'hal-monthly-token') < now() + interval '200 days' then
    raise exception 'FAIL: deferral not reflected in the subscription';
  end if;
  -- A confirmed deferral stays confirmed: unmark only lifts an unconfirmed reservation.
  perform referral_unmark_deferred('00000000-0000-0000-0000-000000000f05');
  if (select referral_defer_target('00000000-0000-0000-0000-000000000f05') ->> 'deferred_at') is null then raise exception 'FAIL: a confirmed deferral was put back'; end if;
  -- Google's own expiry wins even when it is earlier than the planned one.
  perform referral_mark_deferred('00000000-0000-0000-0000-000000000f05', now() + interval '190 days');
  if (select expires_at from play_subscriptions where purchase_token = 'hal-monthly-token') > now() + interval '191 days' then
    raise exception 'FAIL: an earlier Google expiry was not taken';
  end if;
end $$;

-- R8. Gus rides later: Gus gets his reward, Rex still has just one.
update rides set status = 'live', ended_at = null where id = '0f000000-0000-0000-0000-000000000002';
update ride_members set status = 'joined' where ride_id = '0f000000-0000-0000-0000-000000000002' and user_id = '00000000-0000-0000-0000-000000000f04';
update rides set status = 'ended', ended_at = now() where id = '0f000000-0000-0000-0000-000000000002';
do $$ begin
  if not exists (select 1 from referral_rewards where user_id = '00000000-0000-0000-0000-000000000f04' and role = 'friend') then
    raise exception 'FAIL: Gus not rewarded';
  end if;
  if (select count(*) from referral_rewards where user_id = '00000000-0000-0000-0000-000000000f01') <> 1 then
    raise exception 'FAIL: Rex got more than one reward';
  end if;
end $$;

-- R9. Admin > Referrals.
select as_admin_session('00000000-0000-0000-0000-000000000f0a', 'aal1');
set role authenticated;
select expect_refused($q$select admin_referrals()$q$, 'Admin > Referrals without two-factor');
reset role;
select as_admin_session('00000000-0000-0000-0000-000000000f0a', 'aal2');
set role authenticated;
insert into ref_out values ('admin', admin_referrals());
insert into ref_out values ('removed', to_jsonb(admin_remove_referral_codes('Batch 1')));
reset role;
do $$ declare v jsonb := (select o.v from ref_out o where o.name = 'admin'); begin
  if (v #>> '{totals,invited}')::int <> 3 or (v #>> '{totals,rode}')::int <> 3 or (v #>> '{codes,left}')::int <> 2
     or (v #>> '{totals,claimed_apple}')::int <> 1 or (v #>> '{totals,deferred_google}')::int <> 1 then
    raise exception 'FAIL: admin_referrals %', v -> 'totals' || v -> 'codes';
  end if;
  if (select o.v #>> '{}' from ref_out o where o.name = 'removed') <> '2' then raise exception 'FAIL: removed a given code'; end if;
  if not exists (select 1 from referral_offer_codes where code = 'AAAA1111') then raise exception 'FAIL: removed Rex''s code'; end if;
end $$;

-- R10. Switched off: no new invites, but earned rewards can still be claimed.
update app_settings set value = value || '{"referrals": false}' where key = 'flags';
insert into auth.users (id, raw_user_meta_data) values ('00000000-0000-0000-0000-000000000f06', '{"full_name":"Ivy Ref"}');
select as_user('00000000-0000-0000-0000-000000000f06');
set role authenticated;
insert into ref_out values ('ivy', to_jsonb(claim_referral('REXREF0001')));
select as_user('00000000-0000-0000-0000-000000000f01');
insert into ref_out values ('rex_after_off', claim_referral_reward('apple'));
reset role;
do $$ begin
  if (select v #>> '{}' from ref_out where name = 'ivy') <> 'off' then raise exception 'FAIL: invited while switched off'; end if;
  if (select v ->> 'code' from ref_out where name = 'rex_after_off') <> 'AAAA1111' then raise exception 'FAIL: earned reward lost when switched off'; end if;
end $$;

-- R11 (2.1 release test fixes, 20261105050000). Jo 0f07 was invited by Rex.
insert into auth.users (id, raw_user_meta_data) values ('00000000-0000-0000-0000-000000000f07', '{"full_name":"Jo Ref"}');
insert into referrals (referrer_id, friend_id, code, created_at)
values ('00000000-0000-0000-0000-000000000f01', '00000000-0000-0000-0000-000000000f07', 'REXREF0001', now() - interval '5 hours');
-- A ride that was ended without ever going live is not Jo's first ride.
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, status)
values ('0f000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000f07', 'Never went', now() - interval '3 hours', 35.1, -84.1, 'scheduled');
update rides set status = 'ended', ended_at = now() where id = '0f000000-0000-0000-0000-000000000007';
do $$ begin
  if exists (select 1 from referral_rewards where user_id = '00000000-0000-0000-0000-000000000f07') then
    raise exception 'FAIL: a ride that never went live earned a reward';
  end if;
end $$;
-- Jo's reward, claimed as the Google Play offer, can't also take an Apple code.
insert into referral_rewards (user_id, referral_id, role, expires_at)
select '00000000-0000-0000-0000-000000000f07', id, 'friend', now() + interval '180 days' from referrals where friend_id = '00000000-0000-0000-0000-000000000f07';
select as_user('00000000-0000-0000-0000-000000000f07');
set role authenticated;
insert into ref_out values ('jo_google', claim_referral_reward('google'));
insert into ref_out values ('jo_apple', claim_referral_reward('apple'));
reset role;
do $$ begin
  if (select v ->> 'kind' from ref_out where name = 'jo_google') <> 'google_offer' then raise exception 'FAIL: Jo''s Google claim %', (select v from ref_out where name = 'jo_google'); end if;
  if (select v ->> 'error' from ref_out where name = 'jo_apple') is distinct from 'claimed_on_other_store'
     or (select v ->> 'store' from ref_out where name = 'jo_apple') is distinct from 'google' then
    raise exception 'FAIL: Apple claim after the Google offer %', (select v from ref_out where name = 'jo_apple');
  end if;
  if (select claim_kind from referral_rewards where user_id = '00000000-0000-0000-0000-000000000f07') <> 'google_offer'
     or exists (select 1 from referral_offer_codes where assigned_to = '00000000-0000-0000-0000-000000000f07') then
    raise exception 'FAIL: the Google offer claim was overwritten by an Apple code';
  end if;
end $$;
-- A Play subscription in grace or paused counts even past its stored expiry; a lapsed active one doesn't.
insert into play_subscriptions (purchase_token, user_id, product_id, status, environment, expires_at)
values ('jo-grace-token', '00000000-0000-0000-0000-000000000f07', 'com.rusoffroad.onmylead.pro.monthly', 'grace', 'Production', now() - interval '1 day'),
       ('ivy-stale-token', '00000000-0000-0000-0000-000000000f06', 'com.rusoffroad.onmylead.pro.monthly', 'active', 'Production', now() - interval '1 day');
do $$ begin
  if referral_play_token('00000000-0000-0000-0000-000000000f07') is distinct from 'jo-grace-token' then raise exception 'FAIL: grace subscription not found'; end if;
  update play_subscriptions set status = 'paused' where purchase_token = 'jo-grace-token';
  if referral_play_token('00000000-0000-0000-0000-000000000f07') is distinct from 'jo-grace-token' then raise exception 'FAIL: paused subscription not found'; end if;
  if referral_play_token('00000000-0000-0000-0000-000000000f06') is not null then raise exception 'FAIL: a lapsed subscription counted'; end if;
end $$;

drop table ref_out;
select as_user(null);
\echo 'referrals_test: ok'
