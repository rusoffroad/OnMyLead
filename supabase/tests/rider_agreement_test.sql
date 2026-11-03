-- Rider Safety and Liability Agreement (migration 20261102700000_rider_agreement.sql): what gets
-- saved, who can read it, and that nobody can change or delete it. Runs after admin_test.sql
-- (run_local.sh): as_user, expect_refused and as_admin_session come from earlier tests.
--
-- Riders (new here):
--   Ada  0a91  agrees on her phone
--   Ben  0a92  agrees before signing in, from an app showing different text
--   Cal  0a93  never agrees, then deletes his account... after agreeing
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000a91', 'ada@example.com', '{"full_name":"Ada Agree"}'),
  ('00000000-0000-0000-0000-000000000a92', 'ben@example.com', '{"full_name":"Ben Before"}'),
  ('00000000-0000-0000-0000-000000000a93', 'cal@example.com', '{"full_name":"Cal Gone"}');

-- A1. Version 1 is published with the fingerprint of its own text, and anyone can read it.
do $$
declare v rider_agreements;
begin
  select * into v from rider_agreements where version = 1;
  if v.body_sha256 <> encode(sha256(convert_to(v.body, 'UTF8')), 'hex') then raise exception 'FAIL: v1 fingerprint'; end if;
  if v.body not like 'Rider Safety and Liability Agreement (version 1, effective November 3, 2026)%' then raise exception 'FAIL: v1 title line'; end if;
end $$;
select as_user(null);
set role anon;
do $$ begin
  if (select count(*) from rider_agreements) < 1 then raise exception 'FAIL: anon cannot read the agreement'; end if;
end $$;
select expect_refused($q$select accept_rider_agreement(1, 'x')$q$, 'anon accepted');
reset role;

-- A2. Ada agrees with the published text. One row, matching, with her email and the device facts;
-- a retry returns the same record instead of a second row.
select as_user('00000000-0000-0000-0000-000000000a91');
select set_config('request.headers', '{"x-forwarded-for":"203.0.113.7, 10.0.0.1","user-agent":"OnMyLead/2.0 iOS"}', false);
set role authenticated;
do $$
declare v jsonb; t text := (select body from rider_agreements where version = 1); n int;
begin
  if (my_rider_agreement() ->> 'version') is not null then raise exception 'FAIL: Ada agreed before agreeing'; end if;
  if (my_rider_agreement() ->> 'current')::int <> 1 then raise exception 'FAIL: current version'; end if;
  v := accept_rider_agreement(1, t, now() - interval '5 seconds', false, 'ios', '2.0', '8', 'iPhone 16 Pro', '27.0', 'en-US');
  if (v ->> 'matches')::boolean is not true then raise exception 'FAIL: published text should match %', v; end if;
  perform accept_rider_agreement(1, t);
  select count(*) into n from rider_agreement_acceptances;
  if n <> 1 then raise exception 'FAIL: Ada should see exactly her one row, got %', n; end if;
  if (my_rider_agreement() ->> 'version')::int <> 1 then raise exception 'FAIL: my_rider_agreement after agreeing'; end if;
end $$;
-- Unknown versions and empty text are refused.
select expect_refused($q$select accept_rider_agreement(99, 'x')$q$, 'unknown version accepted');
select expect_refused($q$select accept_rider_agreement(1, '')$q$, 'empty text accepted');
-- Riders can't write, change or delete records directly.
select expect_refused($q$insert into rider_agreement_acceptances (user_id, agreement_version, text_sha256, text_matches) values (auth.uid(), 1, 'x', true)$q$, 'rider inserted a record');
-- (Supabase never grants riders update or delete here; privacy_test.sql grants every table to
-- authenticated, so here the row level security has to stop it: refused or no effect.)
do $$ begin
  begin update rider_agreement_acceptances set email = 'x' where user_id = auth.uid(); exception when others then null; end;
  begin delete from rider_agreement_acceptances where user_id = auth.uid(); exception when others then null; end;
  begin update rider_agreements set body = 'nothing' where version = 1; exception when others then null; end;
end $$;
reset role;
do $$ begin
  if (select email from rider_agreement_acceptances where user_id = '00000000-0000-0000-0000-000000000a91') is distinct from 'ada@example.com' then
    raise exception 'FAIL: rider changed or deleted her record';
  end if;
  if (select body from rider_agreements where version = 1) = 'nothing' then raise exception 'FAIL: rider changed the agreement'; end if;
