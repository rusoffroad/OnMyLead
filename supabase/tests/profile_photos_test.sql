-- Profile pictures (20261102000000_profile_photos.sql). Runs after admin_test.sql, which sets up
-- as_admin_session and the admin Chris (…ad01). Each block raises an exception if a rule is broken.

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000a7a01', '{"full_name":"Pia Photo"}'),
  ('00000000-0000-0000-0000-0000000a7a02', '{"full_name":"Quinn Other"}');

-- P1. Pia saves a photo in her own folder; another signed-in rider sees it, like her ride name.
select as_user('00000000-0000-0000-0000-0000000a7a01');
set role authenticated;
update profiles set avatar_path = '00000000-0000-0000-0000-0000000a7a01/avatar-1730505600000.jpg' where id = auth.uid();
reset role;
select as_user('00000000-0000-0000-0000-0000000a7a02');
set role authenticated;
do $$ begin
  if (select avatar_path from profiles where id = '00000000-0000-0000-0000-0000000a7a01')
     is distinct from '00000000-0000-0000-0000-0000000a7a01/avatar-1730505600000.jpg' then
    raise exception 'FAIL: a signed-in rider could not see another rider''s photo';
  end if;
end $$;
reset role;

-- P2. Signed out: no profile rows at all, so no photo either (no more than the ride name today).
select as_user(null);
set role anon;
select expect_refused($q$select avatar_path from profiles$q$, 'signed-out visitor read profile photos');
reset role;

-- P3. Pia can't point her photo at another rider's folder, another site, or a nested path.
select as_user('00000000-0000-0000-0000-0000000a7a01');
set role authenticated;
select expect_refused($q$update profiles set avatar_path = '00000000-0000-0000-0000-0000000a7a02/x.jpg' where id = auth.uid()$q$, 'photo in someone else''s folder');
select expect_refused($q$update profiles set avatar_path = 'https://evil.example/x.jpg' where id = auth.uid()$q$, 'photo pointed at another site');
select expect_refused($q$update profiles set avatar_path = '00000000-0000-0000-0000-0000000a7a01/../x.jpg' where id = auth.uid()$q$, 'photo path escapes the folder');
-- She can't change Quinn's photo (RLS: the update touches nothing).
update profiles set avatar_path = null where id = '00000000-0000-0000-0000-0000000a7a02';
reset role;

-- P4. Quinn uploads one, then removes it himself.
select as_user('00000000-0000-0000-0000-0000000a7a02');
set role authenticated;
update profiles set avatar_path = '00000000-0000-0000-0000-0000000a7a02/avatar-1.webp' where id = auth.uid();
update profiles set avatar_path = null where id = '00000000-0000-0000-0000-0000000a7a01';
reset role;
do $$ begin
  if (select avatar_path from profiles where id = '00000000-0000-0000-0000-0000000a7a01') is null then
    raise exception 'FAIL: another rider removed Pia''s photo';
  end if;
  if (select avatar_path from profiles where id = '00000000-0000-0000-0000-0000000a7a02') is null then
    raise exception 'FAIL: owner could not save a photo';
  end if;
end $$;

-- P5. Only an admin with two-factor can remove a photo, with a reason, and it is logged.
select as_user('00000000-0000-0000-0000-0000000a7a02');
set role authenticated;
select expect_refused($q$select admin_remove_profile_photo('00000000-0000-0000-0000-0000000a7a01', 'Not allowed')$q$, 'a rider removed another rider''s photo');
reset role;
select as_admin_session('00000000-0000-0000-0000-00000000ad01', 'aal1');
set role authenticated;
select expect_refused($q$select admin_remove_profile_photo('00000000-0000-0000-0000-0000000a7a01', 'No second factor')$q$, 'admin without two-factor removed a photo');
reset role;
select as_admin_session('00000000-0000-0000-0000-00000000ad01', 'aal2');
set role authenticated;
select expect_refused($q$select admin_remove_profile_photo('00000000-0000-0000-0000-0000000a7a01', '')$q$, 'photo removed without a reason');
do $$
declare
  v text;
begin
  v := admin_remove_profile_photo('00000000-0000-0000-0000-0000000a7a01', 'Offensive photo');
  if v <> '00000000-0000-0000-0000-0000000a7a01/avatar-1730505600000.jpg' then
    raise exception 'FAIL: removal returned % instead of the file path', v;
  end if;
  if not (admin_audit() -> 'rows') @> '[{"action":"profile_photo.remove","target_id":"00000000-0000-0000-0000-0000000a7a01"}]' then
    raise exception 'FAIL: photo removal not in the audit log';
  end if;
end $$;
-- Nothing left to remove.
select expect_refused($q$select admin_remove_profile_photo('00000000-0000-0000-0000-0000000a7a01', 'Again please')$q$, 'removed a photo that was already gone');
reset role;
select set_config('request.jwt.claims', '', false);
do $$ begin
  if (select avatar_path from profiles where id = '00000000-0000-0000-0000-0000000a7a01') is not null then
    raise exception 'FAIL: admin removal left the photo on the profile';
  end if;
  -- The ride name and the rest of the profile are untouched.
  if (select display_name from profiles where id = '00000000-0000-0000-0000-0000000a7a01') <> 'Pia Photo' then
    raise exception 'FAIL: photo removal changed the ride name';
  end if;
end $$;

select 'PROFILE PHOTO TESTS PASSED';
