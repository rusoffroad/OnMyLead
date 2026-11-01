-- Out Riding and direct messages: who can see who's out riding nearby, what they can learn, and
-- who can message whom. Runs after privacy_test.sql (run_local.sh), which sets up as_user and
-- expect_refused, and grants every table to authenticated, so these checks lean on row level
-- security and the functions alone. Each block raises an exception if a privacy rule is broken.
--
-- Riders (all new here):
--   Eli  e1   rode with Fay
--   Fay  e2   rode with Eli
--   Gus  e3   a stranger, chooses "everyone"
--   Hal  e4   rode with nobody, far away (150 miles)
--   Ivy  e5   a stranger who keeps the default ("riders")
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000701', '{"full_name":"Eli Known"}'),
  ('00000000-0000-0000-0000-000000000702', '{"full_name":"Fay Known"}'),
  ('00000000-0000-0000-0000-000000000703', '{"full_name":"Gus Stranger"}'),
  ('00000000-0000-0000-0000-000000000704', '{"full_name":"Hal Far"}'),
  ('00000000-0000-0000-0000-000000000705', '{"full_name":"Ivy Hidden"}');

-- Eli and Fay ride together.
select as_user('00000000-0000-0000-0000-000000000701');
set role authenticated;
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility, max_vehicles)
values ('7e7e7e7e-7e7e-7e7e-7e7e-7e7e7e7e7e7e', auth.uid(), 'Windrock Loop', now() + interval '1 day', 36.1, -84.3, 'public', 6);
reset role;
select as_user('00000000-0000-0000-0000-000000000702');
set role authenticated;
do $$ begin
  if join_ride('7e7e7e7e-7e7e-7e7e-7e7e-7e7e7e7e7e7e') <> 'joined' then raise exception 'FAIL: Fay should join'; end if;
end $$;
reset role;

-- Helper for the checks below: who does this rider see?
create function seen_by(p_viewer text, p_miles int default 10, p_scope text default 'riders')
returns text[] language plpgsql as $$
declare v text[];
begin
  perform as_user(p_viewer::uuid);
  execute 'set local role authenticated';
  select coalesce(array_agg(display_name order by display_name), '{}') into v from nearby_riders(p_miles, p_scope);
  execute 'reset role';
  return v;
end $$;

-- O1. Nobody is listed until they switch it on, and a rider who isn't Out Riding sees nobody.
do $$ begin
  if seen_by('00000000-0000-0000-0000-000000000701') <> '{}' then raise exception 'FAIL: saw riders with nobody Out Riding'; end if;
end $$;

-- Everyone switches on near Windrock (Hal 150 miles away). Exact points go in; only a rough area is kept.
select as_user('00000000-0000-0000-0000-000000000702');
set role authenticated;
select set_out_riding(36.123456, -84.312345, null, 'Windrock Park', 12);
reset role;
do $$ begin
  if seen_by('00000000-0000-0000-0000-000000000701') <> '{}' then raise exception 'FAIL: rider who isn''t Out Riding could look'; end if;
end $$;
select as_user('00000000-0000-0000-0000-000000000701');
set role authenticated;
select set_out_riding(36.1, -84.3);
reset role;
select as_user('00000000-0000-0000-0000-000000000703');
set role authenticated;
select set_out_riding(36.11, -84.29, 'everyone');
reset role;
select as_user('00000000-0000-0000-0000-000000000705');
set role authenticated;
select set_out_riding(36.105, -84.305);
reset role;
select as_user('00000000-0000-0000-0000-000000000704');
set role authenticated;
select set_out_riding(38.2, -84.3, 'everyone');
reset role;

do $$ begin
  if (select area_lat from out_riding where user_id = '00000000-0000-0000-0000-000000000702') <> 36.12
     or (select area_lng from out_riding where user_id = '00000000-0000-0000-0000-000000000702') <> -84.31 then
    raise exception 'FAIL: exact position stored instead of a rough area';
  end if;
  if (select spot from out_riding where user_id = '00000000-0000-0000-0000-000000000702') <> 'Windrock Park' then raise exception 'FAIL: spot not kept'; end if;
  if (select audience from out_riding where user_id = '00000000-0000-0000-0000-000000000701') <> 'riders' then
    raise exception 'FAIL: default audience is not riders you know';
  end if;
