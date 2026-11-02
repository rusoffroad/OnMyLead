-- Notifications inbox (migration 20261102100000_notification_inbox.sql): what gets saved, who
-- can read it, and clearing. Runs after privacy_test.sql (run_local.sh): as_user and
-- expect_refused come from there.
--
-- Riders (new here):
--   Ivy  0e01  organizes the ride
--   Jon  0e02  on the ride, has a phone registered
--   Kim  0e03  on the ride, has a phone registered, blocks Ivy
--   Lee  0e04  not on the ride, has a phone registered
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000e01', '{"full_name":"Ivy Inbox"}'),
  ('00000000-0000-0000-0000-000000000e02', '{"full_name":"Jon Inbox"}'),
  ('00000000-0000-0000-0000-000000000e03', '{"full_name":"Kim Inbox"}'),
  ('00000000-0000-0000-0000-000000000e04', '{"full_name":"Lee Inbox"}');
insert into push_tokens (user_id, token, platform) values
  ('00000000-0000-0000-0000-000000000e02', 'jon-phone-00000000000000000000', 'ios'),
  ('00000000-0000-0000-0000-000000000e02', 'jon-tablet-0000000000000000000', 'android'),
  ('00000000-0000-0000-0000-000000000e03', 'kim-phone-00000000000000000000', 'android'),
  ('00000000-0000-0000-0000-000000000e04', 'lee-phone-00000000000000000000', 'ios');

create function inbox_of(p_user text) returns table (kind text, title text, body text, count int, unread boolean)
language plpgsql as $$
begin
  perform as_user(p_user::uuid);
  execute 'set local role authenticated';
  return query select n.kind, n.title, n.body, n.count, n.read_at is null from rider_notifications n order by n.created_at desc, n.title;
  execute 'reset role';
end $$;

select as_user('00000000-0000-0000-0000-000000000e01');
set role authenticated;
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility)
values ('0e0e0e0e-0e0e-0e0e-0e0e-0e0e0e0e0e0e', auth.uid(), 'Inbox Ride', now() + interval '1 day', 38.5, -109.5, 'public');
reset role;
select as_user('00000000-0000-0000-0000-000000000e02');
set role authenticated;
select join_ride('0e0e0e0e-0e0e-0e0e-0e0e-0e0e0e0e0e0e');
reset role;
select as_user('00000000-0000-0000-0000-000000000e03');
set role authenticated;
select join_ride('0e0e0e0e-0e0e-0e0e-0e0e-0e0e0e0e0e0e');
insert into blocked_riders (blocker_id, blocked_id) values (auth.uid(), '00000000-0000-0000-0000-000000000e01');
reset role;

-- N1. Ivy chats twice: Jon gets one row (not one per phone) that counts both; Kim blocked Ivy and
-- gets nothing; Lee isn't on the ride.
select as_user('00000000-0000-0000-0000-000000000e01');
set role authenticated;
insert into ride_messages (id, ride_id, user_id, kind, body)
values ('0e0e0000-0000-0000-0000-000000000001', '0e0e0e0e-0e0e-0e0e-0e0e-0e0e0e0e0e0e', auth.uid(), 'chat', 'Meet at the gas station');
insert into ride_messages (id, ride_id, user_id, kind, body)
values ('0e0e0000-0000-0000-0000-000000000002', '0e0e0e0e-0e0e-0e0e-0e0e-0e0e0e0e0e0e', auth.uid(), 'chat', 'Bring water');
reset role;
do $$
declare v record;
begin
  if (select count(*) from inbox_of('00000000-0000-0000-0000-000000000e02') where kind = 'message') <> 1 then
    raise exception 'FAIL: chat should fold into one row, got %', (select count(*) from inbox_of('00000000-0000-0000-0000-000000000e02'));
  end if;
  select * into v from inbox_of('00000000-0000-0000-0000-000000000e02') where kind = 'message';
  if v.count <> 2 or v.body <> 'Bring water' or not v.unread then raise exception 'FAIL: folded chat row %', v; end if;
  if exists (select 1 from inbox_of('00000000-0000-0000-0000-000000000e03') where kind = 'message') then
    raise exception 'FAIL: a rider who blocked the sender got the chat';
  end if;
  if exists (select 1 from inbox_of('00000000-0000-0000-0000-000000000e04')) then raise exception 'FAIL: a stranger got the chat'; end if;
  if exists (select 1 from inbox_of('00000000-0000-0000-0000-000000000e01') where kind = 'message') then
    raise exception 'FAIL: the sender got their own chat';
  end if;
end $$;

