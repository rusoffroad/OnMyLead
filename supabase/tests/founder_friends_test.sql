-- Founder friends (migration 20261118100000_founder_friends.sql): whoever holds the OnMyLead
-- Founder honor is friends with every rider, old and new, with no push; the feed works both ways;
-- Out Riding never widens; removing or blocking sticks; taking the honor back undoes it.
-- Runs last-ish in run_local.sh: as_user / expect_refused come from privacy_test.sql.
--
-- Riders (all new here):
--   Fay  0a01  gets the Founder honor
--   Rob  0a02  an ordinary rider
--   Ola  0a03  Out Riding near Fay, "Riders I Know"
--   Bea  0a04  blocks Fay, then unblocks
--   Uma  0a05  removes Fay as a friend
--   Pam  0a06  had already sent Fay a friend request
--   Nia  0a07  signs up after Fay is the Founder
--   Kim  0a08  a real friend of Fay's (asked and accepted)
-- privacy_test.sql grants every function and table to authenticated; put back what the migration
-- revoked, as it stands on Supabase.
revoke execute on function is_founder(uuid), founder_friend_add(uuid, uuid), founder_friend_everyone(uuid),
  founder_friend_optout(uuid, uuid), riders_know_each_other_nearby(uuid, uuid) from anon, authenticated;
revoke all on founder_friend_optouts from anon, authenticated;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000a01', '{"full_name":"Fay Founder"}'),
  ('00000000-0000-0000-0000-000000000a02', '{"full_name":"Rob Rider"}'),
  ('00000000-0000-0000-0000-000000000a03', '{"full_name":"Ola Out"}'),
  ('00000000-0000-0000-0000-000000000a04', '{"full_name":"Bea Blocker"}'),
  ('00000000-0000-0000-0000-000000000a05', '{"full_name":"Uma Unfriend"}'),
  ('00000000-0000-0000-0000-000000000a06', '{"full_name":"Pam Pending"}'),
  ('00000000-0000-0000-0000-000000000a08', '{"full_name":"Kim Real"}');

create function ff_row(p_a text, p_b text) returns friendships language sql as $$
  select * from friendships where user_lo = least(p_a::uuid, p_b::uuid) and user_hi = greatest(p_a::uuid, p_b::uuid);
$$;

-- Before the honor: Pam asked Fay; Kim and Fay are real friends.
insert into friendships (user_lo, user_hi, requested_by) values
  ('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a06', '00000000-0000-0000-0000-000000000a06');
insert into friendships (user_lo, user_hi, requested_by, status, accepted_at) values
  ('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a08', '00000000-0000-0000-0000-000000000a08', 'accepted', now());

-- FF1. Giving Fay the Founder honor makes her friends with every rider, quietly.
do $$
declare
  v_pushes int := (select count(*) from net.calls where body ->> 'type' in ('friend_request', 'friend_accept'));
  v_r friendships;
begin
  insert into rider_badges (user_id, badge, level) values ('00000000-0000-0000-0000-000000000a01', 'founder', 1);
  if (select count(*) from friendships where founder and '00000000-0000-0000-0000-000000000a01' in (user_lo, user_hi))
     <> (select count(*) from profiles where id <> '00000000-0000-0000-0000-000000000a01') - 1 then
    raise exception 'FAIL: founder should be friends with every rider but the real friend';
  end if;
  v_r := ff_row('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a02');
  if v_r.status <> 'accepted' or not v_r.founder then raise exception 'FAIL: Rob not a founder friend'; end if;
  v_r := ff_row('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a06');
  if v_r.status <> 'accepted' or not v_r.founder then raise exception 'FAIL: Pam''s waiting request not accepted'; end if;
  v_r := ff_row('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a08');
  if v_r.status <> 'accepted' or v_r.founder then raise exception 'FAIL: Kim''s real friendship changed'; end if;
  if (select count(*) from net.calls where body ->> 'type' in ('friend_request', 'friend_accept')) <> v_pushes then
    raise exception 'FAIL: founder friendships should send no pushes';
  end if;
end $$;

-- FF2. A rider who signs up later is friends with the founder right away.
insert into auth.users (id, raw_user_meta_data) values ('00000000-0000-0000-0000-000000000a07', '{"full_name":"Nia New"}');
do $$ begin
  if not riders_are_friends('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a07') then
    raise exception 'FAIL: new rider not friends with the founder';
  end if;
  if not (ff_row('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a07')).founder then
    raise exception 'FAIL: new rider friendship not marked founder';
  end if;
end $$;

-- FF3. The feed works both ways, and a rider's own choice still wins.
do $$ begin
  if not feed_can_see('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a02') then
    raise exception 'FAIL: founder should see Rob''s activity';
  end if;
  if not feed_can_see('00000000-0000-0000-0000-000000000a02', '00000000-0000-0000-0000-000000000a01') then
    raise exception 'FAIL: Rob should see the founder''s activity';
  end if;
  insert into rider_feed_settings (user_id, share_with) values ('00000000-0000-0000-0000-000000000a02', 'nobody');
  if feed_can_see('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a02') then
    raise exception 'FAIL: Rob chose Nobody, the founder should not see his activity';
  end if;
end $$;

