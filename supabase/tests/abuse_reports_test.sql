-- Report a rider for abuse (20261102800000_abuse_reports.sql). Runs after out_riding_test.sql
-- (riders 701 and 702 have a direct message conversation) and admin_test.sql (admin ad01).
-- Each block raises an exception if a rule is broken.

-- A1. Rider 701 reports 702 from their direct messages, with the new source column.
select as_user('00000000-0000-0000-0000-000000000701');
set role authenticated;
insert into reports (kind, reported_user_id, reason, details, source)
values ('rider', '00000000-0000-0000-0000-000000000702', 'Harassment', 'Keeps messaging me', 'dm');
-- An older build sends no source and still works.
insert into reports (kind, reported_user_id, reason)
values ('rider', '00000000-0000-0000-0000-000000000702', 'Spam or Scam');
select expect_refused(
  $q$insert into reports (kind, reported_user_id, reason, source) values ('rider', '00000000-0000-0000-0000-000000000702', 'Spam', 'nowhere')$q$,
  'report with an unknown source');
reset role;

-- A2. The conversation was copied: every message 702 sent to 701 (D6 sent ten), named.
do $$
declare v_report uuid; n int;
begin
  select id into v_report from reports where reporter_id = '00000000-0000-0000-0000-000000000701' and source = 'dm';
  select count(*) into n from report_messages where report_id = v_report and source = 'dm'
    and sender_id = '00000000-0000-0000-0000-000000000702' and body like 'msg %';
  if n < 10 then raise exception 'FAIL: conversation not copied (% messages)', n; end if;
  if exists (select 1 from report_messages where report_id = v_report and sender_id is not null and sender_name is null
             and exists (select 1 from profiles p where p.id = sender_id and p.display_name is not null)) then
    raise exception 'FAIL: copied messages lost the sender name';
  end if;
end $$;

-- A3. Deleting the conversation afterwards doesn't remove the copy.
delete from dm_threads where '00000000-0000-0000-0000-000000000702' in (user_lo, user_hi);
do $$ begin
  if (select count(*) from report_messages m join reports r on r.id = m.report_id
      where r.reporter_id = '00000000-0000-0000-0000-000000000701' and m.source = 'dm') < 10 then
    raise exception 'FAIL: copy went with the conversation';
  end if;
end $$;

-- A4. Nobody but the admin reads the copy: not the reporter, not the reported rider, not visitors.
-- (privacy_test.sql grants every table to authenticated, so this leans on row level security.)
select as_user('00000000-0000-0000-0000-000000000701');
set role authenticated;
do $$ begin
  if (select count(*) from report_messages) <> 0 then raise exception 'FAIL: reporter read the copied conversation'; end if;
end $$;
select expect_refused($q$select admin_report((select id from reports limit 1))$q$, 'rider opened a report in the dashboard');
select expect_refused($q$select report_email((select id from reports limit 1))$q$, 'rider read the owner email');
select expect_refused($q$insert into report_messages (report_id, source, body, sent_at) values ((select id from reports limit 1), 'dm', 'fake', now())$q$, 'rider added to a copy');
reset role;
select as_user('00000000-0000-0000-0000-000000000702');
set role authenticated;
do $$ begin
  if (select count(*) from report_messages) <> 0 then raise exception 'FAIL: reported rider read the copy'; end if;
end $$;
reset role;
select as_user(null);
set role anon;
select expect_refused($q$select count(*) from report_messages$q$, 'anonymous read of copied messages');
reset role;

-- A5. The admin (with an authenticator code) opens it, sees the messages, and it's audit logged.
select as_admin_session('00000000-0000-0000-0000-00000000ad01', 'aal2');
do $$
declare v jsonb; v_list jsonb; v_id uuid;
begin
  select id into v_id from reports where reporter_id = '00000000-0000-0000-0000-000000000701' and source = 'dm';
  v := admin_report(v_id);
  if jsonb_array_length(v -> 'messages') < 10 then raise exception 'FAIL: admin_report missing messages'; end if;
  if v ->> 'source' <> 'dm' or (v ->> 'reports_on_user')::int < 2 then raise exception 'FAIL: admin_report details wrong: %', v; end if;
  if not exists (select 1 from admin_audit_log where action = 'report.view' and target_id = v_id::text) then
    raise exception 'FAIL: opening a report was not audit logged';
  end if;
  v_list := admin_reports('open', 0, 50);
  if not exists (select 1 from jsonb_array_elements(v_list -> 'rows') r where r ->> 'id' = v_id::text and (r ->> 'messages_copied')::int >= 10) then
    raise exception 'FAIL: admin_reports missing messages_copied';
  end if;
end $$;
select as_user(null);
reset role;

-- A6. The owner email details (service role only, read by notify-ride-message).
do $$
declare v jsonb;
begin
  v := report_email((select id from reports where reporter_id = '00000000-0000-0000-0000-000000000701' and source = 'dm'));
  if v ->> 'reason' <> 'Harassment' or (v ->> 'messages_copied')::int < 10 then raise exception 'FAIL: report_email wrong: %', v; end if;
end $$;

-- A7. A ride report copies nothing.
do $$ begin
  if exists (select 1 from report_messages m join reports r on r.id = m.report_id where r.kind = 'ride') then
    raise exception 'FAIL: a ride report copied messages';
  end if;
