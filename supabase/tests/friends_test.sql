-- Friends: who can send a request, who can see a friendship, and what being friends unlocks
-- (Out Riding and direct messages). Runs after out_riding_test.sql (run_local.sh), which runs
-- after privacy_test.sql: as_user and expect_refused come from there, and every table is granted
-- to authenticated, so these checks lean on row level security and the functions alone.
--
-- Riders (all new here):
--   Ann  0801  shares her friend link with Ben
--   Ben  0802  a stranger to Ann until they become friends
--   Cal  0803  rides with Ann
--   Dee  0804  a stranger to everyone
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000801', '{"full_name":"Ann Friend"}'),
  ('00000000-0000-0000-0000-000000000802', '{"full_name":"Ben Friend"}'),
  ('00000000-0000-0000-0000-000000000803', '{"full_name":"Cal Rider"}'),
  ('00000000-0000-0000-0000-000000000804', '{"full_name":"Dee Stranger"}');

create function friends_of(p_viewer text) returns text[] language plpgsql as $$
declare v text[];
begin
  perform as_user(p_viewer::uuid);
  execute 'set local role authenticated';
  select coalesce(array_agg(display_name || ':' || status order by display_name), '{}') into v from my_friends();
  execute 'reset role';
  return v;
end $$;

create function code_of(p_user text) returns text language plpgsql as $$
declare v text;
begin
  perform as_user(p_user::uuid);
  execute 'set local role authenticated';
  v := my_friend_code();
  execute 'reset role';
  return v;
end $$;

-- F1. Nobody can friend-request a stranger just by knowing their id.
select as_user('00000000-0000-0000-0000-000000000802');
set role authenticated;
select expect_refused($q$select send_friend_request('00000000-0000-0000-0000-000000000801')$q$, 'friend request to a stranger by id');
select expect_refused($q$select send_friend_request('00000000-0000-0000-0000-000000000802')$q$, 'friend request to yourself');
reset role;

-- F2. Ben opens Ann's friend link and sends a request. Asking twice doesn't send twice.
do $$
declare v_code text := code_of('00000000-0000-0000-0000-000000000801');
begin
  if v_code is null or length(v_code) <> 10 then raise exception 'FAIL: no friend code'; end if;
  if code_of('00000000-0000-0000-0000-000000000801') <> v_code then raise exception 'FAIL: friend code changed on its own'; end if;
  perform as_user('00000000-0000-0000-0000-000000000802');
  execute 'set local role authenticated';
  if (select relation from friend_preview(lower(v_code))) <> 'none' then raise exception 'FAIL: preview relation should be none'; end if;
  if (select display_name from friend_preview(v_code)) <> 'Ann Friend' then raise exception 'FAIL: preview name'; end if;
  if exists (select 1 from friend_preview('NOTACODE00')) then raise exception 'FAIL: preview for a made-up code'; end if;
  if send_friend_request_by_code(v_code) <> 'requested' then raise exception 'FAIL: request by link'; end if;
  if send_friend_request_by_code(v_code) <> 'already' then raise exception 'FAIL: second request should be already'; end if;
  if (select relation from friend_preview(v_code)) <> 'sent' then raise exception 'FAIL: preview relation should be sent'; end if;
  execute 'reset role';
end $$;
do $$ begin
  if friends_of('00000000-0000-0000-0000-000000000801') <> '{"Ben Friend:received"}' then raise exception 'FAIL: Ann should see Ben''s request'; end if;
  if friends_of('00000000-0000-0000-0000-000000000802') <> '{"Ann Friend:sent"}' then raise exception 'FAIL: Ben should see his sent request'; end if;
  if (select count(*) from friend_request_log) <> 1 then raise exception 'FAIL: request not logged once'; end if;
end $$;

-- F3. Other riders can't see the friendship, anyone's code, or the request log.
select as_user('00000000-0000-0000-0000-000000000804');
set role authenticated;
do $$ begin
  if (select count(*) from friendships) <> 0 then raise exception 'FAIL: outsider read a friendship'; end if;
  if (select count(*) from friend_codes) <> 0 then raise exception 'FAIL: outsider read friend codes'; end if;
  if (select count(*) from friend_request_log) <> 0 then raise exception 'FAIL: outsider read the request log'; end if;
  if (select count(*) from my_friends()) <> 0 then raise exception 'FAIL: outsider has friends'; end if;