end $$;

-- O2. Nobody can read anyone else's status row, or write one directly.
select as_user('00000000-0000-0000-0000-000000000701');
set role authenticated;
do $$ begin
  if (select count(*) from out_riding) <> 1 then raise exception 'FAIL: rider read someone else''s Out Riding area'; end if;
end $$;
select expect_refused($q$insert into out_riding (user_id, area_lat, area_lng, expires_at) values ('00000000-0000-0000-0000-000000000703', 1, 1, now() + interval '1 day')$q$, 'wrote someone else''s status');
select expect_refused($q$insert into out_riding (user_id, area_lat, area_lng, expires_at) values (auth.uid(), 1, 1, now() + interval '1 day')$q$, 'wrote a status without set_out_riding');
update out_riding set expires_at = now() + interval '30 days', area_lat = 36.123456;
delete from out_riding where user_id = '00000000-0000-0000-0000-000000000702';
select expect_refused($q$select set_out_riding(36.1, -84.3, null, null, 500)$q$, 'stayed on longer than 3 days');
select expect_refused($q$select set_out_riding(36.1, -84.3, 'public')$q$, 'unknown audience');
reset role;
do $$ begin
  if (select expires_at from out_riding where user_id = '00000000-0000-0000-0000-000000000701') > now() + interval '5 hours' then
    raise exception 'FAIL: rider changed their status row directly';
  end if;
  if not exists (select 1 from out_riding where user_id = '00000000-0000-0000-0000-000000000702') then
    raise exception 'FAIL: rider deleted someone else''s status';
  end if;
end $$;

-- O3. By default you see riders you know, never strangers. The answer has no coordinates, only
-- whole miles.
do $$
declare r record;
begin
  if seen_by('00000000-0000-0000-0000-000000000701') <> '{"Fay Known"}' then raise exception 'FAIL: Eli should see only Fay'; end if;
  if seen_by('00000000-0000-0000-0000-000000000702') <> '{"Eli Known"}' then raise exception 'FAIL: Fay should see only Eli'; end if;
  -- Eli keeps "riders", so asking for everyone still shows only who he knows.
  if seen_by('00000000-0000-0000-0000-000000000701', 10, 'everyone') <> '{"Fay Known"}' then
    raise exception 'FAIL: rider hidden from strangers could see strangers';
  end if;
  perform as_user('00000000-0000-0000-0000-000000000701');
  set local role authenticated;
  select * into r from nearby_riders() limit 1;
  reset role;
  if r.miles <> 1 or not r.known or r.spot <> 'Windrock Park' then raise exception 'FAIL: wrong nearby row %', row_to_json(r); end if;
end $$;
do $$ begin
  if exists (
    select 1 from information_schema.parameters
    where specific_name like 'nearby\_riders\_%' and parameter_mode = 'OUT' and parameter_name ~ 'lat|lng|area'
  ) then
    raise exception 'FAIL: nearby_riders returns coordinates';
  end if;
end $$;

-- O4. Strangers see each other only when both chose "everyone". Ivy (default) stays hidden.
do $$ begin
  if seen_by('00000000-0000-0000-0000-000000000703', 10, 'everyone') <> '{}' then
    raise exception 'FAIL: Gus saw riders who keep it to riders they know';
  end if;
end $$;
select as_user('00000000-0000-0000-0000-000000000701');
set role authenticated;
select set_out_riding(36.1, -84.3, 'everyone');
reset role;
do $$ begin
  if seen_by('00000000-0000-0000-0000-000000000701', 10, 'everyone') <> '{"Fay Known","Gus Stranger"}' then
    raise exception 'FAIL: Eli on everyone should see Fay and Gus, not Ivy';
  end if;
  if seen_by('00000000-0000-0000-0000-000000000701', 10, 'riders') <> '{"Fay Known"}' then raise exception 'FAIL: riders filter leaked strangers'; end if;
  if seen_by('00000000-0000-0000-0000-000000000703', 10, 'everyone') <> '{"Eli Known"}' then raise exception 'FAIL: Gus should see only Eli'; end if;
  if 'Ivy Hidden' = any (seen_by('00000000-0000-0000-0000-000000000703', 50, 'everyone')) then raise exception 'FAIL: Ivy shown to a stranger'; end if;