-- N2. Jon taps Need Help: Ivy and Kim get it (blocks never stop help). Cancelling replaces it.
select as_user('00000000-0000-0000-0000-000000000e02');
set role authenticated;
insert into rider_statuses (id, ride_id, user_id, status)
values ('0e0e0000-0000-0000-0000-000000000003', '0e0e0e0e-0e0e-0e0e-0e0e-0e0e0e0e0e0e', auth.uid(), 'need_help');
reset role;
-- Ivy has no phone registered, so she has no row (the inbox mirrors what was sent).
do $$ begin
  if (select title from inbox_of('00000000-0000-0000-0000-000000000e03') where kind = 'status') <> 'Jon Inbox needs help' then
    raise exception 'FAIL: Need Help not in the inbox';
  end if;
end $$;
select as_user('00000000-0000-0000-0000-000000000e02');
set role authenticated;
select cancel_ride_item('0e0e0000-0000-0000-0000-000000000003');
reset role;
do $$ begin
  if exists (select 1 from inbox_of('00000000-0000-0000-0000-000000000e03') where kind = 'status') then
    raise exception 'FAIL: the cancelled Need Help is still there';
  end if;
  if (select count(*) from inbox_of('00000000-0000-0000-0000-000000000e03') where kind = 'cancelled') <> 1 then
    raise exception 'FAIL: the cancellation is missing';
  end if;
end $$;

-- N3. Riders read only their own rows and can't write them directly.
select as_user('00000000-0000-0000-0000-000000000e04');
set role authenticated;
do $$ begin
  if exists (select 1 from rider_notifications) then raise exception 'FAIL: read someone else''s notifications'; end if;
end $$;
select expect_refused($q$insert into rider_notifications (user_id, kind, title) values (auth.uid(), 'x', 'fake')$q$, 'rider wrote a notification');
-- Lee clearing everything doesn't touch anyone else's.
do $$ begin
  if clear_notifications() <> 0 or mark_notifications_read() <> 0 then raise exception 'FAIL: cleared someone else''s'; end if;
end $$;
reset role;
do $$ begin
  if not exists (select 1 from inbox_of('00000000-0000-0000-0000-000000000e02')) then raise exception 'FAIL: Lee cleared Jon''s inbox'; end if;
end $$;

-- Jon can't edit or delete his rows directly either (no policy for it): only the functions can.
select as_user('00000000-0000-0000-0000-000000000e02');
set role authenticated;
update rider_notifications set title = 'edited';
delete from rider_notifications;
reset role;
do $$ begin
  if not exists (select 1 from inbox_of('00000000-0000-0000-0000-000000000e02')) or exists (select 1 from inbox_of('00000000-0000-0000-0000-000000000e02') where title = 'edited') then
    raise exception 'FAIL: a rider changed rider_notifications directly';
  end if;
end $$;

-- N4. Read, then a new chat starts a new row; clear one, clear all.
select as_user('00000000-0000-0000-0000-000000000e02');
set role authenticated;
do $$ begin
  if mark_notifications_read() < 1 then raise exception 'FAIL: mark read'; end if;
  if exists (select 1 from rider_notifications where read_at is null) then raise exception 'FAIL: still unread'; end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-000000000e01');
set role authenticated;
insert into ride_messages (id, ride_id, user_id, kind, body)
values ('0e0e0000-0000-0000-0000-000000000004', '0e0e0e0e-0e0e-0e0e-0e0e-0e0e0e0e0e0e', auth.uid(), 'chat', 'Leaving in 5');
reset role;
do $$ begin
  if (select count(*) from inbox_of('00000000-0000-0000-0000-000000000e02') where kind = 'message') <> 2 then
    raise exception 'FAIL: a chat after reading should start a new row';
  end if;
end $$;
-- The sender deletes it: it leaves the inbox.
select as_user('00000000-0000-0000-0000-000000000e01');
set role authenticated;
select clear_ride_message('0e0e0000-0000-0000-0000-000000000004');
reset role;
do $$ begin
  if (select count(*) from inbox_of('00000000-0000-0000-0000-000000000e02') where kind = 'message') <> 1 then
    raise exception 'FAIL: a deleted message stayed in the inbox';
  end if;
end $$;
select as_user('00000000-0000-0000-0000-000000000e02');
set role authenticated;
do $$
declare v_id uuid;
begin
  select id into v_id from rider_notifications limit 1;
  if clear_notifications(array[v_id]) <> 1 then raise exception 'FAIL: clear one'; end if;
  if exists (select 1 from rider_notifications where id = v_id) then raise exception 'FAIL: cleared row still there'; end if;
  perform clear_notifications();
  if exists (select 1 from rider_notifications) then raise exception 'FAIL: clear all'; end if;
end $$;
reset role;
select as_user(null);
select expect_refused($q$select clear_notifications()$q$, 'signed-out clear');

-- N5. A failing push builder never stops the message: a made-up event type saves nothing.
do $$ begin
  perform record_notifications('{"type":"nonsense","id":"not-a-uuid"}');
  perform record_notifications('{"type":"message","id":"not-a-uuid"}');
end $$;

drop function inbox_of(text);
select 'NOTIFICATION INBOX TESTS PASSED';
