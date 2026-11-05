-- 2.1 release test, whole-app pass 2 fixes. Same signatures as before, so every app build already
-- in riders' hands keeps working.
--
-- 1. claim_referral_reward: a reward set to move a Google Play bill back, where the subscription
--    ended before the move happened, can be claimed again (the Play offer, or an Apple code)
--    instead of staying stuck.
-- 2. Shared waypoint push: once per waypoint, as 20261104150000 says. Switching a waypoint between
--    Just Me and Everyone on the Ride again no longer pushes everyone again. Waypoints already
--    shared on a live ride count as announced.
-- 3. push_batch_feed: a reply's push goes only to riders the reply is shown to.
-- 4. referrals_on_ride_end: looks only at the ending ride's own riders.

create or replace function claim_referral_reward(p_store text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  w referral_rewards;
  v_code text;
  v_rules jsonb := referral_rules();
begin
  if v_me is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if p_store not in ('apple', 'google') then raise exception 'store must be apple or google'; end if;
  select * into w from referral_rewards where user_id = v_me for update;
  if not found then return jsonb_build_object('error', 'no_reward'); end if;
  if w.claimed_at is null and w.expires_at <= now() then return jsonb_build_object('error', 'expired'); end if;
  if w.redeemed_at is not null and w.claim_kind = 'google_offer' then return jsonb_build_object('error', 'used'); end if;

  -- Claimed before: hand back the same thing (the Apple code again, or the Play offer again
  -- until the rider buys it).
  if w.claim_kind = 'apple_code' then
    if p_store <> 'apple' then return jsonb_build_object('error', 'claimed_on_other_store', 'store', 'apple'); end if;
    return jsonb_build_object('kind', 'apple_code', 'code', w.apple_code,
      'url', 'https://apps.apple.com/redeem?ctx=offercodes&id=' || (v_rules ->> 'apple_app_id') || '&code=' || w.apple_code);
  elsif w.claim_kind = 'google_defer' then
    if w.redeemed_at is not null or referral_play_token(v_me) is not null
       or w.deferred_at > now() - interval '10 minutes' then
      return jsonb_build_object('kind', 'google_defer', 'deferred_at', w.deferred_at);
    end if;
    -- A deferral that never finished, for a Google Play subscription that has since ended:
    -- there's nothing left to move, so the reward is claimed afresh below (the offer, or an
    -- Apple code).
    update referral_rewards set deferred_at = null where id = w.id;
  elsif w.claim_kind = 'google_offer' and p_store = 'apple' then
    return jsonb_build_object('error', 'claimed_on_other_store', 'store', 'google');
  elsif w.claim_kind = 'google_offer' and p_store = 'google' then
    return jsonb_build_object('kind', 'google_offer', 'offer_id', v_rules ->> 'google_offer_id');
  end if;

  if p_store = 'apple' then
    select c.code into v_code from referral_offer_codes c
    where c.assigned_at is null and c.environment = 'Production' and c.expires_on > current_date
    order by c.expires_on, c.added_at
    limit 1
    for update skip locked;
    if v_code is null then return jsonb_build_object('error', 'no_codes'); end if;
    update referral_offer_codes set assigned_to = v_me, assigned_at = now() where code = v_code;
    update referral_rewards set claimed_at = now(), claim_store = 'apple', claim_kind = 'apple_code', apple_code = v_code
    where id = w.id;
    return jsonb_build_object('kind', 'apple_code', 'code', v_code,
      'url', 'https://apps.apple.com/redeem?ctx=offercodes&id=' || (v_rules ->> 'apple_app_id') || '&code=' || v_code);
  end if;

  if referral_play_token(v_me) is not null then
    -- The referral-defer Edge Function does the deferral and sets deferred_at.
    update referral_rewards set claimed_at = coalesce(claimed_at, now()), claim_store = 'google', claim_kind = 'google_defer'
    where id = w.id;
    return jsonb_build_object('kind', 'google_defer', 'deferred_at', null);
  end if;
  update referral_rewards set claimed_at = coalesce(claimed_at, now()), claim_store = 'google', claim_kind = 'google_offer'
  where id = w.id;
  return jsonb_build_object('kind', 'google_offer', 'offer_id', v_rules ->> 'google_offer_id');
end;
$$;

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

-- 4. A ride ending checks only its own riders' referrals, not every unqualified referral.
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
