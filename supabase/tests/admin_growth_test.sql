-- Admin Dashboard Growth page (migration 20261030000000_admin_growth.sql): real riders without
-- test and admin accounts, marking test accounts, and store downloads. Runs last (run_local.sh),
-- after the files that set up as_user, as_session and expect_error, so counts are checked as
-- changes from a baseline. Each block raises an exception if a rule is broken.

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-0000-0000-000000000ea1', 'owner-g@example.test', '{"full_name":"Gail Owner"}', '{"provider":"email"}'),
  ('00000000-0000-0000-0000-000000000ea2', 'rider-g@example.test', '{"full_name":"Rae Rider"}', '{"provider":"apple"}'),
  ('00000000-0000-0000-0000-000000000ea3', 'qa-g@example.test', '{"full_name":"Quinn QA"}', '{"provider":"google"}');
insert into admin_users (user_id) values ('00000000-0000-0000-0000-000000000ea1');

create table _growth_base (k text primary key, v numeric not null);
grant select, insert on _growth_base to authenticated;
select as_session('00000000-0000-0000-0000-000000000ea1', 'aal2');
set role authenticated;
do $$
declare
  s jsonb := admin_growth_summary(now() - interval '1 hour', now() + interval '1 minute');
  r record;
begin
  -- Gail is an admin: left out. Rae and Quinn are riders until Quinn is marked.
  if (s ->> 'accounts_total')::int - (s ->> 'test_accounts')::int <> (s ->> 'riders_total')::int then
    raise exception 'FAIL: riders = accounts - test (%)', s;
  end if;
  if not exists (select 1 from jsonb_array_elements(s -> 'test_list') t where t ->> 'user_id' = '00000000-0000-0000-0000-000000000ea1' and t ->> 'reason' = 'admin') then
    raise exception 'FAIL: admin not listed as test account';
  end if;
  if exists (select 1 from jsonb_array_elements(s -> 'test_list') t where t ->> 'user_id' = '00000000-0000-0000-0000-000000000ea2') then
    raise exception 'FAIL: rider listed as test account';
  end if;
  insert into _growth_base values ('riders', (s ->> 'riders_total')::int), ('new', (s ->> 'riders_new')::int);
  if not exists (select 1 from jsonb_array_elements(s -> 'by_method') m where m ->> 'method' = 'apple') then
    raise exception 'FAIL: sign-in method missing: %', s -> 'by_method';
  end if;
  -- Series: the last bucket's running total equals riders_total.
  select * into r from admin_growth_series(now() - interval '3 days', now() + interval '1 minute', 'day') order by bucket_start desc limit 1;
  if r.total_riders <> (s ->> 'riders_total')::int then raise exception 'FAIL: running total % vs %', r.total_riders, s ->> 'riders_total'; end if;
  if (select sum(new_riders) from admin_growth_series(now() - interval '1 hour', now() + interval '1 minute', 'day')) <> (s ->> 'riders_new')::int then
    raise exception 'FAIL: series new riders differ from summary';
  end if;

  -- Mark Quinn as a test account: one rider fewer, and it is logged.
  perform admin_set_test_account('00000000-0000-0000-0000-000000000ea3', true, 'QA phone');
  s := admin_growth_summary(now() - interval '1 hour', now() + interval '1 minute');
  if (s ->> 'riders_total')::int <> (select v from _growth_base where k = 'riders') - 1 then raise exception 'FAIL: marking did not remove the rider'; end if;
  if not exists (select 1 from jsonb_array_elements(s -> 'test_list') t where t ->> 'user_id' = '00000000-0000-0000-0000-000000000ea3' and t ->> 'note' = 'QA phone') then
    raise exception 'FAIL: marked account not listed';
  end if;
  if (select sum(new_test_accounts) from admin_growth_series(now() - interval '1 hour', now() + interval '1 minute', 'day')) < 2 then
    raise exception 'FAIL: test accounts per day';
  end if;
  perform admin_set_test_account('00000000-0000-0000-0000-000000000ea3', false);
  s := admin_growth_summary(now() - interval '1 hour', now() + interval '1 minute');
  if (s ->> 'riders_total')::int <> (select v from _growth_base where k = 'riders') then raise exception 'FAIL: unmarking did not restore the rider'; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from admin_audit_log where target_id = '00000000-0000-0000-0000-000000000ea3' and action in ('user.mark_test', 'user.unmark_test')) <> 2 then
    raise exception 'FAIL: test-account changes not in the audit log';
  end if;
end $$;

-- Downloads: rows the edge function writes with the service role.
insert into store_downloads (store, day, device, downloads, redownloads, updates, uninstalls) values
  ('apple', current_date - 1, 'iPhone', 5, 1, 2, null),
  ('apple', current_date - 1, 'iPad', 2, 0, 0, null),
  ('apple', current_date - 40, 'iPhone', 9, 0, 0, null),
  ('google', current_date - 2, 'Android', 4, 0, 1, 1);
insert into store_download_imports (store, checked_at, ok_at, latest_day) values ('apple', now(), now(), current_date - 1);
set role authenticated;
do $$
declare
  d jsonb := admin_downloads(now() - interval '7 days', now() + interval '1 minute', 'day');
begin
  if (d #>> '{stores,apple,downloads}')::int <> 7 then raise exception 'FAIL: apple downloads in range: %', d -> 'stores'; end if;
  if (d #>> '{stores,apple,all_time}')::int <> 16 then raise exception 'FAIL: apple all time'; end if;
  if (d #>> '{stores,google,downloads}')::int <> 4 or (d #>> '{stores,google,uninstalls}')::int <> 1 then raise exception 'FAIL: google downloads'; end if;
  if d #>> '{stores,google,ok_at}' is not null then raise exception 'FAIL: google shows connected'; end if;
  if d #>> '{stores,apple,ok_at}' is null then raise exception 'FAIL: apple not connected'; end if;
  if (select sum((p ->> 'apple')::int + (p ->> 'google')::int) from jsonb_array_elements(d -> 'series') p) <> 11 then
    raise exception 'FAIL: series total: %', d -> 'series';
  end if;
  if (select count(*) from jsonb_array_elements(d -> 'by_device')) <> 3 then raise exception 'FAIL: devices: %', d -> 'by_device'; end if;
  if (select sum((p ->> 'apple')::int) from jsonb_array_elements(admin_downloads(now() - interval '60 days', now(), 'week') -> 'series') p) <> 16 then
    raise exception 'FAIL: weekly series';
  end if;
end $$;
-- Riders can't read the store tables or call the functions.
select as_user('00000000-0000-0000-0000-000000000ea2');
set role authenticated;
select expect_error($q$select admin_downloads(now() - interval '1 day', now(), 'day')$q$, '%admin%', 'rider reads downloads');
select expect_error($q$select admin_set_test_account('00000000-0000-0000-0000-000000000ea2', true)$q$, '%admin%', 'rider marks test account');
do $$ begin
  if exists (select 1 from store_downloads) then raise exception 'FAIL: rider reads store_downloads'; end if;
  if exists (select 1 from admin_test_accounts) then raise exception 'FAIL: rider reads admin_test_accounts'; end if;
end $$;
reset role;
-- Without a second factor, refused.
select as_session('00000000-0000-0000-0000-000000000ea1', 'aal1');
set role authenticated;
select expect_error($q$select admin_growth_summary(null, null)$q$, '%two-factor%', 'growth without aal2');
reset role;
select as_user(null);
select set_config('request.jwt.claims', '', false);
