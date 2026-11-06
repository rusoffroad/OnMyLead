-- Comment likes and replies (20261104220000_comment_likes_replies.sql). Runs right after
-- social_hub_test.sql (run_local.sh), with its riders, and before edit_ride_test.sql swaps
-- queue_push for a logger (these tests read rider_notifications).
--
--   Ann  0ee1  posts; friends with Ben, Dee, Eli, Fay; has blocked Dee
--   Ben  0ee2  Ann's friend, Pro
--   Cal  0ee3  a stranger to everyone
--   Dee  0ee4  blocked by Ann
--   Eli  0ee5  Ann's friend, Pro
--   Fay  0ee6  Ann's friend, on Free
insert into notification_settings (user_id, feed_activity) values ('00000000-0000-0000-0000-000000000ee1', true)
  on conflict (user_id) do update set feed_activity = true;
insert into push_tokens (user_id, token, platform) values
  ('00000000-0000-0000-0000-000000000ee5', 'eli-social-phone-0000000000000', 'ios')
on conflict do nothing;
delete from rider_notifications;

create table reply_ids (name text primary key, id uuid);
grant all on reply_ids to authenticated;
create function reply_key() returns text language sql as $$ select 'post:' || (select id from reply_ids where name = 'post') $$;
grant execute on function reply_key() to authenticated;
create function reply_id(p text) returns uuid language sql as $$ select id from reply_ids where name = p $$;
grant execute on function reply_id(text) to authenticated;

-- R1. Ann posts; Ben comments.
select as_user('00000000-0000-0000-0000-000000000ee1');
set role authenticated;
insert into reply_ids values ('post', create_rider_post('Ride report: Hatfield-McCoy', null));
reset role;
select as_user('00000000-0000-0000-0000-000000000ee2');
set role authenticated;
insert into reply_ids values ('c1', add_feed_comment(reply_key(), 'Nice'));
reset role;

-- R2. Ann likes Ben's comment (twice counts once); Ben is told once; unlike and like again works.
select as_user('00000000-0000-0000-0000-000000000ee1');
set role authenticated;
do $$ declare n int; begin
  n := set_comment_like(reply_id('c1'), true);
  n := set_comment_like(reply_id('c1'), true);
  if n <> 1 then raise exception 'FAIL: double comment like counted %', n; end if;
  if not (select liked from feed_item_thread(reply_key()) where id = reply_id('c1')) then raise exception 'FAIL: liked flag'; end if;
  if set_comment_like(reply_id('c1'), false) <> 0 then raise exception 'FAIL: unlike'; end if;
  if set_comment_like(reply_id('c1'), true) <> 1 then raise exception 'FAIL: like again'; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from rider_notifications where user_id = '00000000-0000-0000-0000-000000000ee2' and kind = 'feed_like') <> 1 then
    raise exception 'FAIL: Ben should have one like notification: %', (select string_agg(body, ' | ') from rider_notifications where user_id = '00000000-0000-0000-0000-000000000ee2');
  end if;
  if (select body from rider_notifications where user_id = '00000000-0000-0000-0000-000000000ee2' and kind = 'feed_like') <> 'Ann Social liked your comment: “Nice”' then
    raise exception 'FAIL: comment like text %', (select body from rider_notifications where user_id = '00000000-0000-0000-0000-000000000ee2' and kind = 'feed_like');
  end if;
  if (select data ->> 'commentId' from rider_notifications where user_id = '00000000-0000-0000-0000-000000000ee2' and kind = 'feed_like') <> reply_id('c1')::text then
    raise exception 'FAIL: like notification should carry the comment';
  end if;
end $$;

-- R3. Cal (a stranger) and Dee (blocked) can't see, like or reply to the comment.
select as_user('00000000-0000-0000-0000-000000000ee3');
set role authenticated;
select expect_refused($q$select set_comment_like(reply_id('c1'), true)$q$, 'stranger liked a comment');
select expect_refused($q$select add_feed_reply(reply_id('c1'), 'hi')$q$, 'stranger replied');
do $$ begin
  if exists (select 1 from feed_item_thread(reply_key())) then raise exception 'FAIL: stranger read the thread'; end if;
