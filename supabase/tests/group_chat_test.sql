-- Group Chat inside riding groups.
-- Runs after privacy_test.sql and groups_test.sql (run_local.sh), which set up as_user,
-- expect_refused and the pg_net / Vault stand-ins that let push events be read back from net.calls.
-- Each block raises an exception if a privacy or chat rule is broken.

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000c1', '{"full_name":"Cora Owner"}'),
  ('00000000-0000-0000-0000-0000000000c2', '{"full_name":"Dan Member"}'),
  ('00000000-0000-0000-0000-0000000000c3', '{"full_name":"Sid Outsider"}');

-- Cora runs a group; Dan joins with the link. Cora also has a ride Dan is on and Sid is not.
select as_user('00000000-0000-0000-0000-0000000000c1');
set role authenticated;
insert into riding_groups (id, owner_id, name, invite_code)
values ('41414141-4141-4141-4141-414141414141', auth.uid(), 'Desert Rats', 'RATSLINK01');
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility, invite_code)
values ('42424242-4242-4242-4242-424242424242', auth.uid(), 'Fins and Things', now() + interval '2 days', 38.5, -109.5, 'private', 'FINSRIDE');
insert into ride_private_details (ride_id, meet_lat, meet_lng) values ('42424242-4242-4242-4242-424242424242', 38.51, -109.51);
select register_push_token('cora-phone-000000000000000', 'ios');
reset role;
select as_user('00000000-0000-0000-0000-0000000000c2');
set role authenticated;
select join_group('ratslink01');
select join_ride(p_invite_code => 'finsride');
select register_push_token('dan-phone-0000000000000000', 'ios');
reset role;
select as_user('00000000-0000-0000-0000-0000000000c3');
set role authenticated;
select register_push_token('sid-phone-0000000000000000', 'ios');
reset role;

-- C1. Members post, and can link a ride they are on. The message is trimmed and gets server time.
truncate net.calls;
select as_user('00000000-0000-0000-0000-0000000000c1');
set role authenticated;
insert into group_messages (id, group_id, user_id, body, ride_id, sent_at)
values ('43434343-4343-4343-4343-434343434301', '41414141-4141-4141-4141-414141414141', auth.uid(),
        '  Who is in for Saturday?  ', '42424242-4242-4242-4242-424242424242', now() + interval '1 day');
reset role;
select as_user('00000000-0000-0000-0000-0000000000c2');
set role authenticated;
insert into group_messages (id, group_id, user_id, body)
values ('43434343-4343-4343-4343-434343434302', '41414141-4141-4141-4141-414141414141', auth.uid(), 'Count me in');
do $$ begin
  if (select count(*) from group_messages) <> 2 then raise exception 'FAIL: member cannot read the group chat'; end if;
  if (select body from group_messages where id = '43434343-4343-4343-4343-434343434301') <> 'Who is in for Saturday?' then
    raise exception 'FAIL: message not trimmed';
  end if;
  if (select sent_at > now() from group_messages where id = '43434343-4343-4343-4343-434343434301') then
    raise exception 'FAIL: sent_at in the future';
  end if;
  if (select count(*) from group_chat_rides('41414141-4141-4141-4141-414141414141')) <> 1
     or (select invite_code from group_chat_rides('41414141-4141-4141-4141-414141414141')) <> 'FINSRIDE' then
    raise exception 'FAIL: member cannot see the linked ride';
  end if;
end $$;
-- Posting as someone else, or editing, does nothing or is refused.
select expect_refused(
  $q$insert into group_messages (group_id, user_id, body) values ('41414141-4141-4141-4141-414141414141', '00000000-0000-0000-0000-0000000000c1', 'fake')$q$,
  'member posted as the owner');
-- (The test setup grants every table to authenticated, so these are checked by effect.)
do $$ begin
  begin
    update group_messages set body = 'edited' where id = '43434343-4343-4343-4343-434343434301';
  exception when others then null;
  end;
  begin
    delete from group_messages where id = '43434343-4343-4343-4343-434343434301';
  exception when others then null;
  end;
