-- Social (20261102900000_social_hub.sql): posts, likes, comments, profiles, reports and admin
-- moderation. Runs after home_feed_test.sql and abuse_reports_test.sql (run_local.sh): as_user and
-- expect_refused come from privacy_test.sql.
--
-- Riders (all new here):
--   Ann  0ee1  posts; friends with Ben, Dee, Eli, Fay
--   Ben  0ee2  Ann's friend
--   Cal  0ee3  a stranger to everyone
--   Dee  0ee4  Ann's friend; later Ann blocks her
--   Eli  0ee5  Ann's friend
--   Fay  0ee6  Ann's friend, on Free (everyone else has Pro)
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000ee1', '{"full_name":"Ann Social"}'),
  ('00000000-0000-0000-0000-000000000ee2', '{"full_name":"Ben Social"}'),
  ('00000000-0000-0000-0000-000000000ee3', '{"full_name":"Cal Social"}'),
  ('00000000-0000-0000-0000-000000000ee4', '{"full_name":"Dee Social"}'),
  ('00000000-0000-0000-0000-000000000ee5', '{"full_name":"Eli Social"}'),
  ('00000000-0000-0000-0000-000000000ee6', '{"full_name":"Fay Social"}');
insert into friendships (user_lo, user_hi, requested_by, status, accepted_at)
select '00000000-0000-0000-0000-000000000ee1', u::uuid, '00000000-0000-0000-0000-000000000ee1', 'accepted', now()
from unnest(array['00000000-0000-0000-0000-000000000ee2', '00000000-0000-0000-0000-000000000ee4',
                  '00000000-0000-0000-0000-000000000ee5', '00000000-0000-0000-0000-000000000ee6']) u;
insert into entitlement_grants (user_id, source, starts_at, ends_at)
select u::uuid, 'trial', now(), now() + interval '30 days'
from unnest(array['00000000-0000-0000-0000-000000000ee1', '00000000-0000-0000-0000-000000000ee2',
                  '00000000-0000-0000-0000-000000000ee4', '00000000-0000-0000-0000-000000000ee5']) u
on conflict do nothing;
-- Fay's signup trial (if trials are on) has ended.
update entitlement_grants set starts_at = now() - interval '40 days', ends_at = now() - interval '10 days'
where user_id = '00000000-0000-0000-0000-000000000ee6';
insert into push_tokens (user_id, token, platform) values
  ('00000000-0000-0000-0000-000000000ee1', 'ann-social-phone-0000000000000', 'ios'),
  ('00000000-0000-0000-0000-000000000ee2', 'ben-social-phone-0000000000000', 'android');
insert into rider_badges (user_id, badge, level, earned_at) values
  ('00000000-0000-0000-0000-000000000ee1', 'crew_rider', 1, now() - interval '1 day');

create table social_ids (name text primary key, id uuid);
grant all on social_ids to authenticated;

-- S1. Ann posts (text, then a photo in her own folder). Bad posts are refused.
select as_user('00000000-0000-0000-0000-000000000ee1');
set role authenticated;
insert into social_ids values ('post', create_rider_post('  Great day at Windrock!  ', null));
insert into social_ids values ('photo', create_rider_post(null, '00000000-0000-0000-0000-000000000ee1/abc123-1.jpg'));
select expect_refused($q$select create_rider_post('   ', null)$q$, 'empty post');
select expect_refused($q$select create_rider_post(repeat('x', 501), null)$q$, '501 character post');
select expect_refused($q$select create_rider_post('hi', '00000000-0000-0000-0000-000000000ee2/abc.jpg')$q$, 'photo in another rider''s folder');
select expect_refused($q$select create_rider_post('hi', 'https://evil.example/x.jpg')$q$, 'photo from another site');
do $$ begin
  -- Row level security with no policies: even with table grants a rider reads nothing directly.
  if exists (select 1 from rider_posts) or exists (select 1 from feed_comments) or exists (select 1 from feed_likes) then
    raise exception 'FAIL: read social tables directly';
  end if;
end $$;
select expect_refused($q$insert into feed_likes (item_key, user_id, owner_id) values ('x', auth.uid(), auth.uid())$q$, 'wrote feed_likes directly');
reset role;
do $$ begin
  if (select body from rider_posts where id = (select id from social_ids where name = 'post')) <> 'Great day at Windrock!' then
    raise exception 'FAIL: post body not trimmed';
  end if;
end $$;