end $$;
select expect_refused($q$select set_comment_like(gen_random_uuid(), true)$q$, 'liked a comment that doesn''t exist');
reset role;
select as_user('00000000-0000-0000-0000-000000000ee4');
set role authenticated;
select expect_refused($q$select set_comment_like(reply_id('c1'), true)$q$, 'blocked rider liked a comment');
select expect_refused($q$select add_feed_reply(reply_id('c1'), 'hi')$q$, 'blocked rider replied');
reset role;

-- R4. Eli replies to Ben's comment; Ann replies to Eli's reply (it joins the same thread).
select as_user('00000000-0000-0000-0000-000000000ee5');
set role authenticated;
insert into reply_ids values ('r1', add_feed_reply(reply_id('c1'), '  Agreed  '));
select expect_refused($q$select add_feed_reply(reply_id('c1'), '   ')$q$, 'empty reply');
select expect_refused($q$select add_feed_reply(reply_id('c1'), repeat('z', 501))$q$, '501 character reply');
reset role;
select as_user('00000000-0000-0000-0000-000000000ee1');
set role authenticated;
insert into reply_ids values ('r2', add_feed_reply(reply_id('r1'), 'Next time you lead'));
reset role;
do $$ begin
  if (select parent_id from feed_comments where id = reply_id('r1')) <> reply_id('c1')
     or (select parent_id from feed_comments where id = reply_id('r2')) <> reply_id('c1')
     or (select reply_to_id from feed_comments where id = reply_id('r2')) <> reply_id('r1') then
    raise exception 'FAIL: reply threading';
  end if;
  if (select body from feed_comments where id = reply_id('r1')) <> 'Agreed' then raise exception 'FAIL: reply not trimmed'; end if;
  -- Ben wrote the comment Eli answered.
  if not exists (select 1 from rider_notifications where user_id = '00000000-0000-0000-0000-000000000ee2'
                 and body = 'Eli Social replied to your comment on Ann Social’s post: “Agreed”') then
    raise exception 'FAIL: Ben not told about Eli''s reply: %', (select string_agg(body, ' | ') from rider_notifications where user_id = '00000000-0000-0000-0000-000000000ee2');
  end if;
  -- Ann's post.
  if not exists (select 1 from rider_notifications where user_id = '00000000-0000-0000-0000-000000000ee1'
                 and body = 'Eli Social replied on your post: “Agreed”') then
    raise exception 'FAIL: Ann not told about Eli''s reply: %', (select string_agg(body, ' | ') from rider_notifications where user_id = '00000000-0000-0000-0000-000000000ee1');
  end if;
  -- Ann answered Eli.
  if not exists (select 1 from rider_notifications where user_id = '00000000-0000-0000-0000-000000000ee5'
                 and body = 'Ann Social replied to your comment on Ann Social’s post: “Next time you lead”') then
    raise exception 'FAIL: Eli not told about Ann''s reply: %', (select string_agg(body, ' | ') from rider_notifications where user_id = '00000000-0000-0000-0000-000000000ee5');
  end if;
  if exists (select 1 from rider_notifications where user_id = '00000000-0000-0000-0000-000000000ee5' and body like 'Eli Social%') then
    raise exception 'FAIL: Eli told about his own reply';
  end if;
end $$;