end $$;

-- A8. Group and ride chats: Kim (owner of the group, so no member row) reports Lou. Only Kim's and
-- Lou's own messages are copied, never a third rider's (Max), and nothing older than 30 days.
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000a81', '{"full_name":"Kim Owner"}'),
  ('00000000-0000-0000-0000-000000000a82', '{"full_name":"Lou Reported"}'),
  ('00000000-0000-0000-0000-000000000a83', '{"full_name":"Max Bystander"}');
insert into riding_groups (id, owner_id, name) values ('8a8a8a8a-8a8a-8a8a-8a8a-8a8a8a8a8a8a', '00000000-0000-0000-0000-000000000a81', 'Hill Country');
insert into riding_group_members (group_id, user_id) values
  ('8a8a8a8a-8a8a-8a8a-8a8a-8a8a8a8a8a8a', '00000000-0000-0000-0000-000000000a82'),
  ('8a8a8a8a-8a8a-8a8a-8a8a-8a8a8a8a8a8a', '00000000-0000-0000-0000-000000000a83');
insert into group_messages (group_id, user_id, body, created_at) values
  ('8a8a8a8a-8a8a-8a8a-8a8a-8a8a8a8a8a8a', '00000000-0000-0000-0000-000000000a82', 'group threat', now()),
  ('8a8a8a8a-8a8a-8a8a-8a8a-8a8a8a8a8a8a', '00000000-0000-0000-0000-000000000a81', 'group reply', now()),
  ('8a8a8a8a-8a8a-8a8a-8a8a-8a8a8a8a8a8a', '00000000-0000-0000-0000-000000000a83', 'bystander says hi', now()),
  ('8a8a8a8a-8a8a-8a8a-8a8a-8a8a8a8a8a8a', '00000000-0000-0000-0000-000000000a82', 'too old', now());
-- The insert guard stamps created_at with now(), so age it afterwards.
update group_messages set created_at = now() - interval '40 days' where body = 'too old';
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility)
values ('8b8b8b8b-8b8b-8b8b-8b8b-8b8b8b8b8b8b', '00000000-0000-0000-0000-000000000a81', 'Reveille Peak', now() - interval '1 day', 30.6, -98.3, 'public');
insert into ride_members (ride_id, user_id, status) values
  ('8b8b8b8b-8b8b-8b8b-8b8b-8b8b8b8b8b8b', '00000000-0000-0000-0000-000000000a82', 'joined'),
  ('8b8b8b8b-8b8b-8b8b-8b8b-8b8b8b8b8b8b', '00000000-0000-0000-0000-000000000a83', 'joined')
on conflict do nothing;
insert into ride_messages (ride_id, user_id, body) values
  ('8b8b8b8b-8b8b-8b8b-8b8b-8b8b8b8b8b8b', '00000000-0000-0000-0000-000000000a82', 'ride threat'),
  ('8b8b8b8b-8b8b-8b8b-8b8b-8b8b8b8b8b8b', '00000000-0000-0000-0000-000000000a83', 'bystander ride msg');

select as_user('00000000-0000-0000-0000-000000000a81');
set role authenticated;
insert into reports (kind, reported_user_id, reason, source, group_id)
values ('rider', '00000000-0000-0000-0000-000000000a82', 'Threats', 'group_chat', '8a8a8a8a-8a8a-8a8a-8a8a-8a8a8a8a8a8a');
reset role;
do $$
declare v_report uuid;
begin
  select id into v_report from reports where reporter_id = '00000000-0000-0000-0000-000000000a81';
  if not exists (select 1 from report_messages where report_id = v_report and source = 'group_chat' and body = 'group threat' and source_name = 'Hill Country') then
    raise exception 'FAIL: group chat message from the reported rider not copied';
  end if;
  if not exists (select 1 from report_messages where report_id = v_report and source = 'group_chat' and body = 'group reply') then
    raise exception 'FAIL: reporter''s own group message not copied';
  end if;
  if not exists (select 1 from report_messages where report_id = v_report and source = 'ride_chat' and body = 'ride threat') then
    raise exception 'FAIL: ride chat message not copied';
  end if;
  if exists (select 1 from report_messages where report_id = v_report and (body like 'bystander%' or body = 'too old')) then
    raise exception 'FAIL: copied a third rider''s message or one older than 30 days';
  end if;
  if exists (select 1 from report_messages where report_id = v_report and source = 'dm') then
    raise exception 'FAIL: copied direct messages that don''t exist';
  end if;
end $$;

-- A9. A report about someone with no shared chats still saves (nothing to copy).
select as_user('00000000-0000-0000-0000-000000000a83');
set role authenticated;
insert into reports (kind, reported_user_id, reason, source) values ('rider', '00000000-0000-0000-0000-000000000701', 'Fake Account', 'you');
reset role;
do $$ begin
  if not exists (select 1 from reports where reporter_id = '00000000-0000-0000-0000-000000000a83' and source = 'you') then
    raise exception 'FAIL: report with nothing to copy was not saved';
  end if;
end $$;

select 'ALL ABUSE REPORT TESTS PASSED' as result;