end $$;
reset role;
do $$ begin
  if (select body from group_messages where id = '43434343-4343-4343-4343-434343434301') is distinct from 'Who is in for Saturday?' then
    raise exception 'FAIL: member edited or deleted someone else''s message directly';
  end if;
end $$;

-- C2. Someone outside the group sees nothing and can't post, link rides, or read its rides.
select as_user('00000000-0000-0000-0000-0000000000c3');
set role authenticated;
do $$ begin
  if (select count(*) from group_messages) <> 0 then raise exception 'FAIL: outsider read the group chat'; end if;
  if (select count(*) from group_chat_rides('41414141-4141-4141-4141-414141414141')) <> 0 then
    raise exception 'FAIL: outsider read the rides the group talks about';
  end if;
  if (select count(*) from my_group_chats()) <> 0 then raise exception 'FAIL: outsider got a group chat summary'; end if;
end $$;
select expect_refused(
  $q$insert into group_messages (group_id, user_id, body) values ('41414141-4141-4141-4141-414141414141', auth.uid(), 'hi')$q$,
  'outsider posted in a group chat');
select expect_refused($q$select clear_group_message('43434343-4343-4343-4343-434343434302')$q$, 'outsider cleared a message');
select expect_refused($q$select mark_group_chat_read('41414141-4141-4141-4141-414141414141')$q$, 'outsider marked a group read');
select expect_refused($q$select set_group_chat_muted('41414141-4141-4141-4141-414141414141', true)$q$, 'outsider muted a group');
reset role;

-- C3. A member can only link a ride they are on.
select as_user('00000000-0000-0000-0000-0000000000c3');
set role authenticated;
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility, invite_code)
values ('44444444-4444-4444-4444-444444444444', auth.uid(), 'Sid ride', now() + interval '3 days', 38.5, -109.5, 'public', 'SIDRIDE1');
reset role;
select as_user('00000000-0000-0000-0000-0000000000c2');
set role authenticated;
select expect_refused(
  $q$insert into group_messages (group_id, user_id, body, ride_id) values ('41414141-4141-4141-4141-414141414141', auth.uid(), 'look', '44444444-4444-4444-4444-444444444444')$q$,
  'member linked a ride they are not on');
reset role;

-- C4. Push: each message is queued, goes to everyone in the group but the sender, and respects
-- mute, the Group Chat switch and previews.
do $$
declare
  ev constant jsonb := '{"type":"group_message","id":"43434343-4343-4343-4343-434343434301"}';
begin
  if (select count(*) from net.calls where body ->> 'type' = 'group_message') <> 2 then
    raise exception 'FAIL: group messages not queued for push';
  end if;
  if (select array_agg(token) from push_batch_group(ev)) <> array['dan-phone-0000000000000000'] then
    raise exception 'FAIL: group push recipients %', (select array_agg(token) from push_batch_group(ev));
  end if;
  if (select title from push_batch_group(ev)) <> 'Cora Owner · Desert Rats' or (select body from push_batch_group(ev)) <> 'Who is in for Saturday?' then
    raise exception 'FAIL: group push text';
  end if;
  if (select data ->> 'groupId' from push_batch_group(ev)) <> '41414141-4141-4141-4141-414141414141' then
    raise exception 'FAIL: group push does not open the group';
  end if;
end $$;
select as_user('00000000-0000-0000-0000-0000000000c2');
set role authenticated;
select expect_refused($q$select * from push_batch_group('{"type":"group_message","id":"43434343-4343-4343-4343-434343434301"}')$q$, 'rider called push_batch_group');
insert into notification_settings (user_id, previews) values (auth.uid(), false)
  on conflict (user_id) do update set previews = false;
reset role;
do $$ begin
  if (select body from push_batch_group('{"type":"group_message","id":"43434343-4343-4343-4343-434343434301"}')) <> 'New message in your group chat' then
    raise exception 'FAIL: previews off still showed the text';
  end if;