-- S2. Ben (friend) sees Ann's posts in his Social feed; Cal (stranger) doesn't. Ann sees her own.
create function social_keys(p_user text) returns text[] language plpgsql as $$
declare v text[];
begin
  perform as_user(p_user::uuid);
  execute 'set local role authenticated';
  select coalesce(array_agg(f.kind || ':' || f.actor_name || ':' || coalesce(f.body, '-') order by f.kind, f.body), '{}') into v from social_feed(30, null) f;
  execute 'reset role';
  return v;
end $$;
do $$ declare v text[]; begin
  v := social_keys('00000000-0000-0000-0000-000000000ee2');
  if not ('post:Ann Social:Great day at Windrock!' = any (v)) or not ('badge:Ann Social:-' = any (v)) then
    raise exception 'FAIL: Ben''s feed %', v;
  end if;
  v := social_keys('00000000-0000-0000-0000-000000000ee3');
  if array_length(v, 1) is not null then raise exception 'FAIL: stranger Cal sees %', v; end if;
  v := social_keys('00000000-0000-0000-0000-000000000ee1');
  if not ('post:Ann Social:Great day at Windrock!' = any (v)) or 'badge:Ann Social:-' = any (v) then
    raise exception 'FAIL: Ann''s own feed should have her posts only: %', v;
  end if;
end $$;

-- S3. Likes: Ben likes Ann's post (once, even twice); Cal can't; unlike works; Ann is notified once.
select as_user('00000000-0000-0000-0000-000000000ee2');
set role authenticated;
do $$ declare k text := 'post:' || (select id from social_ids where name = 'post'); n int; begin
  n := set_feed_like(k, true);
  n := set_feed_like(k, true);
  if n <> 1 then raise exception 'FAIL: double like counted %', n; end if;
  if not (select liked from feed_item(k)) then raise exception 'FAIL: liked flag missing'; end if;
  if (select like_count from feed_item(k)) <> 1 then raise exception 'FAIL: like_count'; end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-000000000ee3');
set role authenticated;
select expect_refused(format($q$select set_feed_like('post:%s', true)$q$, (select id from social_ids where name = 'post')), 'stranger liked');
select expect_refused(format($q$select add_feed_comment('post:%s', 'hi')$q$, (select id from social_ids where name = 'post')), 'stranger commented');
do $$ begin
  if exists (select 1 from feed_item('post:' || (select id from social_ids where name = 'post'))) then raise exception 'FAIL: stranger opened the post'; end if;
  if exists (select 1 from feed_item_comments('post:' || (select id from social_ids where name = 'post'))) then raise exception 'FAIL: stranger read comments'; end if;
end $$;
select expect_refused($q$select set_feed_like('ride:not-a-key', true)$q$, 'malformed key');
reset role;
do $$ begin
  if (select count(*) from rider_notifications where user_id = '00000000-0000-0000-0000-000000000ee1' and kind = 'feed_like') <> 1 then
    raise exception 'FAIL: Ann should have one like notification, has %',
      (select count(*) from rider_notifications where user_id = '00000000-0000-0000-0000-000000000ee1' and kind = 'feed_like');
  end if;
  if (select body from rider_notifications where user_id = '00000000-0000-0000-0000-000000000ee1' and kind = 'feed_like') <> 'Ben Social liked your post.' then
    raise exception 'FAIL: like text %', (select body from rider_notifications where user_id = '00000000-0000-0000-0000-000000000ee1' and kind = 'feed_like');
  end if;
end $$;

-- S4. Comments: Ben comments; Ann replies; Ben gets "also commented"; Dee comments, then is blocked
-- by Ann: Dee's comment disappears for Ann, and Dee can no longer see the post.
select as_user('00000000-0000-0000-0000-000000000ee2');
set role authenticated;
insert into social_ids values ('ben_comment', add_feed_comment('post:' || (select id from social_ids where name = 'post'), '  Looks epic  '));
select expect_refused(format($q$select add_feed_comment('post:%s', '   ')$q$, (select id from social_ids where name = 'post')), 'empty comment');
select expect_refused(format($q$select add_feed_comment('post:%s', repeat('y', 501))$q$, (select id from social_ids where name = 'post')), '501 character comment');
reset role;
select as_user('00000000-0000-0000-0000-000000000ee1');
set role authenticated;
select add_feed_comment('post:' || (select id from social_ids where name = 'post'), 'Thanks Ben');
reset role;
select as_user('00000000-0000-0000-0000-000000000ee4');
set role authenticated;
insert into social_ids values ('dee_comment', add_feed_comment('post:' || (select id from social_ids where name = 'post'), 'Wish I was there'));
reset role;
do $$ begin
  if (select body from rider_notifications where user_id = '00000000-0000-0000-0000-000000000ee1' and kind = 'feed_comment' order by created_at limit 1)
     <> 'Ben Social commented on your post: “Looks epic”' then
    raise exception 'FAIL: comment text %', (select string_agg(body, ' | ') from rider_notifications where user_id = '00000000-0000-0000-0000-000000000ee1' and kind = 'feed_comment');
  end if;
  if not exists (select 1 from rider_notifications where user_id = '00000000-0000-0000-0000-000000000ee2' and body = 'Ann Social also commented on Ann Social’s post: “Thanks Ben”') then
    raise exception 'FAIL: Ben not told about Ann''s reply: %', (select string_agg(body, ' | ') from rider_notifications where user_id = '00000000-0000-0000-0000-000000000ee2');
  end if;
