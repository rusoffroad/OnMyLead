-- Ride Mode status buttons: who got a tap (receipts) and Cancel. Runs after privacy_test.sql
-- (run_local.sh), which sets up as_user and expect_refused. Each block raises an exception if a
-- rule is broken.

-- Olivia organizes a ride; Ben and Cara join; Dan is not on it.
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility)
values ('5b5b5b5b-5b5b-5b5b-5b5b-5b5b5b5b5b5b', auth.uid(), 'Status ride', now() + interval '1 day', 38.5, -109.5, 'public');
reset role;
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
select join_ride('5b5b5b5b-5b5b-5b5b-5b5b-5b5b5b5b5b5b');
-- Ben taps Need Fuel and sends On My Way; the app picks the ids so a retry can't double up.
insert into rider_statuses (id, ride_id, user_id, status)
values ('5b5b0000-0000-0000-0000-000000000001', '5b5b5b5b-5b5b-5b5b-5b5b-5b5b5b5b5b5b', auth.uid(), 'need_fuel');
insert into ride_messages (id, ride_id, user_id, kind, body)
values ('5b5b0000-0000-0000-0000-000000000002', '5b5b5b5b-5b5b-5b5b-5b5b-5b5b5b5b5b5b', auth.uid(), 'status', 'On My Way');
insert into ride_messages (id, ride_id, user_id, kind, body)
values ('5b5b0000-0000-0000-0000-000000000003', '5b5b5b5b-5b5b-5b5b-5b5b-5b5b5b5b5b5b', auth.uid(), 'chat', 'Plain chat');
reset role;
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
select join_ride('5b5b5b5b-5b5b-5b5b-5b5b-5b5b5b5b5b5b');
reset role;

-- S1. Cara's app sees both taps (and the plain chat, which doesn't count). Twice is harmless.
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
do $$ begin
  if ack_ride_items('5b5b5b5b-5b5b-5b5b-5b5b-5b5b5b5b5b5b', array[
       '5b5b0000-0000-0000-0000-000000000001', '5b5b0000-0000-0000-0000-000000000002', '5b5b0000-0000-0000-0000-000000000003']::uuid[]) <> 2 then
    raise exception 'FAIL: rider''s receipts not recorded for exactly the two taps';
  end if;
  if ack_ride_items('5b5b5b5b-5b5b-5b5b-5b5b-5b5b5b5b5b5b', array['5b5b0000-0000-0000-0000-000000000001']::uuid[]) <> 0 then
    raise exception 'FAIL: a second receipt counted again';
  end if;
  -- Cara can't read Ben's receipts, and can't write one directly.
  if exists (select 1 from ride_receipts) then raise exception 'FAIL: a rider read someone else''s receipts'; end if;
end $$;
select expect_refused($q$insert into ride_receipts (item_id, user_id, ride_id, sender_id, seen_at) values ('5b5b0000-0000-0000-0000-000000000001', auth.uid(), '5b5b5b5b-5b5b-5b5b-5b5b-5b5b5b5b5b5b', '00000000-0000-0000-0000-00000000000b', now())$q$, 'rider wrote a receipt directly');
select expect_refused($q$select record_push_reach('5b5b0000-0000-0000-0000-000000000001', array[auth.uid()])$q$, 'rider recorded a push');
reset role;

-- S2. Dan isn't on the ride: his acks do nothing. Ben acking his own tap does nothing.
select as_user('00000000-0000-0000-0000-00000000000d');
set role authenticated;
do $$ begin
  if ack_ride_items('5b5b5b5b-5b5b-5b5b-5b5b-5b5b5b5b5b5b', array['5b5b0000-0000-0000-0000-000000000001']::uuid[]) <> 0 then
    raise exception 'FAIL: a stranger left a receipt';
  end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
do $$ begin
  if ack_ride_items('5b5b5b5b-5b5b-5b5b-5b5b-5b5b5b5b5b5b', array['5b5b0000-0000-0000-0000-000000000001']::uuid[]) <> 0 then
    raise exception 'FAIL: the sender left a receipt on their own tap';
  end if;
  -- Ben reads Cara's receipts for his taps.
  if (select count(*) from ride_receipts where user_id = '00000000-0000-0000-0000-00000000000c' and seen_at is not null) <> 2 then
    raise exception 'FAIL: the sender can''t see who got the taps';
  end if;
end $$;
reset role;

