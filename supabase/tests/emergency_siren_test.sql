-- Emergency Siren (migration 20261105070000_emergency_siren.sql): each phone tells the server
-- whether its app has the siren and wants it (push_tokens.siren). Only the phone's own rider can
-- set it; tokens from older apps stay null (plain sound); re-registering keeps the value. Runs
-- after privacy_test.sql (run_local.sh): as_user and expect_refused come from there.
--
-- Riders (new here):
--   Sia  0b81  phone registered
--   Tom  0b82  phone registered
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000b81', '{"full_name":"Sia Siren"}'),
  ('00000000-0000-0000-0000-000000000b82', '{"full_name":"Tom Other"}');

select as_user('00000000-0000-0000-0000-000000000b81');
set role authenticated;
select register_push_token('sia-phone-000000000000000000000', 'ios');
reset role;
select as_user('00000000-0000-0000-0000-000000000b82');
set role authenticated;
select register_push_token('tom-phone-000000000000000000000', 'android');
reset role;

-- S1. A new token (or one from an older app) has no siren setting: the plain sound.
do $$ begin
  if (select siren from push_tokens where token = 'sia-phone-000000000000000000000') is not null then raise exception 'FAIL: siren set by default'; end if;
end $$;

-- S2. Sia switches it on, then off, then on; register again keeps it.
select as_user('00000000-0000-0000-0000-000000000b81');
set role authenticated;
do $$ begin
  if not set_push_siren('sia-phone-000000000000000000000', true) then raise exception 'FAIL: own token not found'; end if;
end $$;
reset role;
do $$ begin
  if (select siren from push_tokens where token = 'sia-phone-000000000000000000000') is not true then raise exception 'FAIL: siren on'; end if;
end $$;
select as_user('00000000-0000-0000-0000-000000000b81');
set role authenticated;
select set_push_siren('sia-phone-000000000000000000000', false);
select register_push_token('sia-phone-000000000000000000000', 'ios');
reset role;
do $$ begin
  if (select siren from push_tokens where token = 'sia-phone-000000000000000000000') is not false then raise exception 'FAIL: siren off, or lost on re-register'; end if;
end $$;

-- S3. Sia can't change Tom's phone.
select as_user('00000000-0000-0000-0000-000000000b81');
set role authenticated;
do $$ begin
  if set_push_siren('tom-phone-000000000000000000000', true) then raise exception 'FAIL: changed another rider''s phone'; end if;
end $$;
reset role;
do $$ begin
  if (select siren from push_tokens where token = 'tom-phone-000000000000000000000') is not null then raise exception 'FAIL: Tom''s phone changed'; end if;
end $$;

-- S4. Signed out: refused.
select as_user(null);
set role anon;
select expect_refused($q$select set_push_siren('sia-phone-000000000000000000000', true)$q$, 'anon set a siren');
reset role;
select as_user(null);
set role authenticated;
select expect_refused($q$select set_push_siren('sia-phone-000000000000000000000', true)$q$, 'no user set a siren');
reset role;

-- S5. Another account signs in on Sia's phone: the switch starts over (plain sound) for them.
select as_user('00000000-0000-0000-0000-000000000b81');
set role authenticated;
select set_push_siren('sia-phone-000000000000000000000', false);
reset role;
select as_user('00000000-0000-0000-0000-000000000b82');
set role authenticated;
select register_push_token('sia-phone-000000000000000000000', 'ios');
reset role;
do $$ begin
  if (select siren from push_tokens where token = 'sia-phone-000000000000000000000') is not null then raise exception 'FAIL: siren carried over to another account'; end if;
end $$;
-- The same rider registering again keeps it.
select as_user('00000000-0000-0000-0000-000000000b82');
set role authenticated;
select set_push_siren('sia-phone-000000000000000000000', true);
select register_push_token('sia-phone-000000000000000000000', 'ios');
reset role;
do $$ begin
  if (select siren from push_tokens where token = 'sia-phone-000000000000000000000') is not true then raise exception 'FAIL: re-register cleared the siren'; end if;
end $$;