-- R5. Ben reads the thread: three rows, replies under Ben's comment, whom Ann answered, likes.
-- A 2.0 build (feed_item_comments) still gets every comment and reply.
select as_user('00000000-0000-0000-0000-000000000ee2');
set role authenticated;
do $$ begin
  if (select count(*) from feed_item_thread(reply_key())) <> 3 then raise exception 'FAIL: thread rows %', (select count(*) from feed_item_thread(reply_key())); end if;
  if (select like_count from feed_item_thread(reply_key()) where id = reply_id('c1')) <> 1 then raise exception 'FAIL: comment like_count'; end if;
  if (select liked from feed_item_thread(reply_key()) where id = reply_id('c1')) then raise exception 'FAIL: Ben didn''t like it'; end if;
  if (select reply_to_name from feed_item_thread(reply_key()) where id = reply_id('r2')) <> 'Eli Social' then raise exception 'FAIL: reply_to_name'; end if;
  if (select reply_to_name from feed_item_thread(reply_key()) where id = reply_id('r1')) is not null then raise exception 'FAIL: a direct reply names no one'; end if;
  if (select count(*) from feed_item_comments(reply_key())) <> 3 then raise exception 'FAIL: old comments call'; end if;
  if (select comment_count from feed_item(reply_key())) <> 3 then raise exception 'FAIL: comment_count counts replies'; end if;
  -- Ben can't delete Eli's reply (it's on Ann's post, not his).
  begin
    perform delete_feed_comment(reply_id('r1'));
    raise exception 'FAIL: Ben deleted Eli''s reply';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
reset role;

-- R6. Fay (Free) likes a reply but can't reply. A second like within 15 minutes sends no push.
select as_user('00000000-0000-0000-0000-000000000ee6');
set role authenticated;
do $$ begin
  if set_comment_like(reply_id('r1'), true) <> 1 then raise exception 'FAIL: Free rider liking a reply'; end if;
end $$;
select expect_refused($q$select add_feed_reply(reply_id('c1'), 'free reply')$q$, 'Free rider replied');
reset role;
select as_user('00000000-0000-0000-0000-000000000ee2');
set role authenticated;
select set_comment_like(reply_id('r1'), true);
reset role;
do $$ begin
  if (select count(*) from rider_notifications where user_id = '00000000-0000-0000-0000-000000000ee5' and kind = 'feed_like') <> 1 then
    raise exception 'FAIL: Eli should have one like notification, has %', (select count(*) from rider_notifications where user_id = '00000000-0000-0000-0000-000000000ee5' and kind = 'feed_like');
  end if;
  if (select body from rider_notifications where user_id = '00000000-0000-0000-0000-000000000ee5' and kind = 'feed_like') <> 'Fay Social liked your reply: “Agreed”' then
    raise exception 'FAIL: reply like text %', (select body from rider_notifications where user_id = '00000000-0000-0000-0000-000000000ee5' and kind = 'feed_like');
  end if;
end $$;

-- R7. Admin: the rider's comments say which are replies and their likes. Hiding the top comment
-- hides its replies too; restoring brings them back.
select as_admin_session('00000000-0000-0000-0000-00000000ad01', 'aal2');
do $$ declare j jsonb; begin
  j := admin_rider_social('00000000-0000-0000-0000-000000000ee5');
  if not exists (select 1 from jsonb_array_elements(j -> 'comments') e
                 where e ->> 'id' = reply_id('r1')::text and e ->> 'parent_id' = reply_id('c1')::text and (e ->> 'likes')::int = 2) then
    raise exception 'FAIL: admin_rider_social reply %', j;
  end if;
  perform admin_set_comment_hidden(reply_id('c1'), true, 'Rude');
end $$;
select as_admin_session(null, 'aal1');
select as_user('00000000-0000-0000-0000-000000000ee2');
set role authenticated;
do $$ begin
  if exists (select 1 from feed_item_thread(reply_key())) then raise exception 'FAIL: replies under a hidden comment still shown'; end if;
  -- 2.0 builds and the Feed's counts and preview leave them out too.
  if exists (select 1 from feed_item_comments(reply_key()) where id in (reply_id('r1'), reply_id('r2'))) then
    raise exception 'FAIL: feed_item_comments shows replies under a hidden comment';
  end if;
end $$;
reset role;
do $$ begin
  if (select comment_count from feed_item_stats('00000000-0000-0000-0000-000000000ee2', reply_key()))
     <> (select count(*) from feed_comments where item_key = reply_key() and hidden_at is null and parent_id is distinct from reply_id('c1')) then
    raise exception 'FAIL: comment count still counts replies under a hidden comment';
  end if;
  if exists (select 1 from rider_notifications where data ->> 'commentId' in (reply_id('r1')::text, reply_id('r2')::text)) then
    raise exception 'FAIL: notifications about replies under a hidden comment left behind';
  end if;