end $$;
insert into blocked_riders (blocker_id, blocked_id) values ('00000000-0000-0000-0000-000000000ee1', '00000000-0000-0000-0000-000000000ee4');
select as_user('00000000-0000-0000-0000-000000000ee1');
set role authenticated;
do $$ declare k text := 'post:' || (select id from social_ids where name = 'post'); begin
  if (select count(*) from feed_item_comments(k)) <> 2 then raise exception 'FAIL: Ann should see 2 comments (Dee blocked), sees %', (select count(*) from feed_item_comments(k)); end if;
  if (select comment_count from feed_item(k)) <> 2 then raise exception 'FAIL: comment_count with a block'; end if;
  if not (select bool_and(can_delete) from feed_item_comments(k)) then raise exception 'FAIL: Ann can delete comments on her own post'; end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-000000000ee4');
set role authenticated;
select expect_refused(format($q$select add_feed_comment('post:%s', 'still here')$q$, (select id from social_ids where name = 'post')), 'blocked rider commented');
reset role;

-- S4b. Fay is on Free: she can like and read comments, but commenting and posting need Pro.
select as_user('00000000-0000-0000-0000-000000000ee6');
set role authenticated;
do $$ declare k text := 'post:' || (select id from social_ids where name = 'post'); begin
  if set_feed_like(k, true) <> 2 then raise exception 'FAIL: Free rider like'; end if;
  if (select count(*) from feed_item_comments(k)) < 2 then raise exception 'FAIL: Free rider can''t read comments'; end if;
  perform set_feed_like(k, false);
end $$;
select expect_refused(format($q$select add_feed_comment('post:%s', 'free comment')$q$, (select id from social_ids where name = 'post')), 'Free rider commented');
select expect_refused($q$select create_rider_post('free post', null)$q$, 'Free rider posted');
do $$ begin
  begin
    perform create_rider_post('free post', null);
  exception when others then
    if sqlerrm <> 'pro_required:social_posts' then raise exception 'FAIL: Free post error was %', sqlerrm; end if;
  end;
  if (rider_profile('00000000-0000-0000-0000-000000000ee1') ->> 'pro')::boolean is not true then raise exception 'FAIL: Ann''s Pro tag'; end if;
  if (rider_profile('00000000-0000-0000-0000-000000000ee6') ->> 'pro')::boolean then raise exception 'FAIL: Free rider shown as Pro'; end if;
end $$;
reset role;

-- S5. Deleting: Ben can't delete Ann's comment; Ann can delete Ben's (her post); Ben deletes nothing else.
select as_user('00000000-0000-0000-0000-000000000ee2');
set role authenticated;
select expect_refused(format($q$select delete_feed_comment(id) from feed_item_comments('post:%s') where not mine$q$, (select id from social_ids where name = 'post')), 'Ben deleted Ann''s comment');
select expect_refused(format($q$select delete_rider_post('%s')$q$, (select id from social_ids where name = 'post')), 'Ben deleted Ann''s post');
reset role;

-- S6. Profiles: Ben sees Ann's totals and timeline; Cal sees her name only; Dee (blocked) sees blocked.
select as_user('00000000-0000-0000-0000-000000000ee2');
set role authenticated;
do $$ declare j jsonb := rider_profile('00000000-0000-0000-0000-000000000ee1'); begin
  if j ->> 'relation' <> 'friends' or not (j ->> 'can_see')::boolean or (j ->> 'posts')::int <> 2 or (j ->> 'badges')::int <> 1 then
    raise exception 'FAIL: Ben''s view of Ann %', j;
  end if;
  if (select count(*) from rider_timeline('00000000-0000-0000-0000-000000000ee1', 30, null)) <> 3 then
    raise exception 'FAIL: Ann''s timeline for Ben has % items', (select count(*) from rider_timeline('00000000-0000-0000-0000-000000000ee1', 30, null));
  end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-000000000ee3');