end $$;

-- O5. Distance: Hal is 150 miles away, past the 50-mile cap even when asked for more.
do $$ begin
  if 'Hal Far' = any (seen_by('00000000-0000-0000-0000-000000000701', 500, 'everyone')) then raise exception 'FAIL: rider past 50 miles shown'; end if;
end $$;

-- O6. Blocking hides both ways, and the blocked rider can't tell.
select as_user('00000000-0000-0000-0000-000000000703');
set role authenticated;
insert into blocked_riders (blocked_id) values ('00000000-0000-0000-0000-000000000701');
reset role;
do $$ begin
  if 'Gus Stranger' = any (seen_by('00000000-0000-0000-0000-000000000701', 10, 'everyone')) then raise exception 'FAIL: blocked rider still sees who blocked them'; end if;
  if 'Eli Known' = any (seen_by('00000000-0000-0000-0000-000000000703', 10, 'everyone')) then raise exception 'FAIL: blocker still sees the blocked rider'; end if;
end $$;
delete from blocked_riders where blocker_id = '00000000-0000-0000-0000-000000000703';

-- O7. It turns itself off: past the end the rider picked, or 6 hours without opening the app.
update out_riding set refreshed_at = now() - interval '7 hours' where user_id = '00000000-0000-0000-0000-000000000702';
do $$ begin
  if 'Fay Known' = any (seen_by('00000000-0000-0000-0000-000000000701')) then raise exception 'FAIL: idle rider still listed'; end if;
end $$;
select as_user('00000000-0000-0000-0000-000000000702');
set role authenticated;
select set_out_riding(36.12, -84.31);
reset role;
do $$ begin
  if not 'Fay Known' = any (seen_by('00000000-0000-0000-0000-000000000701')) then raise exception 'FAIL: opening the app didn''t bring Fay back'; end if;
end $$;
update out_riding set expires_at = now() - interval '1 minute' where user_id = '00000000-0000-0000-0000-000000000702';
do $$ begin
  if 'Fay Known' = any (seen_by('00000000-0000-0000-0000-000000000701')) then raise exception 'FAIL: expired rider still listed'; end if;
  if seen_by('00000000-0000-0000-0000-000000000702') <> '{}' then raise exception 'FAIL: expired rider could still look'; end if;
end $$;
-- Long-ended statuses are deleted, area and all.
update out_riding set expires_at = now() - interval '2 days' where user_id = '00000000-0000-0000-0000-000000000702';
select seen_by('00000000-0000-0000-0000-000000000701');
do $$ begin
  if exists (select 1 from out_riding where user_id = '00000000-0000-0000-0000-000000000702') then raise exception 'FAIL: old status left behind'; end if;
end $$;
select as_user('00000000-0000-0000-0000-000000000702');
set role authenticated;
select set_out_riding(36.12, -84.31, null, null, 12);
reset role;

-- O8. Area updates are rate limited (30 an hour), so nobody can walk a fake point around.
select as_user('00000000-0000-0000-0000-000000000705');
set role authenticated;
do $$ begin
  for i in 1..29 loop perform set_out_riding(36.105, -84.305); end loop;
end $$;
select expect_refused($q$select set_out_riding(36.105, -84.305)$q$, 'area updated more than 30 times an hour');
reset role;

-- O9. Signed-out visitors can't look or switch on.
select as_user(null);
set role anon;
select expect_refused($q$select * from nearby_riders()$q$, 'anonymous nearby lookup');
select expect_refused($q$select set_out_riding(36.1, -84.3)$q$, 'anonymous Out Riding');
select expect_refused($q$select count(*) from out_riding$q$, 'anonymous read of Out Riding');
reset role;

