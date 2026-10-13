-- Social profiles on rider info: off until the rider turns it on, seen only by riders who share a
-- ride or riding group with them, never by strangers or blocked riders, and never typed in by hand.
-- Runs after privacy_test.sql (run_local.sh), which sets up as_user and expect_refused and grants
-- every table to authenticated, so these checks lean on row level security and the functions alone.

-- Fixtures: Eva (Google) and Finn ride together; Gus is in Eva's riding group; Hal is a stranger;
-- Ivy rode with Eva but Eva blocked her.
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000005e1', '{"full_name":"Eva"}'),
  ('00000000-0000-0000-0000-0000000005f1', '{"full_name":"Finn"}'),
  ('00000000-0000-0000-0000-0000000005a1', '{"full_name":"Gus"}'),
  ('00000000-0000-0000-0000-0000000005b1', '{"full_name":"Hal"}'),
  ('00000000-0000-0000-0000-0000000005c1', '{"full_name":"Ivy"}');
insert into auth.identities (user_id, provider, provider_id, identity_data, last_sign_in_at) values
  ('00000000-0000-0000-0000-0000000005e1', 'email', 'e', '{"email":"eva@example.com"}', now() - interval '2 days'),
  ('00000000-0000-0000-0000-0000000005e1', 'google', 'g-eva', '{"full_name":"Eva Ridgeway","avatar_url":"https://lh3.googleusercontent.com/eva"}', now()),
  ('00000000-0000-0000-0000-0000000005f1', 'email', 'f', '{}', now());
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility, max_vehicles)
values ('22222222-2222-2222-2222-2222222222e1', '00000000-0000-0000-0000-0000000005e1', 'Eva''s Loop', now() + interval '2 days', 38.5, -109.5, 'public', 6);
insert into ride_members (ride_id, user_id, status) values
  ('22222222-2222-2222-2222-2222222222e1', '00000000-0000-0000-0000-0000000005f1', 'joined'),
  ('22222222-2222-2222-2222-2222222222e1', '00000000-0000-0000-0000-0000000005c1', 'joined')
  on conflict do nothing;
insert into riding_groups (id, owner_id, name) values ('33333333-3333-3333-3333-3333333333e1', '00000000-0000-0000-0000-0000000005e1', 'Eva''s Crew');
insert into riding_group_members (group_id, user_id) values ('33333333-3333-3333-3333-3333333333e1', '00000000-0000-0000-0000-0000000005a1');
insert into blocked_riders (blocker_id, blocked_id) values ('00000000-0000-0000-0000-0000000005e1', '00000000-0000-0000-0000-0000000005c1');

-- S1. Eva's Google account is copied by the server, and starts hidden.
select as_user('00000000-0000-0000-0000-0000000005e1');
set role authenticated;
select sync_social_profile();
do $$ begin
  if (select provider || ':' || name || ':' || photo_url || ':' || shown from rider_social_profiles where user_id = auth.uid())
     <> 'google:Eva Ridgeway:https://lh3.googleusercontent.com/eva:false' then
    raise exception 'FAIL: social profile not copied from the Google sign-in, or not hidden by default';
  end if;
end $$;
-- She can't write it by hand, only switch it on or off (no write policy, so an edit changes nothing).
update rider_social_profiles set name = 'Someone Famous', shown = true;
do $$ begin
  if exists (select 1 from rider_social_profiles where name = 'Someone Famous' or shown) then raise exception 'FAIL: edited a social profile by hand'; end if;
end $$;
reset role;
-- Finn has no social sign-in and can't make one up.
select as_user('00000000-0000-0000-0000-0000000005f1');
set role authenticated;
select expect_refused($q$insert into rider_social_profiles (user_id, provider, name) values (auth.uid(), 'facebook', 'Fake')$q$, 'made up a social profile');
reset role;

-- S2. Hidden: Finn, who rides with her, sees nothing.
select as_user('00000000-0000-0000-0000-0000000005f1');
set role authenticated;
do $$ begin
  if exists (select 1 from rider_social_profiles) then raise exception 'FAIL: hidden social profile was visible'; end if;
end $$;
reset role;

-- S3. Eva turns it on.
select as_user('00000000-0000-0000-0000-0000000005e1');
set role authenticated;
select set_social_profile_shown(true);
reset role;

-- S4. Finn (same ride) and Gus (same group) see it; Hal (stranger) and Ivy (blocked) don't.
select as_user('00000000-0000-0000-0000-0000000005f1');
set role authenticated;
do $$ begin
  if (select count(*) from rider_social_profiles) <> 1 then raise exception 'FAIL: rider on the same ride can''t see it'; end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-0000000005a1');
set role authenticated;
do $$ begin
  if (select count(*) from rider_social_profiles) <> 1 then raise exception 'FAIL: riding group member can''t see it'; end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-0000000005b1');
set role authenticated;
do $$ begin
  if exists (select 1 from rider_social_profiles) then raise exception 'FAIL: stranger saw a social profile'; end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-0000000005c1');
set role authenticated;
do $$ begin
  if exists (select 1 from rider_social_profiles) then raise exception 'FAIL: blocked rider saw a social profile'; end if;
end $$;
reset role;

-- S5. Signed-out visitors can't read it.
select as_user(null);
set role anon;
select expect_refused($q$select * from rider_social_profiles$q$, 'signed-out visitor read social profiles');
reset role;

-- S6. Finn has no social sign-in, so he can't turn one on.
select as_user('00000000-0000-0000-0000-0000000005f1');
set role authenticated;
select expect_refused($q$select set_social_profile_shown(true)$q$, 'showed a social profile without one');
reset role;

-- S7. Eva turns it off again and Finn no longer sees it; deleting her account removes it.
select as_user('00000000-0000-0000-0000-0000000005e1');
set role authenticated;
select set_social_profile_shown(false);
reset role;
select as_user('00000000-0000-0000-0000-0000000005f1');
set role authenticated;
do $$ begin
  if exists (select 1 from rider_social_profiles) then raise exception 'FAIL: social profile still shown after turning it off'; end if;
end $$;
reset role;
delete from auth.users where id = '00000000-0000-0000-0000-0000000005e1';
do $$ begin
  if exists (select 1 from rider_social_profiles where user_id = '00000000-0000-0000-0000-0000000005e1') then
    raise exception 'FAIL: social profile outlived the account';
  end if;
end $$;

select 'ALL SOCIAL PROFILE TESTS PASSED';