set role authenticated;
do $$ declare j jsonb := rider_profile('00000000-0000-0000-0000-000000000ee1'); begin
  if (j ->> 'can_see')::boolean or j ? 'posts' and j ->> 'posts' is not null or j ->> 'name' <> 'Ann Social' then
    raise exception 'FAIL: Cal''s view of Ann %', j;
  end if;
  if exists (select 1 from rider_timeline('00000000-0000-0000-0000-000000000ee1', 30, null)) then raise exception 'FAIL: stranger read timeline'; end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-000000000ee4');
set role authenticated;
do $$ begin
  if not (rider_profile('00000000-0000-0000-0000-000000000ee1') ->> 'blocked')::boolean then raise exception 'FAIL: blocked profile'; end if;
end $$;
reset role;

-- S7. Reports: a stranger can't report a post he can't see; Ben reports Ben's own... no; three
-- friends report Ann's post and it hides itself; the report keeps the text.
select as_user('00000000-0000-0000-0000-000000000ee3');
set role authenticated;
select expect_refused(format($q$insert into reports (kind, reported_user_id, post_id, reason) values ('rider', '00000000-0000-0000-0000-000000000ee1', '%s', 'Spam')$q$,
  (select id from social_ids where name = 'post')), 'stranger reported an unseen post');
-- Naming a friend of Ann's as the reporter doesn't get the stranger a different answer (20261104200000).
select expect_refused(format($q$insert into reports (kind, reporter_id, reported_user_id, post_id, reason) values ('rider', '00000000-0000-0000-0000-000000000ee2', '00000000-0000-0000-0000-000000000ee1', '%s', 'Spam')$q$,
  (select id from social_ids where name = 'post')), 'stranger reported as someone else');
reset role;
select as_user('00000000-0000-0000-0000-000000000ee2');
set role authenticated;
select expect_refused(format($q$insert into reports (kind, reported_user_id, comment_id, reason) values ('rider', '00000000-0000-0000-0000-000000000ee1', '%s', 'Spam')$q$,
  (select id from social_ids where name = 'ben_comment')), 'reported own comment');
insert into reports (kind, reported_user_id, post_id, reason) values ('rider', '00000000-0000-0000-0000-000000000ee3', (select id from social_ids where name = 'post'), 'Harassment');
reset role;
do $$ begin
  if (select reported_user_id from reports where post_id = (select id from social_ids where name = 'post')) <> '00000000-0000-0000-0000-000000000ee1' then
    raise exception 'FAIL: the post''s author must be the reported rider';
  end if;
  if (select reported_text || '|' || source from reports where post_id = (select id from social_ids where name = 'post')) <> 'Great day at Windrock!|post' then
    raise exception 'FAIL: report text/source %', (select reported_text || '|' || source from reports where post_id = (select id from social_ids where name = 'post'));
  end if;
  if (select hidden_at from rider_posts where id = (select id from social_ids where name = 'post')) is not null then raise exception 'FAIL: hidden after one report'; end if;
end $$;
select as_user('00000000-0000-0000-0000-000000000ee5');
set role authenticated;
insert into reports (kind, reported_user_id, post_id, reason) values ('rider', '00000000-0000-0000-0000-000000000ee1', (select id from social_ids where name = 'post'), 'Spam');
reset role;
select as_user('00000000-0000-0000-0000-000000000ee6');
set role authenticated;
insert into reports (kind, reported_user_id, post_id, reason) values ('rider', '00000000-0000-0000-0000-000000000ee1', (select id from social_ids where name = 'post'), 'Spam');
reset role;
do $$ begin
  if (select hidden_by from rider_posts where id = (select id from social_ids where name = 'post')) is distinct from 'reports' then
    raise exception 'FAIL: three reports should hide the post';
  end if;
  if 'post:Ann Social:Great day at Windrock!' = any (social_keys('00000000-0000-0000-0000-000000000ee2')) then raise exception 'FAIL: hidden post still in the feed'; end if;
end $$;

