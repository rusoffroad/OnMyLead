-- Ride chat: Clear and Mark Resolved. Only the sender can do either; everyone else on the ride
-- sees the result. Runs after privacy_test.sql (run_local.sh), which sets up as_user and
-- expect_refused. Each block raises an exception if a rule is broken.

-- Olivia organizes a ride; Ben and Cara join; Dan is not on it.
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility)
values ('5e5e5e5e-5e5e-5e5e-5e5e-5e5e5e5e5e5e', auth.uid(), 'Resolve ride', now() + interval '1 day', 38.5, -109.5, 'public');
reset role;
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
select join_ride('5e5e5e5e-5e5e-5e5e-5e5e-5e5e5e5e5e5e');
insert into ride_messages (id, ride_id, user_id, body)
values ('5e5e0000-0000-0000-0000-000000000001', '5e5e5e5e-5e5e-5e5e-5e5e-5e5e5e5e5e5e', auth.uid(), 'Need gas at the next stop');
insert into ride_messages (id, ride_id, user_id, body)
values ('5e5e0000-0000-0000-0000-000000000002', '5e5e5e5e-5e5e-5e5e-5e5e-5e5e5e5e5e5e', auth.uid(), 'Typo, ignore');
reset role;
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
select join_ride('5e5e5e5e-5e5e-5e5e-5e5e-5e5e5e5e5e5e');
reset role;

-- M1. Ben marks his message resolved; Cara sees it resolved. Then he opens it again.
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
select set_message_resolved('5e5e0000-0000-0000-0000-000000000001', true);
reset role;
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
do $$ begin
  if (select resolved_at from ride_messages where id = '5e5e0000-0000-0000-0000-000000000001') is null then
    raise exception 'FAIL: rider on the ride does not see the message resolved';
  end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
do $$ begin
  if set_message_resolved('5e5e0000-0000-0000-0000-000000000001', false) is not null then
    raise exception 'FAIL: reopen returned a resolved time';
  end if;
  if (select resolved_at from ride_messages where id = '5e5e0000-0000-0000-0000-000000000001') is not null then
    raise exception 'FAIL: message still resolved after reopening';
  end if;
end $$;
-- Riders still can't edit messages directly, not even the resolved time.
update ride_messages set resolved_at = now() where id = '5e5e0000-0000-0000-0000-000000000001';
reset role;
do $$ begin
  if (select resolved_at from ride_messages where id = '5e5e0000-0000-0000-0000-000000000001') is not null then
    raise exception 'FAIL: rider set resolved_at by a direct edit';
  end if;
end $$;

-- M2. Nobody else can resolve or clear Ben's message: not a rider, not the organizer, not a stranger.
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
select expect_refused($q$select set_message_resolved('5e5e0000-0000-0000-0000-000000000001', true)$q$, 'another rider resolved a message');
select expect_refused($q$select clear_ride_message('5e5e0000-0000-0000-0000-000000000001')$q$, 'another rider cleared a message');
reset role;
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
select expect_refused($q$select clear_ride_message('5e5e0000-0000-0000-0000-000000000001')$q$, 'organizer cleared a rider''s message');
reset role;
select as_user('00000000-0000-0000-0000-00000000000d');
set role authenticated;
select expect_refused($q$select set_message_resolved('5e5e0000-0000-0000-0000-000000000001', true)$q$, 'stranger resolved a message');
select expect_refused($q$select clear_ride_message('5e5e0000-0000-0000-0000-000000000001')$q$, 'stranger cleared a message');
reset role;
select as_user(null);
set role anon;
select expect_refused($q$select clear_ride_message('5e5e0000-0000-0000-0000-000000000001')$q$, 'signed-out visitor cleared a message');
reset role;
do $$ begin
  if (select count(*) from ride_messages where id = '5e5e0000-0000-0000-0000-000000000001' and resolved_at is null) <> 1 then
    raise exception 'FAIL: refused calls changed the message';
  end if;
end $$;

-- M3. Ben clears his second message: it is gone for everyone, and the first one stays.
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
select clear_ride_message('5e5e0000-0000-0000-0000-000000000002');
select expect_refused($q$select clear_ride_message('5e5e0000-0000-0000-0000-000000000002')$q$, 'cleared a message twice');
reset role;
do $$ begin
  if exists (select 1 from ride_messages where id = '5e5e0000-0000-0000-0000-000000000002') then
    raise exception 'FAIL: cleared message still there';
  end if;
  if not exists (select 1 from ride_messages where id = '5e5e0000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: clearing removed another message';
  end if;
end $$;

select 'ALL CLEAR AND RESOLVE TESTS PASSED' as result;