-- O10. Turning it off deletes the row.
select as_user('00000000-0000-0000-0000-000000000705');
set role authenticated;
select stop_out_riding();
reset role;
do $$ begin
  if exists (select 1 from out_riding where user_id = '00000000-0000-0000-0000-000000000705') then raise exception 'FAIL: turning it off kept the area'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Direct messages
-- ---------------------------------------------------------------------------

-- D1. Eli messages Fay (they've ridden together). Only the two of them can read it.
select as_user('00000000-0000-0000-0000-000000000701');
set role authenticated;
select send_direct_message('00000000-0000-0000-0000-000000000702', '  Where are you parked?  ');
select expect_refused($q$insert into direct_messages (thread_id, sender_id, body) select id, auth.uid(), 'hi' from dm_threads$q$, 'wrote a message without send_direct_message');
select expect_refused($q$insert into dm_threads (user_lo, user_hi) values ('00000000-0000-0000-0000-000000000703', '00000000-0000-0000-0000-000000000705')$q$, 'made someone else''s conversation');
select expect_refused($q$select send_direct_message(auth.uid(), 'me')$q$, 'messaged themselves');
select expect_refused($q$select send_direct_message('00000000-0000-0000-0000-000000000702', '   ')$q$, 'empty message');
reset role;
select as_user('00000000-0000-0000-0000-000000000702');
set role authenticated;
do $$ begin
  if (select body from direct_messages) <> 'Where are you parked?' then raise exception 'FAIL: Fay can''t read Eli''s message'; end if;
  if (select unread from my_dm_threads()) <> 1 then raise exception 'FAIL: unread count'; end if;
  perform mark_dm_read((select id from dm_threads));
  if (select unread from my_dm_threads()) <> 0 then raise exception 'FAIL: mark read'; end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-000000000703');
set role authenticated;
do $$ begin
  if (select count(*) from direct_messages) + (select count(*) from dm_threads) + (select count(*) from dm_reads) <> 0 then
    raise exception 'FAIL: stranger read someone else''s messages';
  end if;
  if exists (select 1 from my_dm_threads()) then raise exception 'FAIL: stranger listed someone else''s conversation'; end if;
end $$;
select expect_refused($q$select mark_dm_read((select id from dm_threads where true limit 1))$q$, 'marked someone else''s conversation');
reset role;

-- D2. Strangers: only someone you can see Out Riding right now. Ivy (switched off) can't be
-- messaged by Gus; Gus and Eli (both "everyone", nearby) can message each other.
select as_user('00000000-0000-0000-0000-000000000703');
set role authenticated;
select expect_refused($q$select send_direct_message('00000000-0000-0000-0000-000000000705', 'hey')$q$, 'messaged a stranger who isn''t visible');
select expect_refused($q$select send_direct_message('00000000-0000-0000-0000-000000000704', 'hey')$q$, 'messaged a stranger 150 miles away');
select send_direct_message('00000000-0000-0000-0000-000000000701', 'Saw you on the list, riding Trail 19?');

-- D3. Until Eli replies, Gus can send at most 3.
select send_direct_message('00000000-0000-0000-0000-000000000701', 'Two');
select send_direct_message('00000000-0000-0000-0000-000000000701', 'Three');
select expect_refused($q$select send_direct_message('00000000-0000-0000-0000-000000000701', 'Four')$q$, 'sent a 4th message before a reply');
reset role;
-- Once the conversation exists, it keeps working after the stranger leaves Out Riding.
select as_user('00000000-0000-0000-0000-000000000701');
set role authenticated;
select stop_out_riding();
select send_direct_message('00000000-0000-0000-0000-000000000703', 'Yep, at the top');
reset role;
select as_user('00000000-0000-0000-0000-000000000703');
set role authenticated;
select send_direct_message('00000000-0000-0000-0000-000000000701', 'Four');
reset role;

-- D4. Eli blocks Gus: Gus's messages disappear for Eli, Gus gets no hint and no push reaches
-- Eli; Eli can't message Gus until he unblocks him.
insert into push_tokens (user_id, token, platform) values ('00000000-0000-0000-0000-000000000701', 'eli-token-0000000000000000000000000000000000000000', 'ios');
do $$ begin
  if (select count(*) from push_batch_dm(jsonb_build_object('type', 'direct_message', 'id',
      (select id from direct_messages where body = 'Four'))) ) <> 1 then
    raise exception 'FAIL: no push for a direct message';
  end if;
end $$;
select as_user('00000000-0000-0000-0000-000000000701');
set role authenticated;
insert into blocked_riders (blocked_id) values ('00000000-0000-0000-0000-000000000703');
do $$ begin
  if exists (select 1 from direct_messages where sender_id = '00000000-0000-0000-0000-000000000703') then
    raise exception 'FAIL: blocked rider''s messages still shown';
  end if;
  if exists (select 1 from my_dm_threads() where other_id = '00000000-0000-0000-0000-000000000703') then
    raise exception 'FAIL: blocked rider''s conversation still listed';
  end if;
end $$;
select expect_refused($q$select send_direct_message('00000000-0000-0000-0000-000000000703', 'hi')$q$, 'messaged a rider they blocked');
reset role;
select as_user('00000000-0000-0000-0000-000000000703');
set role authenticated;
select send_direct_message('00000000-0000-0000-0000-000000000701', 'Hello?');
do $$ begin
  if (select count(*) from direct_messages) <> 6 then raise exception 'FAIL: blocked sender can tell (own messages changed)'; end if;
end $$;
reset role;
do $$ begin
  if exists (select 1 from push_batch_dm(jsonb_build_object('type', 'direct_message', 'id',
      (select id from direct_messages where body = 'Hello?')))) then
    raise exception 'FAIL: push sent to a rider who blocked the sender';
  end if;
end $$;
delete from blocked_riders where blocker_id = '00000000-0000-0000-0000-000000000701';

-- D5. Mute stops the push; Delete Conversation clears my copy only.
select as_user('00000000-0000-0000-0000-000000000701');
set role authenticated;
select set_dm_muted(dm_thread_with('00000000-0000-0000-0000-000000000703'), true);
reset role;
do $$ begin
  if exists (select 1 from push_batch_dm(jsonb_build_object('type', 'direct_message', 'id',
      (select id from direct_messages where body = 'Hello?')))) then
    raise exception 'FAIL: push sent for a muted conversation';
  end if;
end $$;
select as_user('00000000-0000-0000-0000-000000000701');
set role authenticated;
select clear_dm_thread(dm_thread_with('00000000-0000-0000-0000-000000000703'));
do $$ begin
  if exists (select 1 from my_dm_threads() where other_id = '00000000-0000-0000-0000-000000000703') then
    raise exception 'FAIL: deleted conversation still listed';
  end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-000000000703');
set role authenticated;
do $$ begin
  if not exists (select 1 from my_dm_threads() where other_id = '00000000-0000-0000-0000-000000000701') then
    raise exception 'FAIL: deleting removed the other rider''s copy';
  end if;
end $$;
reset role;

-- D6. Rate limit: 10 a minute.
select as_user('00000000-0000-0000-0000-000000000702');
set role authenticated;
do $$ begin
  for i in 1..10 loop perform send_direct_message('00000000-0000-0000-0000-000000000701', 'msg ' || i); end loop;
end $$;
select expect_refused($q$select send_direct_message('00000000-0000-0000-0000-000000000701', 'eleven')$q$, 'sent more than 10 messages a minute');
reset role;

-- D7. Signed-out visitors get nothing.
select as_user(null);
set role anon;
select expect_refused($q$select count(*) from direct_messages$q$, 'anonymous read of messages');
select expect_refused($q$select send_direct_message('00000000-0000-0000-0000-000000000701', 'hi')$q$, 'anonymous message');
reset role;

-- D8. Deleting an account removes their status and conversations.
delete from auth.users where id = '00000000-0000-0000-0000-000000000703';
do $$ begin
  if exists (select 1 from dm_threads where '00000000-0000-0000-0000-000000000703' in (user_lo, user_hi))
     or exists (select 1 from out_riding where user_id = '00000000-0000-0000-0000-000000000703') then
    raise exception 'FAIL: deleted account left Out Riding data behind';
  end if;
end $$;

select 'ALL OUT RIDING TESTS PASSED' as result;