-- FF4. Rob sees Fay in his Friends list (any app build), and Fay sees Rob.
do $$ begin
  perform as_user('00000000-0000-0000-0000-000000000a02');
  execute 'set local role authenticated';
  if not exists (select 1 from my_friends() where user_id = '00000000-0000-0000-0000-000000000a01' and status = 'friends') then
    raise exception 'FAIL: founder missing from Rob''s friends';
  end if;
  execute 'reset role';
end $$;

-- FF5. Out Riding never widens: Fay and Ola are Out Riding a mile apart on "Riders I Know".
insert into out_riding (user_id, area_lat, area_lng, audience, expires_at) values
  ('00000000-0000-0000-0000-000000000a01', 36.10, -84.20, 'riders', now() + interval '2 hours'),
  ('00000000-0000-0000-0000-000000000a03', 36.11, -84.20, 'riders', now() + interval '2 hours'),
  ('00000000-0000-0000-0000-000000000a08', 36.11, -84.21, 'riders', now() + interval '2 hours');
do $$ begin
  if out_riding_visible('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a03')
     or out_riding_visible('00000000-0000-0000-0000-000000000a03', '00000000-0000-0000-0000-000000000a01') then
    raise exception 'FAIL: a founder friendship must not show Out Riding';
  end if;
  if not out_riding_visible('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a08') then
    raise exception 'FAIL: a real friend should still see Out Riding';
  end if;
  perform as_user('00000000-0000-0000-0000-000000000a01');
  execute 'set local role authenticated';
  if exists (select 1 from my_friends() where user_id = '00000000-0000-0000-0000-000000000a03' and out_now) then
    raise exception 'FAIL: Friends list shows Ola Out Riding to the founder';
  end if;
  execute 'reset role';
end $$;
delete from out_riding where user_id in ('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a03', '00000000-0000-0000-0000-000000000a08');

-- FF6. Uma removes Fay; she stays removed, even when everyone is added again.
do $$ begin
  perform as_user('00000000-0000-0000-0000-000000000a05');
  execute 'set local role authenticated';
  if not remove_friend('00000000-0000-0000-0000-000000000a01') then raise exception 'FAIL: Uma could not remove the founder'; end if;
  execute 'reset role';
  perform founder_friend_everyone('00000000-0000-0000-0000-000000000a01');
  if riders_are_friends('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a05') then
    raise exception 'FAIL: founder came back after Uma removed her';
  end if;
end $$;

-- FF7. Bea blocks Fay, then unblocks: still not friends. Founder removing a rider sticks too.
do $$ begin
  insert into blocked_riders (blocker_id, blocked_id) values ('00000000-0000-0000-0000-000000000a04', '00000000-0000-0000-0000-000000000a01');
  if riders_are_friends('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a04') then
    raise exception 'FAIL: block should end the founder friendship';
  end if;
  delete from blocked_riders where blocker_id = '00000000-0000-0000-0000-000000000a04';
  perform founder_friend_everyone('00000000-0000-0000-0000-000000000a01');
  if riders_are_friends('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a04') then
    raise exception 'FAIL: founder came back after Bea unblocked';
  end if;

  perform as_user('00000000-0000-0000-0000-000000000a01');
  execute 'set local role authenticated';
  perform remove_friend('00000000-0000-0000-0000-000000000a06');
  execute 'reset role';
  perform founder_friend_everyone('00000000-0000-0000-0000-000000000a01');
  if riders_are_friends('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a06') then
    raise exception 'FAIL: Pam came back after the founder removed her';
  end if;
end $$;

-- FF8. Riders can't read or change the opt-out list, or call the founder functions.
select as_user('00000000-0000-0000-0000-000000000a05');
set role authenticated;
select expect_refused($q$select 1 from founder_friend_optouts$q$, 'rider reading founder opt-outs');
select expect_refused($q$select founder_friend_everyone('00000000-0000-0000-0000-000000000a01')$q$, 'rider calling founder_friend_everyone');
select expect_refused($q$select founder_friend_add('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a05')$q$, 'rider calling founder_friend_add');
select expect_refused($q$delete from founder_friend_optouts$q$, 'rider deleting founder opt-outs');
reset role;

-- FF9. Uma changes her mind: a normal friend request by link still works.
do $$
declare v_code text;
begin
  perform as_user('00000000-0000-0000-0000-000000000a01');
  execute 'set local role authenticated';
  v_code := my_friend_code();
  execute 'reset role';
  perform as_user('00000000-0000-0000-0000-000000000a05');
  execute 'set local role authenticated';
  if send_friend_request_by_code(v_code) <> 'requested' then raise exception 'FAIL: Uma can''t ask the founder again'; end if;
  execute 'reset role';
end $$;

-- FF10. Taking the honor back removes the founder friendships, keeps real ones.
do $$ begin
  delete from rider_badges where user_id = '00000000-0000-0000-0000-000000000a01' and badge = 'founder';
  if exists (select 1 from friendships where founder and '00000000-0000-0000-0000-000000000a01' in (user_lo, user_hi)) then
    raise exception 'FAIL: founder friendships left after the honor was taken back';
  end if;
  if not riders_are_friends('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a08') then
    raise exception 'FAIL: Kim''s real friendship went with the honor';
  end if;
end $$;

select set_config('request.jwt.claims', '', false), set_config('request.jwt.claim.sub', '', false);
