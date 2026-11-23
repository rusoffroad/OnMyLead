-- Admin > Push Riders (20261123200000_push_riders.sql). Runs after privacy_test.sql (as_user),
-- pro_test.sql (expect_error) and admin_growth_test.sql (as_session).
-- Each block raises an exception if a rule is broken.

-- privacy_test.sql grants every function and table to authenticated; put back what the migration
-- revoked, as it stands on Supabase.
revoke execute on function push_audience(text) from anon, authenticated;
revoke all on push_broadcasts from anon, authenticated;

insert into auth.users (id, email, banned_until) values
  ('00000000-0000-0000-0000-0000000f5b01', 'pr-admin@example.test', null),
  ('00000000-0000-0000-0000-0000000f5b02', 'pr-free@example.test', null),
  ('00000000-0000-0000-0000-0000000f5b03', 'pr-comp@example.test', null),
  ('00000000-0000-0000-0000-0000000f5b04', 'pr-off@example.test', null),
  ('00000000-0000-0000-0000-0000000f5b05', 'pr-banned@example.test', now() + interval '30 days');
insert into admin_users (user_id) values ('00000000-0000-0000-0000-0000000f5b01');
insert into entitlement_grants (user_id, source, note) values ('00000000-0000-0000-0000-0000000f5b03', 'comp', 'push test');
insert into notification_settings (user_id, account_push) values ('00000000-0000-0000-0000-0000000f5b04', false)
  on conflict (user_id) do update set account_push = false;
insert into push_tokens (user_id, token, platform) values
  ('00000000-0000-0000-0000-0000000f5b02', 'tok-pr-free-ios-000000000', 'ios'),
  ('00000000-0000-0000-0000-0000000f5b02', 'tok-pr-free-and-000000000', 'android'),
  ('00000000-0000-0000-0000-0000000f5b03', 'tok-pr-comp-ios-000000000', 'ios'),
  ('00000000-0000-0000-0000-0000000f5b04', 'tok-pr-off-ios-0000000000', 'ios'),
  ('00000000-0000-0000-0000-0000000f5b05', 'tok-pr-banned-ios-0000000', 'ios');

-- Not subscribed: the Free rider's two phones only. Everyone: also the comp rider. Never the rider
-- who turned off account notifications or the suspended one.
do $$
declare
  free_t text[] := (select array_agg(token) from push_audience('not_subscribed') where token like 'tok-pr-%');
  all_t text[] := (select array_agg(token) from push_audience('everyone') where token like 'tok-pr-%');
begin
  if not free_t @> array['tok-pr-free-ios-000000000', 'tok-pr-free-and-000000000'] or cardinality(free_t) <> 2
    then raise exception 'FAIL: not_subscribed audience %', free_t; end if;
  if not all_t @> array['tok-pr-free-ios-000000000', 'tok-pr-free-and-000000000', 'tok-pr-comp-ios-000000000'] or cardinality(all_t) <> 3
    then raise exception 'FAIL: everyone audience %', all_t; end if;
  if exists (select 1 from push_audience('nonsense')) then raise exception 'FAIL: unknown audience reached phones'; end if;
end $$;

-- Riders can't see the audience, the sends or the overview.
select as_session('00000000-0000-0000-0000-0000000f5b02', 'aal1');
set role authenticated;
select expect_error($$select admin_push_overview()$$, '%admin only%', 'FAIL: rider read the push overview');
select expect_error($$select * from push_audience('everyone')$$, '%permission denied%', 'FAIL: rider read the push audience');
select expect_error($$select * from push_broadcasts$$, '%permission denied%', 'FAIL: rider read the pushes');
reset role;

-- An admin needs the authenticator code, then sees the counts.
select as_session('00000000-0000-0000-0000-0000000f5b01', 'aal1');
set role authenticated;
select expect_error($$select admin_push_overview()$$, '%two-factor%', 'FAIL: push overview without aal2');
reset role;
select as_session('00000000-0000-0000-0000-0000000f5b01', 'aal2');
set role authenticated;
do $$
declare o jsonb := admin_push_overview();
begin
  if (o ->> 'not_subscribed')::int < 1 or (o ->> 'not_subscribed_devices')::int < 2 then raise exception 'FAIL: overview counts %', o; end if;
  if (o ->> 'everyone')::int < (o ->> 'not_subscribed')::int then raise exception 'FAIL: everyone smaller %', o; end if;
  if jsonb_typeof(o -> 'sends') <> 'array' then raise exception 'FAIL: overview sends %', o; end if;
end $$;
reset role;
