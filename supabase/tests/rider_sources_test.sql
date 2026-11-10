-- Where riders found OnMyLead (20261110300000_rider_sources.sql). Runs after privacy_test.sql
-- (as_user), pro_test.sql (expect_error) and admin_growth_test.sql (as_session).
-- Each block raises an exception if a rule is broken.

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000f5a01', 'src-owner@example.test', '{"full_name":"Sam Owner"}'),
  ('00000000-0000-0000-0000-0000000f5a02', 'src-fb@example.test', '{"full_name":"Fay Facebook"}'),
  ('00000000-0000-0000-0000-0000000f5a03', 'src-web@example.test', '{"full_name":"Wes Website"}');
insert into admin_users (user_id) values ('00000000-0000-0000-0000-0000000f5a01');

-- Fay answers Facebook on her phone; she can't pick a made-up answer, and can't read the table.
select as_user('00000000-0000-0000-0000-0000000f5a02');
set role authenticated;
select set_my_found_us('facebook', null, null, 'ios');
select expect_error($$select set_my_found_us('myspace', null, null, 'ios')$$, '%unknown answer%', 'FAIL: unknown answer accepted');
do $$ begin
  -- Revoked, and row level security with no policies: a rider never sees a row, even their own.
  begin
    if (select count(*) from rider_sources) > 0 then raise exception 'FAIL: riders can read rider_sources'; end if;
  exception when insufficient_privilege then null;
  end;
  if not my_found_us_answered() then raise exception 'FAIL: answer not saved'; end if;
end $$;
reset role;

-- Wes signs up on the website from a Facebook ad (campaign kept), skips, then answers Other.
select as_user('00000000-0000-0000-0000-0000000f5a03');
set role authenticated;
select set_my_found_us(null, null, '{"source":"Facebook","medium":"paid_social","campaign":"Carousel Nov <b>","click":"meta"}', 'web');
do $$ begin
  if my_found_us_answered() then raise exception 'FAIL: campaign alone counted as an answer'; end if;
end $$;
select set_my_found_us('skipped', null, null, 'web');
select set_my_found_us('other', '  A trail sign at Hatfield-McCoy  ', '{"source":"tiktok","campaign":"later"}', 'web');
reset role;
do $$
declare r rider_sources;
begin
  select * into r from rider_sources where user_id = '00000000-0000-0000-0000-0000000f5a03';
  if r.answer <> 'other' or r.detail <> 'A trail sign at Hatfield-McCoy' then raise exception 'FAIL: other answer %', r; end if;
  if r.utm_source <> 'facebook' or r.utm_campaign <> 'carousel nov b' or r.click <> 'meta' then raise exception 'FAIL: first campaign not kept %', r; end if;
end $$;

-- Only an admin reads the counts; test and admin accounts are left out.
select as_user('00000000-0000-0000-0000-0000000f5a02');
set role authenticated;
select expect_error($$select admin_found_us(null, null)$$, '%', 'FAIL: rider read admin_found_us');
reset role;
select as_session('00000000-0000-0000-0000-0000000f5a01', 'aal2');
set role authenticated;
do $$
declare s jsonb;
begin
  perform set_my_found_us('google', null, null, 'web');  -- the owner's own answer is left out of the counts
  s := admin_found_us(now() - interval '1 hour', now() + interval '1 minute');
  if not exists (select 1 from jsonb_array_elements(s -> 'answers') a where a ->> 'answer' = 'facebook' and (a ->> 'riders')::int >= 1) then
    raise exception 'FAIL: facebook answer missing %', s;
  end if;
  if exists (select 1 from jsonb_array_elements(s -> 'answers') a where a ->> 'answer' = 'google') then
    raise exception 'FAIL: admin answer counted %', s;
  end if;
  if not exists (select 1 from jsonb_array_elements(s -> 'campaigns') c where c ->> 'source' = 'facebook' and c ->> 'campaign' = 'carousel nov b') then
    raise exception 'FAIL: campaign missing %', s;
  end if;
  if not (s -> 'other') ? 'A trail sign at Hatfield-McCoy' then raise exception 'FAIL: other write-in missing %', s; end if;
end $$;
reset role;
