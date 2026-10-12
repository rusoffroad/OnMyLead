-- Report Ride / Report Rider: reporters can file reports and never read them back.
-- Runs after privacy_test.sql (run_local.sh), which sets up as_user and expect_refused, and
-- grants every table to authenticated, so these checks lean on row level security alone.
-- Each block raises an exception if a privacy rule is broken.

-- R1. Ben (on Olivia's ride) reports the ride and reports Olivia.
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
insert into reports (kind, ride_id, reason, details)
values ('ride', '11111111-1111-1111-1111-111111111111', 'Unsafe Plan', 'Route crosses a closed road');
insert into reports (kind, reported_user_id, ride_id, reason)
values ('rider', '00000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'Harassment');
-- R2. ...but can't read them back, change them or delete them.
do $$ begin
  if (select count(*) from reports) <> 0 then raise exception 'FAIL: reporter read reports back'; end if;
end $$;
update reports set status = 'dismissed';
delete from reports;
reset role;
do $$ begin
  if (select count(*) from reports where reporter_id = '00000000-0000-0000-0000-00000000000b' and status = 'open') <> 2 then
    raise exception 'FAIL: reports not filed, or changed by the reporter';
  end if;
end $$;

-- R3. No reports in someone else's name, pre-resolved, about yourself, or missing a target.
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
select expect_refused(
  $q$insert into reports (reporter_id, kind, ride_id, reason) values ('00000000-0000-0000-0000-00000000000c', 'ride', '11111111-1111-1111-1111-111111111111', 'Spam')$q$,
  'filed a report in someone else''s name');
select expect_refused(
  $q$insert into reports (kind, ride_id, reason, status) values ('ride', '11111111-1111-1111-1111-111111111111', 'Spam', 'resolved')$q$,
  'filed an already resolved report');
select expect_refused(
  $q$insert into reports (kind, reported_user_id, reason) values ('rider', '00000000-0000-0000-0000-00000000000b', 'Spam')$q$,
  'reported themselves');
select expect_refused($q$insert into reports (kind, reason) values ('rider', 'Spam')$q$, 'report with no rider');
select expect_refused($q$insert into reports (kind, reason) values ('ride', 'Spam')$q$, 'report with no ride');
reset role;

-- R4. Signed-out visitors can't file or read reports.
select as_user(null);
set role anon;
select expect_refused($q$insert into reports (kind, ride_id, reason) values ('ride', '11111111-1111-1111-1111-111111111111', 'Spam')$q$, 'anonymous report');
select expect_refused($q$select count(*) from reports$q$, 'anonymous read of reports');
reset role;

-- R5. Ten an hour, then refused.
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
insert into reports (kind, ride_id, reason) select 'ride', '11111111-1111-1111-1111-111111111111', 'Spam' from generate_series(1, 10);
select expect_refused($q$insert into reports (kind, ride_id, reason) values ('ride', '11111111-1111-1111-1111-111111111111', 'Spam')$q$, 'eleventh report in an hour');
reset role;

-- Clean up the rate limit fixture.
delete from reports where reporter_id = '00000000-0000-0000-0000-00000000000c';

select 'ALL REPORT TESTS PASSED' as result;
