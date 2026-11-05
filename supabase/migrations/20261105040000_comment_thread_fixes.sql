-- Comment likes and replies: release-test fixes (thread "Test 2.1 thoroughly before release").
--
-- 1. A reply under a hidden top comment, or under the top comment of a rider you blocked, is left
--    out everywhere, not only on the 2.1 item screen: feed_item_comments (2.0 builds) and
--    feed_item_stats (comment counts and the Feed's two-comment preview) now say the same.
-- 2. Hiding a comment (admin or three reports) clears the notifications about its replies too.
-- 3. A comment's writer gets at most one like push per 15 minutes, even from one rider liking,
--    unliking and liking again.
-- 4. set_comment_like's count leaves out riders you blocked, like feed_item_thread does.
-- 5. feed_comment_visible refuses a reply under a blocked rider's top comment.
-- 6. A new top-level comment is told to earlier top-level commenters, not to riders who only
--    replied somewhere in a thread (they hear about replies in their thread).
-- Same signatures as before; 2.0 builds keep working.

create or replace function feed_comment_visible(p_viewer uuid, p_comment uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare c feed_comments;
begin
  if p_viewer is null or p_comment is null then return false; end if;
  select * into c from feed_comments where id = p_comment;
  if not found or c.hidden_at is not null then return false; end if;
  if c.author_id <> p_viewer and riders_blocked(p_viewer, c.author_id) then return false; end if;
  if c.parent_id is not null and exists (
    select 1 from feed_comments p where p.id = c.parent_id
      and (p.hidden_at is not null or (p.author_id <> p_viewer and riders_blocked(p_viewer, p.author_id)))
  ) then
    return false;
  end if;
  return c.owner_id = p_viewer or feed_can_interact(p_viewer, c.item_key);
end;
$$;
revoke execute on function feed_comment_visible(uuid, uuid) from public, anon, authenticated;

-- Shown to p_me: not hidden, writer not blocked, and for a reply, its top comment too.
create or replace function feed_comment_shown(p_me uuid, c feed_comments)
returns boolean language sql stable security definer set search_path = public as $$
  select c.hidden_at is null and not riders_blocked(p_me, c.author_id)
    and (c.parent_id is null or exists (
      select 1 from feed_comments par where par.id = c.parent_id and par.hidden_at is null and not riders_blocked(p_me, par.author_id)
    ))
$$;
revoke execute on function feed_comment_shown(uuid, feed_comments) from public, anon, authenticated;

create or replace function feed_item_stats(p_me uuid, p_key text)
returns table (like_count int, comment_count int, liked boolean, comments jsonb)
language sql stable security definer set search_path = public as $$
  select
    (select count(*)::int from feed_likes l where l.item_key = p_key and not riders_blocked(p_me, l.user_id)),
    (select count(*)::int from feed_comments c where c.item_key = p_key and feed_comment_shown(p_me, c)),
    exists (select 1 from feed_likes l where l.item_key = p_key and l.user_id = p_me),
    coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'author_id', x.author_id, 'author_name', x.author_name, 'body', x.body, 'at', x.created_at) order by x.created_at)
      from (
        select c.id, c.author_id, coalesce(nullif(btrim(pr.display_name), ''), 'Rider') as author_name, c.body, c.created_at
        from feed_comments c join profiles pr on pr.id = c.author_id
        where c.item_key = p_key and feed_comment_shown(p_me, c)
        order by c.created_at desc limit 2
      ) x), '[]'::jsonb)
  where p_key is not null
  union all
  select 0, 0, false, '[]'::jsonb where p_key is null
$$;
revoke execute on function feed_item_stats(uuid, text) from public, anon, authenticated;