end $$;
select set_config('request.headers', '', false);
do $$
declare r rider_agreement_acceptances;
begin
  select * into r from rider_agreement_acceptances where user_id = '00000000-0000-0000-0000-000000000a91';
  if r.email <> 'ada@example.com' or r.platform <> 'ios' or r.app_version <> '2.0' or r.app_build <> '8'
     or r.device <> 'iPhone 16 Pro' or r.ip_address <> '203.0.113.7' or r.user_agent <> 'OnMyLead/2.0 iOS'
     or r.shown_text is not null or r.device_accepted_at is null or r.before_sign_in then
    raise exception 'FAIL: Ada''s record is missing facts: %', to_jsonb(r);
  end if;
  if r.text_sha256 <> (select body_sha256 from rider_agreements where version = 1) then raise exception 'FAIL: fingerprint'; end if;
end $$;

-- A3. Ben agreed before signing in, on an app showing other words: saved as not matching, with
-- the text he saw. Ada can't see Ben's row.
select as_user('00000000-0000-0000-0000-000000000a92');
set role authenticated;
do $$
declare v jsonb;
begin
  v := accept_rider_agreement(1, 'Some other words', now() - interval '1 hour', true, 'android', '2.0', '8');
  if (v ->> 'matches')::boolean is not false then raise exception 'FAIL: other text should not match'; end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-000000000a91');
set role authenticated;
do $$ begin
  if exists (select 1 from rider_agreement_acceptances where user_id = '00000000-0000-0000-0000-000000000a92') then
    raise exception 'FAIL: Ada can read Ben''s record';
  end if;
end $$;
reset role;
do $$ begin
  if (select shown_text from rider_agreement_acceptances where user_id = '00000000-0000-0000-0000-000000000a92') <> 'Some other words'
     or not (select before_sign_in from rider_agreement_acceptances where user_id = '00000000-0000-0000-0000-000000000a92') then
    raise exception 'FAIL: Ben''s record';
  end if;
end $$;

-- A4. Append-only for everyone, the table owner included, and the published text is frozen.
select expect_refused($q$update rider_agreement_acceptances set email = 'x'$q$, 'owner edited a record');
select expect_refused($q$delete from rider_agreement_acceptances$q$, 'owner deleted records');
select expect_refused($q$truncate rider_agreement_acceptances$q$, 'owner truncated records');
select expect_refused($q$delete from rider_agreements where version = 1$q$, 'owner removed the agreement');
select expect_refused($q$update rider_agreements set body = 'x'$q$, 'owner changed the agreement');

-- A5. Cal agrees, then deletes his account: the record stays, with his email.
select as_user('00000000-0000-0000-0000-000000000a93');
set role authenticated;
select accept_rider_agreement(1, (select body from rider_agreements where version = 1));
reset role;
delete from auth.users where id = '00000000-0000-0000-0000-000000000a93';
do $$ begin
  if (select email from rider_agreement_acceptances where user_id = '00000000-0000-0000-0000-000000000a93') <> 'cal@example.com' then
    raise exception 'FAIL: record gone after account deletion';
  end if;
end $$;

-- A6. Admin: riders and admins without the authenticator code are refused; the Admin with it
-- sees every record (deleted accounts marked), searches by email, and each export is logged.
select as_admin_session('00000000-0000-0000-0000-000000000a91', 'aal2');
set role authenticated;
select expect_refused($q$select admin_rider_agreements()$q$, 'rider listed agreements');
select expect_refused($q$select admin_rider_agreement_export(now() - interval '1 day', now() + interval '1 day')$q$, 'rider exported agreements');
reset role;
select as_admin_session('00000000-0000-0000-0000-00000000ad01', 'aal1');
set role authenticated;
select expect_refused($q$select admin_rider_agreements()$q$, 'admin without two-factor listed agreements');
reset role;
select as_admin_session('00000000-0000-0000-0000-00000000ad01', 'aal2');
set role authenticated;
do $$
declare v jsonb; e jsonb;
begin
  v := admin_rider_agreements();
  if (v ->> 'total')::int <> 3 or (v ->> 'current_version')::int <> 1 then raise exception 'FAIL: admin list %', v; end if;
  if (select count(*) from jsonb_array_elements(v -> 'rows') r where (r ->> 'account_deleted')::boolean) <> 1 then
    raise exception 'FAIL: deleted account not marked';
  end if;
  if (admin_rider_agreements('ben@') ->> 'total')::int <> 1 then raise exception 'FAIL: search by email'; end if;
  if (admin_rider_agreements(null, '00000000-0000-0000-0000-000000000a91') ->> 'total')::int <> 1 then raise exception 'FAIL: one rider'; end if;
  e := admin_rider_agreement_export(now() - interval '1 day', now() + interval '1 day');
  if jsonb_array_length(e) <> 3 then raise exception 'FAIL: export rows %', jsonb_array_length(e); end if;
end $$;
reset role;
do $$ begin
  if not exists (select 1 from admin_audit_log where action = 'export_csv' and target_id = 'rider_agreements') then
    raise exception 'FAIL: export not in the audit log';
  end if;
end $$;
select set_config('request.jwt.claims', '', false);
select as_user(null);