end $$;
set role authenticated;
reset role;
select as_user('00000000-0000-0000-0000-000000000ee6');
set role authenticated;
select expect_refused($q$select set_comment_like(reply_id('r1'), false)$q$, 'liked a reply under a hidden comment');
reset role;
select as_admin_session('00000000-0000-0000-0000-00000000ad01', 'aal2');
select admin_set_comment_hidden(reply_id('c1'), false);
select as_admin_session(null, 'aal1');

-- R7b. A hidden reply's writer isn't named on the replies that answered it.
select as_admin_session('00000000-0000-0000-0000-00000000ad01', 'aal2');
select admin_set_comment_hidden(reply_id('r1'), true, 'Rude');
select as_admin_session(null, 'aal1');
select as_user('00000000-0000-0000-0000-000000000ee2');
set role authenticated;
do $$ begin
  if not exists (select 1 from feed_item_thread(reply_key()) where id = reply_id('r2')) then raise exception 'FAIL: Ann''s reply went with Eli''s'; end if;
  if (select reply_to_name from feed_item_thread(reply_key()) where id = reply_id('r2')) is not null then
    raise exception 'FAIL: reply_to_name names the writer of a hidden reply';
  end if;
end $$;
reset role;
select as_admin_session('00000000-0000-0000-0000-00000000ad01', 'aal2');
select admin_set_comment_hidden(reply_id('r1'), false);
select as_admin_session(null, 'aal1');

-- R7c. A reply's push skips riders the thread is hidden from: Eli blocks Ben (who wrote the top
-- comment), and Ann's answer to Eli no longer pushes him.
do $$ begin
  if not exists (select 1 from push_batch_feed(jsonb_build_object('type', 'feed_comment', 'id', reply_id('r2'))) b
                 where b.user_id = '00000000-0000-0000-0000-000000000ee5') then
    raise exception 'FAIL: Eli not pushed about Ann''s answer';
  end if;
  insert into blocked_riders (blocker_id, blocked_id) values ('00000000-0000-0000-0000-000000000ee5', '00000000-0000-0000-0000-000000000ee2');
  if exists (select 1 from push_batch_feed(jsonb_build_object('type', 'feed_comment', 'id', reply_id('r2'))) b
             where b.user_id = '00000000-0000-0000-0000-000000000ee5') then
    raise exception 'FAIL: pushed a reply in a thread hidden from the rider';
  end if;
  delete from blocked_riders where blocker_id = '00000000-0000-0000-0000-000000000ee5' and blocked_id = '00000000-0000-0000-0000-000000000ee2';
end $$;

-- R8. Ben deletes his comment: its replies, their likes and the notifications about them go too.
select as_user('00000000-0000-0000-0000-000000000ee2');
set role authenticated;
select delete_feed_comment(reply_id('c1'));
reset role;
do $$ begin
  if exists (select 1 from feed_comments where id in (reply_id('c1'), reply_id('r1'), reply_id('r2'))) then raise exception 'FAIL: replies left behind'; end if;
  if exists (select 1 from feed_comment_likes) then raise exception 'FAIL: comment likes left behind'; end if;
  if exists (select 1 from rider_notifications where data ->> 'commentId' in (reply_id('c1')::text, reply_id('r1')::text, reply_id('r2')::text)) then
    raise exception 'FAIL: notifications about deleted replies left behind';
  end if;
end $$;

-- R9. Riders can't touch the likes table directly.
select as_user('00000000-0000-0000-0000-000000000ee2');
set role authenticated;
select expect_refused($q$insert into feed_comment_likes (comment_id, user_id) values (gen_random_uuid(), auth.uid())$q$, 'wrote feed_comment_likes directly');
reset role;

drop function reply_key();
drop function reply_id(text);
drop table reply_ids;
select 'ALL COMMENT REPLY TESTS PASSED' as result;
