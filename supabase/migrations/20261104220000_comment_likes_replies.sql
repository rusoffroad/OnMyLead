-- Comment likes and replies (2.1).
--
-- Chris 2026-11-04: "Allow me to like and reply to comments."
--
-- Builds on the Social hub (20261102900000_social_hub.sql). The same visibility rule applies to
-- everything here: you can see, like or reply to a comment only when you can see the item it is on
-- (feed_can_interact), it isn't hidden, and neither of you blocked the other.
--   * Likes on comments: free, like likes on posts. The comment's writer is told (at most once per
--     15 minutes per comment, so a run of likes is one push).
--   * Replies: one level deep, like most social apps. A reply to a reply joins the same thread
--     (parent_id is always the top comment) and remembers whom it answered (reply_to_id), so that
--     rider is the one told "replied to your comment". Replying is commenting, so it needs Pro
--     (feature 'social_posts'), the same as a comment.
--   * Hiding or deleting a comment hides or deletes its replies with it.
--
-- Additive only: two columns with no default on feed_comments, one table, new functions, and
-- push_batch_feed / delete_feed_comment / admin_rider_social replaced with the same signatures
-- (extra keys only). The push and inbox types stay 'feed_like' and 'feed_comment', so the
-- notify-ride-message Edge Function needs no redeploy, and 2.0 builds keep working: they call
-- feed_item_comments (unchanged) and show a reply as a plain comment.

-- ---------------------------------------------------------------------------
-- Replies
-- ---------------------------------------------------------------------------
alter table feed_comments add column if not exists parent_id uuid references feed_comments (id) on delete cascade;
alter table feed_comments add column if not exists reply_to_id uuid references feed_comments (id) on delete set null;
create index if not exists feed_comments_parent_idx on feed_comments (parent_id, created_at) where parent_id is not null;