-- S3. The push function records Olivia as notified (service role only).
select record_push_reach('5b5b0000-0000-0000-0000-000000000001', array['00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b']::uuid[]);
do $$ begin
  if (select count(*) from ride_receipts where item_id = '5b5b0000-0000-0000-0000-000000000001' and pushed_at is not null) <> 1 then
    raise exception 'FAIL: push reach not recorded for exactly Olivia (never the sender)';
  end if;
end $$;

-- S4. Quick replies push under Rider Status with a "Name: On My Way" title and a collapse id.
do $$
declare r record;
begin
  insert into push_tokens (user_id, token, platform) values ('00000000-0000-0000-0000-00000000000c', 'tok-cara-status-0001', 'ios')
  on conflict do nothing;
  select * into r from push_batch('{"type":"message","id":"5b5b0000-0000-0000-0000-000000000002"}') where user_id = '00000000-0000-0000-0000-00000000000c';
  if r.title not like '%: On My Way' or r.body <> 'Status ride' or r.data ->> 'collapseId' <> '5b5b0000-0000-0000-0000-000000000002' then
    raise exception 'FAIL: quick reply push looks wrong: % / % / %', r.title, r.body, r.data;
  end if;
  delete from notification_settings where user_id = '00000000-0000-0000-0000-00000000000c';
  insert into notification_settings (user_id, chat) values ('00000000-0000-0000-0000-00000000000c', false);
  if not exists (select 1 from push_batch('{"type":"message","id":"5b5b0000-0000-0000-0000-000000000002"}') where user_id = '00000000-0000-0000-0000-00000000000c') then
    raise exception 'FAIL: turning chat off silenced quick replies';
  end if;
  update notification_settings set rider_status = false where user_id = '00000000-0000-0000-0000-00000000000c';
  if exists (select 1 from push_batch('{"type":"message","id":"5b5b0000-0000-0000-0000-000000000002"}') where user_id = '00000000-0000-0000-0000-00000000000c') then
    raise exception 'FAIL: Rider Status off did not silence quick replies';
  end if;
  update notification_settings set rider_status = true, chat = true where user_id = '00000000-0000-0000-0000-00000000000c';
end $$;

-- S5. Only Ben can cancel. Cancelling hides the status, clears its receipts and tells the group.
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
select expect_refused($q$select cancel_ride_item('5b5b0000-0000-0000-0000-000000000001')$q$, 'another rider cancelled a status');
reset role;
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
do $$ begin
  if cancel_ride_item('5b5b0000-0000-0000-0000-000000000001') <> 'status' then raise exception 'FAIL: status cancel'; end if;
  if cancel_ride_item('5b5b0000-0000-0000-0000-000000000001') <> 'status' then raise exception 'FAIL: second cancel should be fine'; end if;
  if cancel_ride_item('5b5b0000-0000-0000-0000-000000000002') <> 'message' then raise exception 'FAIL: quick reply cancel'; end if;
  if (select cancelled_at from rider_statuses where id = '5b5b0000-0000-0000-0000-000000000001') is null then
    raise exception 'FAIL: status not marked cancelled';
  end if;
  if exists (select 1 from ride_messages where id = '5b5b0000-0000-0000-0000-000000000002') then
    raise exception 'FAIL: cancelled quick reply still in the chat';
  end if;
  if exists (select 1 from ride_receipts) then raise exception 'FAIL: receipts left after cancel'; end if;
end $$;
select expect_refused($q$select cancel_ride_item('5b5b0000-0000-0000-0000-000000000003')$q$, 'plain chat cancelled as a status');
reset role;
do $$
declare r record;
begin
  if exists (select 1 from push_batch('{"type":"status","id":"5b5b0000-0000-0000-0000-000000000001"}')) then
    raise exception 'FAIL: a cancelled status still pushes';
  end if;
  select * into r from push_batch('{"type":"cancelled","ride":"5b5b5b5b-5b5b-5b5b-5b5b-5b5b5b5b5b5b","user":"00000000-0000-0000-0000-00000000000b","item":"5b5b0000-0000-0000-0000-000000000001","what":"Need Fuel","help":false}')
  where user_id = '00000000-0000-0000-0000-00000000000c';
  if r.title not like '% cancelled “Need Fuel”' or r.data ->> 'collapseId' <> '5b5b0000-0000-0000-0000-000000000001' then
    raise exception 'FAIL: cancel push looks wrong: % / %', r.title, r.data;
  end if;
  delete from push_tokens where token = 'tok-cara-status-0001';
end $$;