end $$;
select as_user('00000000-0000-0000-0000-0000000000c2');
set role authenticated;
select set_group_chat_muted('41414141-4141-4141-4141-414141414141', true);
reset role;
do $$ begin
  if exists (select 1 from push_batch_group('{"type":"group_message","id":"43434343-4343-4343-4343-434343434301"}')) then
    raise exception 'FAIL: muted group still pushed';
  end if;
end $$;
select as_user('00000000-0000-0000-0000-0000000000c2');
set role authenticated;
select set_group_chat_muted('41414141-4141-4141-4141-414141414141', false);
update notification_settings set group_chat = false where user_id = auth.uid();
reset role;
do $$ begin
  if exists (select 1 from push_batch_group('{"type":"group_message","id":"43434343-4343-4343-4343-434343434301"}')) then
    raise exception 'FAIL: Group Chat switch ignored';
  end if;
end $$;

-- C5. Unread counts: Cora has one unread (Dan's), none after opening the chat.
select as_user('00000000-0000-0000-0000-0000000000c1');
set role authenticated;
do $$
declare c record;
begin
  select * into c from my_group_chats() where group_id = '41414141-4141-4141-4141-414141414141';
  if c.unread <> 1 or c.last_body <> 'Count me in' then raise exception 'FAIL: group chat summary %', row_to_json(c); end if;
  perform mark_group_chat_read('41414141-4141-4141-4141-414141414141');
  if (select unread from my_group_chats() where group_id = '41414141-4141-4141-4141-414141414141') <> 0 then
    raise exception 'FAIL: unread count after reading';
  end if;
  if (select count(*) from group_chat_reads) <> 1 then raise exception 'FAIL: rider sees another rider''s read marker'; end if;
end $$;
reset role;

-- C6. Clearing: Dan can't clear Cora's message, can clear his own; Cora (owner) can clear any.
select as_user('00000000-0000-0000-0000-0000000000c2');
set role authenticated;
select expect_refused($q$select clear_group_message('43434343-4343-4343-4343-434343434301')$q$, 'member cleared someone else''s message');
select clear_group_message('43434343-4343-4343-4343-434343434302');
insert into group_messages (id, group_id, user_id, body)
values ('43434343-4343-4343-4343-434343434303', '41414141-4141-4141-4141-414141414141', auth.uid(), 'Oops wrong group');
reset role;
select as_user('00000000-0000-0000-0000-0000000000c1');
set role authenticated;
select clear_group_message('43434343-4343-4343-4343-434343434303');
do $$ begin
  if (select count(*) from group_messages) <> 1 then raise exception 'FAIL: clearing'; end if;
end $$;
reset role;

-- C7. Leaving the group ends access to its chat.
select as_user('00000000-0000-0000-0000-0000000000c2');
set role authenticated;
delete from riding_group_members where group_id = '41414141-4141-4141-4141-414141414141' and user_id = auth.uid();
do $$ begin
  if (select count(*) from group_messages) <> 0 then raise exception 'FAIL: former member still reads the chat'; end if;
end $$;
select expect_refused(
  $q$insert into group_messages (group_id, user_id, body) values ('41414141-4141-4141-4141-414141414141', auth.uid(), 'still here?')$q$,
  'former member posted');
reset role;

-- C8. Rate limit: the 11th message in a minute is refused.
select as_user('00000000-0000-0000-0000-0000000000c1');
set role authenticated;
do $$ begin
  for i in 1..9 loop
    insert into group_messages (group_id, user_id, body) values ('41414141-4141-4141-4141-414141414141', auth.uid(), 'm' || i);
  end loop;
end $$;
select expect_refused(
  $q$insert into group_messages (group_id, user_id, body) values ('41414141-4141-4141-4141-414141414141', auth.uid(), 'one too many')$q$,
  'rate limit');
reset role;

select 'ALL GROUP CHAT TESTS PASSED' as result;