-- S8. Admin: restore the post, hide a comment, delete the photo post; riders can't call these.
select as_user('00000000-0000-0000-0000-000000000ee2');
set role authenticated;
select expect_refused(format($q$select admin_set_post_hidden('%s', false)$q$, (select id from social_ids where name = 'post')), 'rider restored a post');
select expect_refused(format($q$select admin_delete_post('%s', 'because')$q$, (select id from social_ids where name = 'photo')), 'rider deleted a post as admin');
reset role;
select as_admin_session('00000000-0000-0000-0000-00000000ad01', 'aal2');
do $$
declare v text; j jsonb;
begin
  perform admin_set_post_hidden((select id from social_ids where name = 'post'), false);
  perform admin_set_comment_hidden((select id from social_ids where name = 'ben_comment'), true, 'Rude');
  v := admin_delete_post((select id from social_ids where name = 'photo'), 'Inappropriate photo');
  if v <> '00000000-0000-0000-0000-000000000ee1/abc123-1.jpg' then raise exception 'FAIL: admin_delete_post returned %', v; end if;
  j := admin_report((select id from reports where post_id = (select id from social_ids where name = 'post') limit 1));
  if j -> 'post' ->> 'body' <> 'Great day at Windrock!' or j ->> 'reported_text' <> 'Great day at Windrock!' then raise exception 'FAIL: admin_report post %', j; end if;
  j := admin_rider_social('00000000-0000-0000-0000-000000000ee2');
  if jsonb_array_length(j -> 'comments') <> 1 or j -> 'comments' -> 0 ->> 'hidden_by' <> 'admin' then raise exception 'FAIL: admin_rider_social %', j; end if;
  if not exists (select 1 from admin_audit_log where action = 'post.delete') then raise exception 'FAIL: delete not logged'; end if;
end $$;
do $$ begin
  if exists (select 1 from rider_posts where id = (select id from social_ids where name = 'photo')) then raise exception 'FAIL: post not deleted'; end if;
  if (select hidden_at from rider_posts where id = (select id from social_ids where name = 'post')) is not null then raise exception 'FAIL: post not restored'; end if;
end $$;
select as_admin_session(null, 'aal1');
select as_user('00000000-0000-0000-0000-000000000ee1');
set role authenticated;
do $$ begin
  if (select count(*) from feed_item_comments('post:' || (select id from social_ids where name = 'post'))) <> 1 then
    raise exception 'FAIL: hidden comment still shown';
  end if;
end $$;
-- S9. Ann deletes her post: likes and comments go with it, and it returns the (null) photo path.
do $$ begin
  if delete_rider_post((select id from social_ids where name = 'post')) is not null then raise exception 'FAIL: text post had a photo'; end if;
end $$;
reset role;
do $$ begin
  if exists (select 1 from feed_likes where item_key = 'post:' || (select id from social_ids where name = 'post'))
     or exists (select 1 from feed_comments where item_key = 'post:' || (select id from social_ids where name = 'post')) then
    raise exception 'FAIL: likes/comments left behind';
  end if;
end $$;

-- S10. Likes and comments work on other kinds too (Ann's badge), and Feed settings accept 'post'.
select as_user('00000000-0000-0000-0000-000000000ee2');
set role authenticated;
do $$ begin
  if set_feed_like('badge:00000000-0000-0000-0000-000000000ee1:crew_rider:1', true) <> 1 then raise exception 'FAIL: badge like'; end if;
  perform set_feed_settings('friends', array['post', 'badge'], 'friends');
  if not (select 'post' = any (kinds) from my_feed_settings()) then raise exception 'FAIL: post kind not saved'; end if;
end $$;
select expect_refused($q$select set_feed_like('badge:00000000-0000-0000-0000-000000000ee1:crew_rider:2', true)$q$, 'liked a badge never earned');
reset role;

-- S11. Turning off Likes and Comments stops them.
insert into notification_settings (user_id, feed_activity) values ('00000000-0000-0000-0000-000000000ee1', false)
  on conflict (user_id) do update set feed_activity = false;
delete from rider_notifications where user_id = '00000000-0000-0000-0000-000000000ee1';
select as_user('00000000-0000-0000-0000-000000000ee5');
set role authenticated;
select add_feed_comment('badge:00000000-0000-0000-0000-000000000ee1:crew_rider:1', 'Congrats');
reset role;
do $$ begin
  if exists (select 1 from rider_notifications where user_id = '00000000-0000-0000-0000-000000000ee1') then raise exception 'FAIL: notified with Likes and Comments off'; end if;
end $$;

drop table social_ids;
select 'ALL SOCIAL TESTS PASSED' as result;