-- ---------------------------------------------------------------------------
-- Likes on comments
-- ---------------------------------------------------------------------------
create table if not exists feed_comment_likes (
  comment_id uuid not null references feed_comments (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
create index if not exists feed_comment_likes_user_idx on feed_comment_likes (user_id, created_at desc);
alter table feed_comment_likes enable row level security;
revoke all on feed_comment_likes from public, anon, authenticated;

-- May p_viewer see this comment (and so like it or reply to it)? Its item must be visible to them,
-- it and its top comment must not be hidden, and neither rider blocked the other.
create or replace function feed_comment_visible(p_viewer uuid, p_comment uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare c feed_comments;
begin
  if p_viewer is null or p_comment is null then return false; end if;
  select * into c from feed_comments where id = p_comment;
  if not found or c.hidden_at is not null then return false; end if;
  if c.author_id <> p_viewer and riders_blocked(p_viewer, c.author_id) then return false; end if;
  if c.parent_id is not null and exists (select 1 from feed_comments p where p.id = c.parent_id and p.hidden_at is not null) then
    return false;
  end if;
  return c.owner_id = p_viewer or feed_can_interact(p_viewer, c.item_key);
end;
$$;
revoke execute on function feed_comment_visible(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- What the app calls
-- ---------------------------------------------------------------------------
-- Every comment and reply on an item, oldest first (up to 300), with likes. The app nests replies
-- under parent_id. reply_to_name is whom a reply answered, when that was another reply's writer.
create or replace function feed_item_thread(p_key text)
returns table (
  id uuid, author_id uuid, author_name text, body text, at timestamptz, mine boolean, can_delete boolean,
  parent_id uuid, reply_to_name text, like_count int, liked boolean
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'sign in first'; end if;
  if not feed_can_interact(v_me, p_key) then return; end if;
  return query
  select c.id, c.author_id, coalesce(nullif(btrim(p.display_name), ''), 'Rider'), c.body, c.created_at,
         c.author_id = v_me, c.author_id = v_me or c.owner_id = v_me,
         c.parent_id,
         case when c.reply_to_id is not null and c.reply_to_id <> c.parent_id and rt.author_id <> c.author_id
              then coalesce(nullif(btrim(rp.display_name), ''), 'Rider') end,
         (select count(*)::int from feed_comment_likes l where l.comment_id = c.id and not riders_blocked(v_me, l.user_id)),
         exists (select 1 from feed_comment_likes l where l.comment_id = c.id and l.user_id = v_me)
  from feed_comments c
  join profiles p on p.id = c.author_id
  left join feed_comments par on par.id = c.parent_id
  left join feed_comments rt on rt.id = c.reply_to_id
  left join profiles rp on rp.id = rt.author_id
  where c.item_key = p_key and c.hidden_at is null and not riders_blocked(v_me, c.author_id)
    and (c.parent_id is null or (par.hidden_at is null and not riders_blocked(v_me, par.author_id)))
  order by c.created_at
  limit 300;
end;
$$;
revoke execute on function feed_item_thread(text) from public, anon;
grant execute on function feed_item_thread(text) to authenticated;

-- Like or unlike a comment. Returns the new like count.
create or replace function set_comment_like(p_id uuid, p_liked boolean)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_author uuid;
  v_burst boolean;
  n int;
begin
  if v_me is null then raise exception 'sign in first'; end if;
  if not feed_comment_visible(v_me, p_id) then raise exception 'this comment isn’t available'; end if;
  select author_id into v_author from feed_comments where id = p_id;
  if coalesce(p_liked, false) then
    if (select count(*) from feed_comment_likes where user_id = v_me and created_at > now() - interval '1 hour') >= 300 then
      raise exception 'too many likes in an hour, try again later';
    end if;
    v_burst := exists (select 1 from feed_comment_likes where comment_id = p_id and user_id <> v_me and created_at > now() - interval '15 minutes');
    insert into feed_comment_likes (comment_id, user_id) values (p_id, v_me) on conflict do nothing;
    get diagnostics n = row_count;
    if n > 0 and v_author <> v_me and not v_burst then
      perform queue_push(jsonb_build_object('type', 'feed_like', 'comment', p_id, 'from', v_me));
    end if;
  else
    delete from feed_comment_likes where comment_id = p_id and user_id = v_me;
  end if;
  return (select count(*)::int from feed_comment_likes where comment_id = p_id);
end;
$$;
revoke execute on function set_comment_like(uuid, boolean) from public, anon;
grant execute on function set_comment_like(uuid, boolean) to authenticated;

-- Reply to a comment (or to a reply: it joins the same thread). Pro, like commenting.
create or replace function add_feed_reply(p_comment uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  c feed_comments;
  v_id uuid;
begin
  if v_me is null then raise exception 'sign in first'; end if;
  if char_length(v_body) < 1 then raise exception 'write a reply first'; end if;
  if char_length(v_body) > 500 then raise exception 'replies can be up to 500 characters'; end if;
  if not feed_comment_visible(v_me, p_comment) then raise exception 'this comment isn’t available'; end if;
  perform pro_required(v_me, 'social_posts');
  if (select count(*) from feed_comments where author_id = v_me and created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'too many comments, try again in a few minutes';
  end if;
  select * into c from feed_comments where id = p_comment;
  insert into feed_comments (item_key, owner_id, author_id, body, parent_id, reply_to_id)
  values (c.item_key, c.owner_id, v_me, v_body, coalesce(c.parent_id, c.id), c.id)
  returning id into v_id;
  perform queue_push(jsonb_build_object('type', 'feed_comment', 'id', v_id));
  return v_id;
end;
$$;
revoke execute on function add_feed_reply(uuid, text) from public, anon;
grant execute on function add_feed_reply(uuid, text) to authenticated;

-- As in 20261102900000_social_hub.sql, plus: notifications about its replies and its likes go too
-- (the replies themselves go with it: parent_id cascades).
create or replace function delete_feed_comment(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_ids text[];
begin
  if v_me is null then raise exception 'sign in first'; end if;
  select array_agg(id::text) into v_ids from feed_comments
  where (id = p_id or parent_id = p_id) and exists (select 1 from feed_comments t where t.id = p_id and (t.author_id = v_me or t.owner_id = v_me));
  delete from feed_comments where id = p_id and (author_id = v_me or owner_id = v_me);
  if not found then raise exception 'comment not found'; end if;
  delete from rider_notifications where data ->> 'commentId' = any (coalesce(v_ids, array[p_id::text]));
end;
$$;
revoke execute on function delete_feed_comment(uuid) from public, anon;
grant execute on function delete_feed_comment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
-- push_batch_feed as in 20261102900000_social_hub.sql, plus:
--   {"type":"feed_like","comment":<comment>,"from":<liker>}  to the comment's writer
--   {"type":"feed_comment","id":<reply>}                      a reply: to the rider it answered,
--        the top comment's writer, the item's rider and earlier repliers in that thread (up to 20)
-- A top-level comment is told to the same riders as before.
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
        where c.item_key = cm.item_key and c.hidden_at is null group by c.author_id
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

-- ---------------------------------------------------------------------------
-- Admin Dashboard: a rider's comments say which are replies and how many likes each has.
-- As in 20261102900000_social_hub.sql plus parent_id and likes on comments.
-- ---------------------------------------------------------------------------
create or replace function admin_rider_social(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  return jsonb_build_object(
    'posts', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
      select p.id, p.body, p.photo_path, p.created_at, p.hidden_at, p.hidden_reason, p.hidden_by,
             (select count(*) from feed_likes l where l.item_key = 'post:' || p.id) as likes,
             (select count(*) from feed_comments c where c.item_key = 'post:' || p.id) as comments,
             (select count(*) from reports r where r.post_id = p.id) as reports
      from rider_posts p where p.author_id = p_user order by p.created_at desc limit 50) x), '[]'),
    'comments', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
      select c.id, c.item_key, c.body, c.created_at, c.hidden_at, c.hidden_reason, c.hidden_by, c.parent_id,
             coalesce(nullif(btrim(o.display_name), ''), 'Rider') as owner_name,
             (select count(*) from feed_comment_likes l where l.comment_id = c.id) as likes,
             (select count(*) from reports r where r.comment_id = c.id) as reports
      from feed_comments c left join profiles o on o.id = c.owner_id
      where c.author_id = p_user order by c.created_at desc limit 50) x), '[]'));
end;
$$;
revoke execute on function admin_rider_social(uuid) from public, anon;
grant execute on function admin_rider_social(uuid) to authenticated;