end $$;
select expect_refused($q$insert into friendships (user_lo, user_hi, requested_by, status) values ('00000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000804', '00000000-0000-0000-0000-000000000804', 'accepted')$q$, 'wrote a friendship directly');
select expect_refused($q$select respond_friend_request('00000000-0000-0000-0000-000000000802', true)$q$, 'accepted a request sent to someone else');
reset role;
select as_user('00000000-0000-0000-0000-000000000802');
set role authenticated;
do $$ begin
  update friendships set status = 'accepted';
  if exists (select 1 from friendships where status = 'accepted') then raise exception 'FAIL: requester accepted their own request'; end if;
end $$;
select expect_refused($q$select respond_friend_request('00000000-0000-0000-0000-000000000801', true)$q$, 'requester accepted their own request');
reset role;

-- F4. A push goes to Ann for the request, unless she switched Friend Requests off.
insert into push_tokens (user_id, token, platform) values ('00000000-0000-0000-0000-000000000801', 'ann-token-0000000000000000000000000000000000000000', 'ios');
do $$ begin
  if (select title from push_batch_friends(jsonb_build_object('type', 'friend_request',
      'from', '00000000-0000-0000-0000-000000000802', 'to', '00000000-0000-0000-0000-000000000801'))) <> 'Friend Request' then
    raise exception 'FAIL: no push for a friend request';
  end if;
  if (select body from push_batch_friends(jsonb_build_object('type', 'friend_request',
      'from', '00000000-0000-0000-0000-000000000802', 'to', '00000000-0000-0000-0000-000000000801'))) <> 'Ben Friend wants to be friends on OnMyLead.' then
    raise exception 'FAIL: friend request push text';
  end if;
  -- A request that isn't there (wrong direction) sends nothing.
  if exists (select 1 from push_batch_friends(jsonb_build_object('type', 'friend_request',
      'from', '00000000-0000-0000-0000-000000000801', 'to', '00000000-0000-0000-0000-000000000802'))) then
    raise exception 'FAIL: push for a request nobody sent';
  end if;
end $$;
insert into notification_settings (user_id, friend_requests) values ('00000000-0000-0000-0000-000000000801', false)
on conflict (user_id) do update set friend_requests = false;
do $$ begin
  if exists (select 1 from push_batch_friends(jsonb_build_object('type', 'friend_request',
      'from', '00000000-0000-0000-0000-000000000802', 'to', '00000000-0000-0000-0000-000000000801'))) then
    raise exception 'FAIL: push with Friend Requests off';
  end if;
end $$;
update notification_settings set friend_requests = true where user_id = '00000000-0000-0000-0000-000000000801';
select as_user('00000000-0000-0000-0000-000000000802');
set role authenticated;
select expect_refused($q$select push_batch_friends('{"type":"friend_request"}'::jsonb)$q$, 'rider built pushes');
reset role;

-- F5. Ann accepts. They're friends: they can message each other without riding together first.
select as_user('00000000-0000-0000-0000-000000000801');
set role authenticated;
do $$ begin
  if respond_friend_request('00000000-0000-0000-0000-000000000802', true) <> 'accepted' then raise exception 'FAIL: accept'; end if;
end $$;
reset role;
do $$ begin
  if friends_of('00000000-0000-0000-0000-000000000801') <> '{"Ben Friend:friends"}'
     or friends_of('00000000-0000-0000-0000-000000000802') <> '{"Ann Friend:friends"}' then
    raise exception 'FAIL: not friends after accepting';
  end if;
  if not riders_know_each_other('00000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000802') then
    raise exception 'FAIL: friends don''t count as riders you know';
  end if;
  if (select title from push_batch_friends(jsonb_build_object('type', 'friend_accept',
      'from', '00000000-0000-0000-0000-000000000802', 'to', '00000000-0000-0000-0000-000000000801'))) <> 'New Friend' then
    raise exception 'FAIL: no push when a request is accepted';
  end if;
end $$;
select as_user('00000000-0000-0000-0000-000000000802');
set role authenticated;
select send_direct_message('00000000-0000-0000-0000-000000000801', 'Hey Ann, riding Saturday?');
reset role;

