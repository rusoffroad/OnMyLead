-- 2.1 release test, whole-app pass 2 fixes. Same signatures as before, so every app build already
-- in riders' hands keeps working.
--
-- 1. Shared waypoint push: once per waypoint, as 20261104150000 says. Switching a waypoint between
--    Just Me and Everyone on the Ride again no longer pushes everyone again. Waypoints already
--    shared on a live ride count as announced.
-- 2. push_batch_feed: a reply's push goes only to riders the reply is shown to.
-- 3. referrals_on_ride_end: looks only at the ending ride's own riders.

create table if not exists ride_waypoint_alerts (
  waypoint_id uuid primary key references ride_waypoints (id) on delete cascade,
  pushed_at timestamptz not null default now()
);
alter table ride_waypoint_alerts enable row level security;
revoke all on ride_waypoint_alerts from public, anon, authenticated;
insert into ride_waypoint_alerts (waypoint_id)
select w.id from ride_waypoints w join rides r on r.id = w.ride_id where w.shared and r.status = 'live'
on conflict (waypoint_id) do nothing;

create or replace function ride_waypoints_alert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.shared
     and (tg_op = 'INSERT' or not old.shared)
     and exists (select 1 from rides r where r.id = new.ride_id and r.status = 'live') then
    insert into ride_waypoint_alerts (waypoint_id) values (new.id) on conflict (waypoint_id) do nothing;
    if found then
      perform queue_push(jsonb_build_object('type', 'waypoint', 'id', new.id));
    end if;
  end if;
  return null;
exception when others then
  -- Never stop the save because of the push.
  raise warning 'ride_waypoints_alert: %', sqlerrm;
  return null;
end;
$$;
revoke execute on function ride_waypoints_alert() from public, anon, authenticated;

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
        -- Only riders the reply is shown to: not blocked either way, and the top comment not
        -- hidden or by a rider they blocked (feed_comment_visible, as for liking it).
        and feed_comment_visible(r.uid, cm.id)
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

-- 3. A ride ending checks only its own riders' referrals, not every unqualified referral.
create or replace function referrals_on_ride_end()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_friend uuid;
begin
  for v_friend in
    select f.friend_id from referrals f
    where f.qualified_at is null
      and f.friend_id in (
        select new.organizer_id
        union
        select m.user_id from ride_members m where m.ride_id = new.id and m.status = 'joined')
  loop
    perform referral_settle(v_friend);
  end loop;
  return null;
exception when others then
  -- Never stop a ride from ending.
  raise warning 'referrals_on_ride_end: %', sqlerrm;
  return null;
end;
$$;
