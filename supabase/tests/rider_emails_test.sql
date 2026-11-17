-- Email All Riders (20261116500000_rider_emails.sql). Runs after privacy_test.sql (as_user),
-- pro_test.sql (expect_error) and admin_growth_test.sql (as_session).
-- Each block raises an exception if a rule is broken.

-- privacy_test.sql grants every function and table to authenticated; put back what the migration
-- revoked, as it stands on Supabase.
revoke execute on function email_audience(), email_unsubscribe(uuid) from anon, authenticated;
revoke all on email_broadcasts, email_unsubscribes from anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data, banned_until) values
  ('00000000-0000-0000-0000-0000000e3a01', 'em-owner@example.test', '{"full_name":"Olive Owner"}', null),
  ('00000000-0000-0000-0000-0000000e3a02', 'em-rider@example.test', '{"full_name":"  Rex Rider Jr"}', null),
  ('00000000-0000-0000-0000-0000000e3a03', 'abc123@privaterelay.appleid.com', '{}', null),
  ('00000000-0000-0000-0000-0000000e3a04', 'em-banned@example.test', '{}', now() + interval '30 days'),
  ('00000000-0000-0000-0000-0000000e3a05', 'em-quiet@example.test', '{}', null),
  ('00000000-0000-0000-0000-0000000e3a06', null, '{}', null);
insert into admin_users (user_id) values ('00000000-0000-0000-0000-0000000e3a01');

-- Who is in the audience: Olive, Rex and Quinn; not the Apple relay, the suspended rider or no email.
do $$
declare ids uuid[];
begin
  select array_agg(user_id) into ids from email_audience() where user_id::text like '00000000-0000-0000-0000-0000000e3a%';
  if not ids @> array['00000000-0000-0000-0000-0000000e3a01', '00000000-0000-0000-0000-0000000e3a02', '00000000-0000-0000-0000-0000000e3a05']::uuid[]
    then raise exception 'FAIL: audience missing riders %', ids; end if;
  if ids && array['00000000-0000-0000-0000-0000000e3a03', '00000000-0000-0000-0000-0000000e3a04', '00000000-0000-0000-0000-0000000e3a06']::uuid[]
    then raise exception 'FAIL: audience has relay, suspended or no-email riders %', ids; end if;
  if (select first_name from email_audience() where user_id = '00000000-0000-0000-0000-0000000e3a02') <> 'Rex'
    then raise exception 'FAIL: first name not trimmed'; end if;
  if (select first_name from email_audience() where user_id = '00000000-0000-0000-0000-0000000e3a05') is not null
    then raise exception 'FAIL: blank name should be null'; end if;
end $$;

-- Unsubscribe sticks, with or without a notification_settings row, and an unknown id is refused.
do $$
declare before int := (select count(*) from email_audience());
begin
  if not email_unsubscribe('00000000-0000-0000-0000-0000000e3a05') then raise exception 'FAIL: unsubscribe refused'; end if;
  if email_unsubscribe('00000000-0000-0000-0000-0000000e3aff') then raise exception 'FAIL: unknown rider unsubscribed'; end if;
  perform email_unsubscribe('00000000-0000-0000-0000-0000000e3a05');
  if exists (select 1 from email_audience() where user_id = '00000000-0000-0000-0000-0000000e3a05') then raise exception 'FAIL: unsubscribed rider still emailed'; end if;
  if (select count(*) from email_audience()) <> before - 1 then raise exception 'FAIL: audience count'; end if;
end $$;

-- Riders and signed-in non-admins can't see the audience, the sends or unsubscribe anyone.
select as_session('00000000-0000-0000-0000-0000000e3a02', 'aal1');
set role authenticated;
select expect_error($$select admin_email_overview()$$, '%admin only%', 'FAIL: rider read the email overview');
select expect_error($$select * from email_audience()$$, '%permission denied%', 'FAIL: rider read the audience');
select expect_error($$select email_unsubscribe('00000000-0000-0000-0000-0000000e3a01')$$, '%permission denied%', 'FAIL: rider unsubscribed someone');
select expect_error($$select * from email_broadcasts$$, '%permission denied%', 'FAIL: rider read the sends');
reset role;

-- An admin needs the authenticator code, then sees the count.
select as_session('00000000-0000-0000-0000-0000000e3a01', 'aal1');
set role authenticated;
select expect_error($$select admin_email_overview()$$, '%two-factor%', 'FAIL: email overview without aal2');
reset role;
select as_session('00000000-0000-0000-0000-0000000e3a01', 'aal2');
set role authenticated;
do $$
declare o jsonb := admin_email_overview();
begin
  if (o ->> 'audience')::int < 2 then raise exception 'FAIL: overview audience %', o; end if;
  if (o ->> 'apple_relay')::int < 1 or (o ->> 'unsubscribed')::int < 1 then raise exception 'FAIL: overview left-out counts %', o; end if;
  if jsonb_typeof(o -> 'sends') <> 'array' then raise exception 'FAIL: overview sends %', o; end if;
end $$;
reset role;