-- F6. Friends show in each other's Out Riding list ("Riders I Know"), with whole miles only.
-- A stranger who keeps the default doesn't.
select as_user('00000000-0000-0000-0000-000000000801');
set role authenticated;
select set_out_riding(35.5, -83.2);
reset role;
select as_user('00000000-0000-0000-0000-000000000802');
set role authenticated;
select set_out_riding(35.53, -83.21);
reset role;
select as_user('00000000-0000-0000-0000-000000000804');
set role authenticated;
select set_out_riding(35.51, -83.2);
reset role;
do $$ begin
  if seen_by('00000000-0000-0000-0000-000000000801') <> '{"Ben Friend"}' then raise exception 'FAIL: Ann should see only her friend Ben'; end if;
  perform as_user('00000000-0000-0000-0000-000000000801');
  set local role authenticated;
  if not (select known from nearby_riders() where display_name = 'Ben Friend') then raise exception 'FAIL: friend not marked known'; end if;
  if not (select out_now from my_friends() where display_name = 'Ben Friend') then raise exception 'FAIL: friend not shown Out Riding'; end if;
  if (select miles from my_friends() where display_name = 'Ben Friend') not in (1, 2, 3) then raise exception 'FAIL: friend miles'; end if;
  reset role;
end $$;
-- Ben stops: Ann's list no longer shows him out.
select as_user('00000000-0000-0000-0000-000000000802');
set role authenticated;
select stop_out_riding();
reset role;
do $$ begin
  perform as_user('00000000-0000-0000-0000-000000000801');
  set local role authenticated;
  if (select out_now from my_friends() where display_name = 'Ben Friend') or (select miles from my_friends() where display_name = 'Ben Friend') is not null then
    raise exception 'FAIL: friend shown out after stopping';
  end if;
  reset role;
end $$;

-- F7. Removing a friend ends it for both. They can ask again by id (they have a conversation),
-- and asking someone who already asked you accepts it.
select as_user('00000000-0000-0000-0000-000000000802');
set role authenticated;
do $$ begin
  if not remove_friend('00000000-0000-0000-0000-000000000801') then raise exception 'FAIL: remove friend'; end if;
end $$;
reset role;
do $$ begin
  if friends_of('00000000-0000-0000-0000-000000000801') <> '{}' then raise exception 'FAIL: friendship left after removing'; end if;
  if riders_know_each_other('00000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000802') then raise exception 'FAIL: still known after removing'; end if;
end $$;
select as_user('00000000-0000-0000-0000-000000000802');
set role authenticated;
do $$ begin
  if send_friend_request('00000000-0000-0000-0000-000000000801') <> 'requested' then raise exception 'FAIL: request by id after a conversation'; end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-000000000801');
set role authenticated;
do $$ begin
  if send_friend_request('00000000-0000-0000-0000-000000000802') <> 'accepted' then raise exception 'FAIL: asking back should accept'; end if;
end $$;
reset role;

-- F8. Blocking ends the friendship, and neither can ask again or preview the link.
select as_user('00000000-0000-0000-0000-000000000801');
set role authenticated;
insert into blocked_riders (blocked_id) values ('00000000-0000-0000-0000-000000000802');
reset role;
do $$ begin
  if exists (select 1 from friendships where '00000000-0000-0000-0000-000000000802' in (user_lo, user_hi)) then
    raise exception 'FAIL: blocking left the friendship';
  end if;
end $$;
do $$
declare v_code text := code_of('00000000-0000-0000-0000-000000000801');
begin
  perform as_user('00000000-0000-0000-0000-000000000802');
  execute 'set local role authenticated';
  if exists (select 1 from friend_preview(v_code)) then raise exception 'FAIL: blocked rider previewed the link'; end if;
  begin
    perform send_friend_request_by_code(v_code);
    raise exception 'FAIL: blocked rider sent a request';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like 'friend_not_allowed%' then raise exception 'FAIL: blocked rider got a different error: %', sqlerrm; end if;
  end;
  execute 'reset role';
end $$;
select as_user('00000000-0000-0000-0000-000000000801');
set role authenticated;
select expect_refused($q$select send_friend_request('00000000-0000-0000-0000-000000000802')$q$, 'blocker sent a request');
delete from blocked_riders where blocked_id = '00000000-0000-0000-0000-000000000802';
reset role;

-- F9. Riders you've ridden with are suggested and can be asked by id.
select as_user('00000000-0000-0000-0000-000000000801');
set role authenticated;
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility, max_vehicles)
values ('8f8f8f8f-8f8f-8f8f-8f8f-8f8f8f8f8f8f', auth.uid(), 'Smokies Run', now() + interval '1 day', 35.5, -83.2, 'public', 6);
reset role;
select as_user('00000000-0000-0000-0000-000000000803');
set role authenticated;
do $$ begin
  if join_ride('8f8f8f8f-8f8f-8f8f-8f8f-8f8f8f8f8f8f') <> 'joined' then raise exception 'FAIL: Cal should join'; end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-000000000801');