create or replace function feed_item_comments(p_key text)
returns table (id uuid, author_id uuid, author_name text, body text, at timestamptz, mine boolean, can_delete boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'sign in first'; end if;
  if not feed_can_interact(v_me, p_key) then return; end if;
  return query
  select c.id, c.author_id, coalesce(nullif(btrim(p.display_name), ''), 'Rider'), c.body, c.created_at,
         c.author_id = v_me, c.author_id = v_me or c.owner_id = v_me
  from feed_comments c join profiles p on p.id = c.author_id
  where c.item_key = p_key and feed_comment_shown(v_me, c)
  order by c.created_at
  limit 200;
end;
$$;
revoke execute on function feed_item_comments(text) from public, anon;
grant execute on function feed_item_comments(text) to authenticated;

-- The notifications about a comment and every reply under it.
create or replace function clear_comment_notifications(p_id uuid)
returns void language sql security definer set search_path = public as $$
  delete from rider_notifications
  where data ->> 'commentId' in (select id::text from feed_comments where id = p_id or parent_id = p_id)
$$;
revoke execute on function clear_comment_notifications(uuid) from public, anon, authenticated;

create or replace function admin_set_comment_hidden(p_id uuid, p_hidden boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  perform require_admin();
  if p_hidden and length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'a reason is required'; end if;
  select jsonb_build_object('hidden_at', hidden_at, 'hidden_reason', hidden_reason) into v_before from feed_comments where id = p_id for update;
  if not found then raise exception 'comment not found'; end if;
  update feed_comments
  set hidden_at = case when p_hidden then now() end,
      hidden_by = case when p_hidden then 'admin' end,
      hidden_reason = case when p_hidden then btrim(p_reason) end
  where id = p_id;
  if p_hidden then perform clear_comment_notifications(p_id); end if;
  perform log_admin_action(case when p_hidden then 'comment.hide' else 'comment.restore' end, 'comment', p_id::text, v_before,
    jsonb_build_object('reason', nullif(btrim(coalesce(p_reason, '')), '')));
end;
$$;
revoke execute on function admin_set_comment_hidden(uuid, boolean, text) from public, anon;
grant execute on function admin_set_comment_hidden(uuid, boolean, text) to authenticated;

create or replace function reports_social_autohide()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.post_id is not null and (
    select count(distinct reporter_id) from reports where post_id = new.post_id and status in ('open', 'reviewing')
  ) >= 3 then
    update rider_posts set hidden_at = now(), hidden_by = 'reports', hidden_reason = 'Reported by several riders, waiting for review'
    where id = new.post_id and hidden_at is null;
  end if;
  if new.comment_id is not null and (
    select count(distinct reporter_id) from reports where comment_id = new.comment_id and status in ('open', 'reviewing')
  ) >= 3 then
    update feed_comments set hidden_at = now(), hidden_by = 'reports', hidden_reason = 'Reported by several riders, waiting for review'
    where id = new.comment_id and hidden_at is null;
    if found then perform clear_comment_notifications(new.comment_id); end if;
  end if;
  return null;
end;
$$;
revoke execute on function reports_social_autohide() from public, anon, authenticated;

-- When a comment's writer was last pushed a like, so a like-unlike-like run is one push.
create table if not exists feed_comment_like_pushes (
  comment_id uuid primary key references feed_comments (id) on delete cascade,
  pushed_at timestamptz not null default now()
);
alter table feed_comment_like_pushes enable row level security;
revoke all on feed_comment_like_pushes from public, anon, authenticated;

create or replace function set_comment_like(p_id uuid, p_liked boolean)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_author uuid;
  n int;
begin
  if v_me is null then raise exception 'sign in first'; end if;
  if not feed_comment_visible(v_me, p_id) then raise exception 'this comment isn’t available'; end if;
  select author_id into v_author from feed_comments where id = p_id;
  if coalesce(p_liked, false) then
    if (select count(*) from feed_comment_likes where user_id = v_me and created_at > now() - interval '1 hour') >= 300 then
      raise exception 'too many likes in an hour, try again later';
    end if;
    insert into feed_comment_likes (comment_id, user_id) values (p_id, v_me) on conflict do nothing;
    get diagnostics n = row_count;
    if n > 0 and v_author <> v_me then
      -- At most one push per comment per 15 minutes, whoever likes it and however often.
      insert into feed_comment_like_pushes (comment_id) values (p_id)
      on conflict (comment_id) do update set pushed_at = now()
        where feed_comment_like_pushes.pushed_at < now() - interval '15 minutes';
      get diagnostics n = row_count;
      if n > 0 then
        perform queue_push(jsonb_build_object('type', 'feed_like', 'comment', p_id, 'from', v_me));
      end if;
    end if;
  else
    delete from feed_comment_likes where comment_id = p_id and user_id = v_me;
  end if;
  return (select count(*)::int from feed_comment_likes l where l.comment_id = p_id and not riders_blocked(v_me, l.user_id));
end;
$$;
revoke execute on function set_comment_like(uuid, boolean) from public, anon;
grant execute on function set_comment_like(uuid, boolean) to authenticated;

-- push_batch_feed as in 20261104220000_comment_likes_replies.sql, except that a top-level comment
-- goes to earlier top-level commenters only (repliers hear about their own thread).
create or replace function push_batch_feed(p_event jsonb)
returns table (user_id uuid, token text, platform text, title text, body text, thread_id text, data jsonb)
language plpgsql stable security invoker set search_path = public as $$
#variable_conflict use_column
declare
  v_type text := p_event ->> 'type';
  v_key text;
  v_from uuid;
  v_owner uuid;
  v_who text;
  v_likes int;
  cm feed_comments;
  v_answered uuid;
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'not allowed';
  end if;
  if v_type = 'feed_like' and p_event ? 'comment' then
    select * into cm from feed_comments c where c.id = (p_event ->> 'comment')::uuid and c.hidden_at is null;
    if not found then return; end if;
    v_from := (p_event ->> 'from')::uuid;
    if cm.author_id = v_from or riders_blocked(cm.author_id, v_from) then return; end if;
    if not exists (select 1 from feed_comment_likes l where l.comment_id = cm.id and l.user_id = v_from) then return; end if;
    select coalesce(nullif(btrim(display_name), ''), 'A rider') into v_who from profiles where id = v_from;
    select count(*) into v_likes from feed_comment_likes l where l.comment_id = cm.id and l.user_id <> cm.author_id;
    return query
    select t.user_id, t.token, t.platform, 'New Like',
           coalesce(v_who, 'A rider')
             || case when v_likes > 1 then ' and ' || (v_likes - 1) || case when v_likes = 2 then ' other' else ' others' end else '' end
             || ' liked your ' || case when cm.parent_id is null then 'comment' else 'reply' end
             || case when s.previews is false then '.' else ': “' || left(cm.body, 120) || case when char_length(cm.body) > 120 then '…' else '' end || '”' end,
           'feed',
           jsonb_build_object('type', 'feed_like', 'key', cm.item_key, 'commentId', cm.id, 'userId', v_from, 'collapseId', 'clike:' || cm.id)
    from push_tokens t
    left join notification_settings s on s.user_id = t.user_id
    where t.user_id = cm.author_id and wants_feed_push(t.user_id) and feed_can_interact(t.user_id, cm.item_key);
  elsif v_type = 'feed_like' then
    v_key := p_event ->> 'key';
    v_from := (p_event ->> 'from')::uuid;
    v_owner := feed_item_owner(v_key);
    if v_owner is null or v_owner = v_from or riders_blocked(v_owner, v_from) then return; end if;
    if not exists (select 1 from feed_likes l where l.item_key = v_key and l.user_id = v_from) then return; end if;
    select coalesce(nullif(btrim(display_name), ''), 'A rider') into v_who from profiles where id = v_from;
    select count(*) into v_likes from feed_likes l where l.item_key = v_key and l.user_id <> v_owner;
    return query
    select t.user_id, t.token, t.platform, 'New Like',
           coalesce(v_who, 'A rider')
             || case when v_likes > 1 then ' and ' || (v_likes - 1) || case when v_likes = 2 then ' other' else ' others' end else '' end
             || ' liked ' || feed_item_phrase(v_key, v_owner, v_owner) || '.',
           'feed',
           jsonb_build_object('type', 'feed_like', 'key', v_key, 'userId', v_from, 'collapseId', 'like:' || v_key)
    from push_tokens t
    where t.user_id = v_owner and wants_feed_push(t.user_id);
  elsif v_type = 'feed_comment' then
    select * into cm from feed_comments c where c.id = (p_event ->> 'id')::uuid and c.hidden_at is null;
    if not found then return; end if;
    select coalesce(nullif(btrim(display_name), ''), 'A rider') into v_who from profiles where id = cm.author_id;
    if cm.parent_id is not null then
      select c.author_id into v_answered from feed_comments c where c.id = coalesce(cm.reply_to_id, cm.parent_id);
      return query
      with rcpt as (
        select v_answered as uid
        union select c.author_id from feed_comments c where c.id = cm.parent_id
        union select cm.owner_id
        union
        select x.author_id from (
          select c.author_id, max(c.created_at) as last from feed_comments c
          where c.parent_id = cm.parent_id and c.hidden_at is null group by c.author_id
          order by last desc limit 20
        ) x
      )
      select t.user_id, t.token, t.platform, 'New Reply',
             coalesce(v_who, 'A rider')
               || case when r.uid = v_answered then ' replied to your comment on ' else ' replied on ' end
               || feed_item_phrase(cm.item_key, cm.owner_id, r.uid)
               || case when s.previews is false then '.' else ': “' || left(cm.body, 120) || case when char_length(cm.body) > 120 then '…' else '' end || '”' end,
             'feed',
             jsonb_build_object('type', 'feed_comment', 'key', cm.item_key, 'commentId', cm.id, 'userId', cm.author_id)
      from rcpt r
      join push_tokens t on t.user_id = r.uid
      left join notification_settings s on s.user_id = t.user_id
      where r.uid is not null and r.uid <> cm.author_id
        and not riders_blocked(r.uid, cm.author_id)
        and feed_can_interact(r.uid, cm.item_key)
        and wants_feed_push(t.user_id);
      return;
    end if;
    return query
    with rcpt as (
      select cm.owner_id as uid
      union
      select x.author_id from (
        select c.author_id, max(c.created_at) as last from feed_comments c
        where c.item_key = cm.item_key and c.parent_id is null and c.hidden_at is null group by c.author_id
        order by last desc limit 20
      ) x
    )
    select t.user_id, t.token, t.platform, 'New Comment',
           coalesce(v_who, 'A rider')
             || case when r.uid = cm.owner_id then ' commented on ' else ' also commented on ' end
             || feed_item_phrase(cm.item_key, cm.owner_id, r.uid)
             || case when s.previews is false then '.' else ': “' || left(cm.body, 120) || case when char_length(cm.body) > 120 then '…' else '' end || '”' end,
           'feed',
           jsonb_build_object('type', 'feed_comment', 'key', cm.item_key, 'commentId', cm.id, 'userId', cm.author_id)
    from rcpt r
    join push_tokens t on t.user_id = r.uid
    left join notification_settings s on s.user_id = t.user_id
    where r.uid <> cm.author_id
      and not riders_blocked(r.uid, cm.author_id)
      and feed_can_interact(r.uid, cm.item_key)
      and wants_feed_push(t.user_id);
  end if;
end;
$$;
revoke execute on function push_batch_feed(jsonb) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function push_batch_feed(jsonb) to service_role;
  end if;
end $$;