set role authenticated;
do $$ begin
  if (select array_agg(display_name || ':' || reason) from friend_suggestions()) <> '{"Cal Rider:Ridden With You"}' then
    raise exception 'FAIL: suggestions %', (select array_agg(display_name) from friend_suggestions());
  end if;
  if send_friend_request('00000000-0000-0000-0000-000000000803') <> 'requested' then raise exception 'FAIL: request to a rider you rode with'; end if;
  if exists (select 1 from friend_suggestions()) then raise exception 'FAIL: asked rider still suggested'; end if;
end $$;
reset role;

-- F10. Declining removes the request quietly; asking the same rider is limited to twice a week.
do $$
declare v_code text := code_of('00000000-0000-0000-0000-000000000804');
begin
  for i in 1..2 loop
    perform as_user('00000000-0000-0000-0000-000000000803');
    execute 'set local role authenticated';
    if send_friend_request_by_code(v_code) <> 'requested' then raise exception 'FAIL: request % to Dee', i; end if;
    execute 'reset role';
    perform as_user('00000000-0000-0000-0000-000000000804');
    execute 'set local role authenticated';
    if respond_friend_request('00000000-0000-0000-0000-000000000803', false) <> 'declined' then raise exception 'FAIL: decline'; end if;
    execute 'reset role';
  end loop;
  if exists (select 1 from friendships where '00000000-0000-0000-0000-000000000804' in (user_lo, user_hi)) then
    raise exception 'FAIL: declined request left behind';
  end if;
  perform as_user('00000000-0000-0000-0000-000000000803');
  execute 'set local role authenticated';
  begin
    perform send_friend_request_by_code(v_code);
    raise exception 'FAIL: third request to the same rider in a week';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  execute 'reset role';
end $$;

-- F11. A new friend link stops the old one working.
do $$
declare
  v_old text := code_of('00000000-0000-0000-0000-000000000804');
  v_new text;
begin
  perform as_user('00000000-0000-0000-0000-000000000804');
  execute 'set local role authenticated';
  v_new := reset_friend_code();
  execute 'reset role';
  if v_new = v_old then raise exception 'FAIL: same code after reset'; end if;
  perform as_user('00000000-0000-0000-0000-000000000801');
  execute 'set local role authenticated';
  if exists (select 1 from friend_preview(v_old)) then raise exception 'FAIL: old link still works'; end if;
  if (select display_name from friend_preview(v_new)) <> 'Dee Stranger' then raise exception 'FAIL: new link doesn''t work'; end if;
  execute 'reset role';
end $$;

-- F12. 30 requests a day at most.
insert into friend_request_log (sender_id, recipient_id)
select '00000000-0000-0000-0000-000000000802', '00000000-0000-0000-0000-000000000803' from generate_series(1, 30);
do $$
declare v_code text := code_of('00000000-0000-0000-0000-000000000804');
begin
  perform as_user('00000000-0000-0000-0000-000000000802');
  execute 'set local role authenticated';
  begin
    perform send_friend_request_by_code(v_code);
    raise exception 'FAIL: more than 30 requests a day';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like 'friend_daily_limit%' then raise exception 'FAIL: wrong limit error: %', sqlerrm; end if;
  end;
  execute 'reset role';
end $$;

-- F13. Signed-out visitors get nothing.
select as_user(null);
set role anon;
select expect_refused($q$select * from my_friends()$q$, 'anonymous friends list');
select expect_refused($q$select * from friend_preview('ABC')$q$, 'anonymous link preview');
select expect_refused($q$select send_friend_request_by_code('ABC')$q$, 'anonymous request');
select expect_refused($q$select my_friend_code()$q$, 'anonymous friend code');
reset role;

-- F14. Deleting an account removes its friendships and code.
delete from auth.users where id = '00000000-0000-0000-0000-000000000803';
do $$ begin
  if exists (select 1 from friendships where '00000000-0000-0000-0000-000000000803' in (user_lo, user_hi)) then
    raise exception 'FAIL: deleted account left a friendship behind';
  end if;
end $$;

select 'ALL FRIENDS TESTS PASSED' as result;
