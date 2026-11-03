-- Social (2.0): likes, comments and rider posts on the Feed, a Social area, and rider profiles.
--
-- Chris 2026-11-03: "add the ability for people to comment, like, and interact with each item on
-- the social timeline ... an entire social area to where they can see all of their friends and
-- activity and comments ... let them post some thing on their profile that shows up in the
-- activity feed."
--
-- Builds on the home Feed (20261102300000_home_feed.sql). The rules for who sees whose activity
-- are unchanged and live in feed_can_see(): a rider's activity reaches a viewer only when the
-- rider's "Who Sees Your Activity" allows it (friends, or friends and followers, or nobody), and
-- never across a block. Everything new here follows that one rule:
--   * Every Feed item gets a stable key (item_key), e.g. ride:<ride>:<rider>, badge:<rider>:<badge>:<level>,
--     trail:<trail>, out:<rider>:<started>, post:<post>. Group ride invites have no key (they are
--     an invite to you, not a post) and can't be liked or commented on.
--   * You can like or comment on an item only when you can see it (feed_can_interact).
--   * Posts: text (up to 500 characters) and an optional photo the app shrinks to 1280 px before
--     upload (rider-posts bucket, 1 MB cap). They show on the author's profile and in the Feed.
--   * Comments: up to 500 characters. The author can delete a comment, and so can the rider whose
--     item it is on. Comments from a rider you blocked (or who blocked you) are never shown.
--   * Moderation: a post or comment can be reported (reports.post_id / comment_id). The text is
--     copied with the report, so deleting it afterwards hides nothing from the owner. Three
--     different riders reporting the same post or comment hide it until the owner reviews it.
--     The Admin Dashboard can hide, restore or delete posts and hide or restore comments.
--   * Pro (Chris 2026-11-03: "Only allow pro riders to comment and share their activity. Standard free
--     accounts can only like and view comments."): commenting and posting need OnMyLead Pro
--     (feature 'social_posts', movable in Admin > Settings like every Pro feature). Liking and
--     reading are free. Profiles and Feed cards say who has Pro (the Pro tag).
--   * Notifications: a comment notifies the item's rider and earlier commenters; a like notifies
--     the item's rider (at most once per 15 minutes per item, so a run of likes is one push).
--     New setting notification_settings.feed_activity (default on) turns both off.
--
-- Profile photos: the rider-avatars bucket cap drops from 2 MB to 512 KB (the app saves a 512 x 512
-- JPEG of about 40-90 KB; 1.0.3 builds save up to about 150 KB, still well under).
--
-- Additive only: new tables, columns with defaults, new functions, and record_notifications /
-- admin_report / admin_reports / set_feed_settings / my_feed_settings replaced with the same
-- signatures (extra keys only). home_feed() is unchanged, so a build that calls it keeps working.

-- ---------------------------------------------------------------------------
-- Pro: commenting and posting (sharing to other apps is checked in the app; it never touches the server)
-- ---------------------------------------------------------------------------
insert into feature_plans (feature, min_plan, free_monthly_allowance) values ('social_posts', 'pro', null)
on conflict (feature) do nothing;

-- Admin > Settings can move it between Free and Pro too (as in 20261101600000_nav_trails.sql plus social_posts).
create or replace function admin_set_feature_plan(p_feature text, p_min_plan text, p_allowance int default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb;
begin
  perform require_admin();
  if p_feature not in ('create_ride', 'import_gpx', 'offline_maps', 'saved_groups', 'create_poll', 'ride_history',
                       'advanced_trip_planning', 'advanced_stats', 'premium_ride_cards',
                       'record_trails', 'share_trails', 'trail_rides', 'social_posts') then
    raise exception 'this feature cannot be configured here';
  end if;
  if p_min_plan not in ('free', 'pro') then raise exception 'plan must be free or pro'; end if;
  if p_allowance is not null and (p_allowance < 0 or p_allowance > 1000) then raise exception 'allowance must be 0 to 1000'; end if;
  if p_feature = 'create_ride' and p_min_plan = 'pro' and p_allowance is null then
    raise exception 'ride creation needs a Free allowance';
  end if;
  select to_jsonb(f) into v_before from feature_plans f where feature = p_feature for update;
  if v_before is null then raise exception 'unknown feature'; end if;
  update feature_plans set min_plan = p_min_plan, free_monthly_allowance = p_allowance where feature = p_feature;
  perform log_admin_action('feature_plan.set', 'feature', p_feature, v_before,
          jsonb_build_object('feature', p_feature, 'min_plan', p_min_plan, 'free_monthly_allowance', p_allowance));
end;
$$;

-- ---------------------------------------------------------------------------
-- Posts
-- ---------------------------------------------------------------------------
create table if not exists rider_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles (id) on delete cascade,
  body text check (body is null or char_length(body) between 1 and 500),
  -- A photo in the author's own folder of the rider-posts bucket: <author id>/<file>.
  photo_path text,
  created_at timestamptz not null default now(),
  hidden_at timestamptz,
  hidden_reason text,
  hidden_by text check (hidden_by is null or hidden_by in ('reports', 'admin')),
  check (body is not null or photo_path is not null),
  check (photo_path is null or (char_length(photo_path) <= 120 and photo_path ~ ('^' || author_id::text || '/[A-Za-z0-9._-]{1,80}$')))
);
create index if not exists rider_posts_author_idx on rider_posts (author_id, created_at desc);
alter table rider_posts enable row level security;
revoke all on rider_posts from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Likes and comments, keyed by the Feed item's key
-- ---------------------------------------------------------------------------
create table if not exists feed_likes (
  item_key text not null check (char_length(item_key) <= 160),
  user_id uuid not null references profiles (id) on delete cascade,
  -- The rider whose item it is (for their notifications and clean-up).
  owner_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_key, user_id)
);
create index if not exists feed_likes_user_idx on feed_likes (user_id, created_at desc);
alter table feed_likes enable row level security;
revoke all on feed_likes from public, anon, authenticated;

create table if not exists feed_comments (
  id uuid primary key default gen_random_uuid(),
  item_key text not null check (char_length(item_key) <= 160),
  owner_id uuid not null references profiles (id) on delete cascade,
  author_id uuid not null references profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now(),
  hidden_at timestamptz,
  hidden_reason text,
  hidden_by text check (hidden_by is null or hidden_by in ('reports', 'admin'))
);
create index if not exists feed_comments_item_idx on feed_comments (item_key, created_at);
create index if not exists feed_comments_author_idx on feed_comments (author_id, created_at desc);
alter table feed_comments enable row level security;
revoke all on feed_comments from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Post kinds in the Feed settings: 'post' joins the list (on by default).
-- ---------------------------------------------------------------------------
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'rider_feed_settings'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kinds%'
  loop
    execute format('alter table rider_feed_settings drop constraint %I', c);
  end loop;
end $$;
alter table rider_feed_settings add constraint rider_feed_settings_kinds_check
  check (kinds <@ array['out', 'ride', 'badge', 'trail', 'group', 'post']);
alter table rider_feed_settings alter column kinds set default array['out', 'ride', 'badge', 'trail', 'group', 'post'];

create or replace function my_feed_settings()
returns table (show_from text, kinds text[], share_with text)
language plpgsql stable security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'sign in first'; end if;
  return query
  select coalesce(s.show_from, 'groups'),
         coalesce(s.kinds, array['out', 'ride', 'badge', 'trail', 'group', 'post']),
         coalesce(s.share_with, 'friends')
  from (select 1) one
  left join rider_feed_settings s on s.user_id = v_me;
end;
$$;
revoke execute on function my_feed_settings() from public, anon;
grant execute on function my_feed_settings() to authenticated;

-- Same as before, plus 'post'. A build from before posts never sends 'post', so saving from it
-- switches posts off; the 2.0 app is the first with the Customize sheet, so nobody is affected.
create or replace function set_feed_settings(p_show_from text, p_kinds text[], p_share_with text)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'sign in first'; end if;
  if p_show_from not in ('friends', 'follows', 'groups') then raise exception 'unknown feed choice'; end if;
  if p_share_with not in ('friends', 'followers', 'nobody') then raise exception 'unknown sharing choice'; end if;
  if p_kinds is null or not (p_kinds <@ array['out', 'ride', 'badge', 'trail', 'group', 'post']) then
    raise exception 'unknown post kind';
  end if;
  insert into rider_feed_settings (user_id, show_from, kinds, share_with, updated_at)
  values (v_me, p_show_from, (select coalesce(array_agg(distinct k), '{}') from unnest(p_kinds) k), p_share_with, now())
  on conflict (user_id) do update
    set show_from = excluded.show_from, kinds = excluded.kinds, share_with = excluded.share_with, updated_at = now();
end;
$$;
revoke execute on function set_feed_settings(text, text[], text) from public, anon;
grant execute on function set_feed_settings(text, text[], text) to authenticated;

-- ---------------------------------------------------------------------------
-- Item keys: whose item is it (null when the key is malformed or the item is gone or hidden)?
-- ---------------------------------------------------------------------------
create or replace function feed_is_uuid(p text)
returns boolean language sql immutable as $$
  select p ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
$$;

create or replace function feed_item_owner(p_key text)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare
  k text := split_part(coalesce(p_key, ''), ':', 1);
  a text := split_part(coalesce(p_key, ''), ':', 2);
  b text := split_part(coalesce(p_key, ''), ':', 3);
  c text := split_part(coalesce(p_key, ''), ':', 4);
  v uuid;
begin
  if p_key is null or char_length(p_key) > 160 or not feed_is_uuid(a) then return null; end if;
  if k = 'post' then
    select author_id into v from rider_posts where id = a::uuid and hidden_at is null;
  elsif k = 'trail' then
    select owner_id into v from shared_trails where id = a::uuid and status = 'public';
  elsif k = 'ride' and feed_is_uuid(b) then
    select c2.user_id into v from rider_ride_credits c2 join rides r on r.id = c2.ride_id
    where c2.ride_id = a::uuid and c2.user_id = b::uuid and r.status = 'ended';
  elsif k = 'badge' and b ~ '^[a-z_]{1,30}$' and c ~ '^[1-3]$' then
    select user_id into v from rider_badges where user_id = a::uuid and badge = b and level = c::int;
  elsif k = 'out' and b ~ '^[0-9]{1,12}$' then
    select o.user_id into v from out_riding o
    where o.user_id = a::uuid and floor(extract(epoch from o.started_at))::bigint = b::bigint;
  end if;
  return v;
end;
$$;
revoke execute on function feed_item_owner(text) from public, anon, authenticated;

-- May p_viewer see (and so like and comment on) this item?
create or replace function feed_can_interact(p_viewer uuid, p_key text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_owner uuid := feed_item_owner(p_key);
begin
  if p_viewer is null or v_owner is null then return false; end if;
  if v_owner = p_viewer then return true; end if;
  if not feed_can_see(p_viewer, v_owner) then return false; end if;
  -- Out Riding posts: only friends the Out Riding rules already let see it.
  if p_key like 'out:%' then
    return riders_are_friends(p_viewer, v_owner) and out_riding_visible(p_viewer, v_owner);
  end if;
  return true;
end;
$$;
revoke execute on function feed_can_interact(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The items themselves (internal). p_actors: whose items. p_group_invites: add group ride
-- invites to p_me. Out Riding items of others follow the Out Riding rules; private ride names
-- show only to riders who were on the ride.
-- ---------------------------------------------------------------------------
create or replace function social_items(
  p_me uuid, p_actors uuid[], p_kinds text[], p_group_invites boolean, p_since timestamptz, p_before timestamptz
)
returns table (
  item_key text, kind text, actor_id uuid, at timestamptz, title text, detail jsonb,
  group_id uuid, group_name text, body text, photo_path text
)
language sql stable security definer set search_path = public as $$
  select * from (
    select 'out:' || r.user_id || ':' || floor(extract(epoch from r.started_at))::bigint as item_key, 'out'::text as kind,
           r.user_id as actor_id, r.started_at as at, r.spot as title, '{}'::jsonb as detail, null::uuid as group_id,
           null::text as group_name, null::text as body, null::text as photo_path
    from out_riding r
    where r.user_id = any (p_actors) and 'out' = any (p_kinds) and out_riding_live(r)
      and (r.user_id = p_me or (riders_are_friends(p_me, r.user_id) and out_riding_visible(p_me, r.user_id)))
    union all
    select 'ride:' || c.ride_id || ':' || c.user_id, 'ride', c.user_id, coalesce(rd.ended_at, rd.meet_at),
           case when rd.visibility = 'public' or c.user_id = p_me
                  or exists (select 1 from ride_members m where m.ride_id = rd.id and m.user_id = p_me and m.status = 'joined')
                then rd.name end,
           jsonb_build_object('miles', c.miles, 'riders', greatest(c.riders_tracked, 1), 'led', c.led),
           null, null, null, null
    from rider_ride_credits c
    join rides rd on rd.id = c.ride_id
    where c.user_id = any (p_actors) and 'ride' = any (p_kinds) and rd.status = 'ended'
      and (p_since is null or coalesce(rd.ended_at, rd.meet_at) >= p_since)
    union all
    select 'badge:' || b.user_id || ':' || b.badge || ':' || b.level, 'badge', b.user_id, b.earned_at, null,
           jsonb_build_object('badge', b.badge, 'level', b.level), null, null, null, null
    from rider_badges b
    where b.user_id = any (p_actors) and 'badge' = any (p_kinds) and (p_since is null or b.earned_at >= p_since)
    union all
    select 'trail:' || t.id, 'trail', t.owner_id, t.created_at, t.name,
           jsonb_build_object('length_m', t.length_m, 'trail_id', t.id), null, null, null, null
    from shared_trails t
    where t.owner_id = any (p_actors) and 'trail' = any (p_kinds) and t.status = 'public'
      and (p_since is null or t.created_at >= p_since)
    union all
    select 'post:' || p.id, 'post', p.author_id, p.created_at, null, '{}'::jsonb, null, null, p.body, p.photo_path
    from rider_posts p
    where p.author_id = any (p_actors) and 'post' = any (p_kinds) and p.hidden_at is null
      and (p_since is null or p.created_at >= p_since)
    union all
    select null, 'group', rd.organizer_id, m.created_at, rd.name,
           jsonb_build_object('ride_id', rd.id, 'meet_at', rd.meet_at, 'code', rd.invite_code),
           g.id, g.name, null, null
    from ride_members m
    join rides rd on rd.id = m.ride_id
    join lateral (
      select gg.id, gg.name from riding_groups gg
      where is_group_member(gg.id, p_me) and is_group_member(gg.id, rd.organizer_id)
      order by gg.created_at limit 1
    ) g on true
    where p_group_invites and 'group' = any (p_kinds)
      and m.user_id = p_me and rd.organizer_id <> p_me
      and m.status in ('invited', 'joined')
      and rd.status in ('scheduled', 'live') and rd.meet_at >= now() - interval '6 hours'
      and (p_since is null or m.created_at >= p_since)
      and not riders_blocked(p_me, rd.organizer_id)
  ) x
  where p_before is null or x.at < p_before
$$;
revoke execute on function social_items(uuid, uuid[], text[], boolean, timestamptz, timestamptz) from public, anon, authenticated;

-- Likes and comments on one item, as p_me sees them: counts, my like, the latest 2 comments.
create or replace function feed_item_stats(p_me uuid, p_key text)
returns table (like_count int, comment_count int, liked boolean, comments jsonb)
language sql stable security definer set search_path = public as $$
  select
    (select count(*)::int from feed_likes l where l.item_key = p_key and not riders_blocked(p_me, l.user_id)),
    (select count(*)::int from feed_comments c where c.item_key = p_key and c.hidden_at is null and not riders_blocked(p_me, c.author_id)),
    exists (select 1 from feed_likes l where l.item_key = p_key and l.user_id = p_me),
    coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'author_id', x.author_id, 'author_name', x.author_name, 'body', x.body, 'at', x.created_at) order by x.created_at)
      from (
        select c.id, c.author_id, coalesce(nullif(btrim(pr.display_name), ''), 'Rider') as author_name, c.body, c.created_at
        from feed_comments c join profiles pr on pr.id = c.author_id
        where c.item_key = p_key and c.hidden_at is null and not riders_blocked(p_me, c.author_id)
        order by c.created_at desc limit 2
      ) x), '[]'::jsonb)
  where p_key is not null
  union all
  select 0, 0, false, '[]'::jsonb where p_key is null
$$;
revoke execute on function feed_item_stats(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- What the app calls
-- ---------------------------------------------------------------------------
-- The Social feed: everything home_feed shows (same settings), plus posts, your own posts, and
-- likes and comments on each item. Older items with p_before (the last item's "at").
create or replace function social_feed(p_limit int default 30, p_before timestamptz default null)
returns table (
  item_key text, kind text, actor_id uuid, actor_name text, at timestamptz, title text, detail jsonb,
  group_id uuid, group_name text, body text, photo_path text,
  like_count int, comment_count int, liked boolean, comments jsonb, mine boolean, actor_pro boolean
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_me uuid := auth.uid();
  v_from text;
  v_kinds text[];
  v_actors uuid[];
  v_limit int := least(greatest(coalesce(p_limit, 30), 1), 60);
begin
  if v_me is null then raise exception 'sign in first'; end if;
  select coalesce(s.show_from, 'groups'), coalesce(s.kinds, array['out', 'ride', 'badge', 'trail', 'group', 'post'])
    into v_from, v_kinds
  from (select 1) one left join rider_feed_settings s on s.user_id = v_me;

  select coalesce(array_agg(a.id), '{}') into v_actors from (
    select case when f.user_lo = v_me then f.user_hi else f.user_lo end as id
    from friendships f
    where f.status = 'accepted' and v_me in (f.user_lo, f.user_hi)
    union
    select l.leader_id from leader_follows l where l.follower_id = v_me and v_from <> 'friends'
  ) a where feed_can_see(v_me, a.id);

  return query
  select i.item_key, i.kind, i.actor_id, coalesce(nullif(btrim(p.display_name), ''), 'Rider'), i.at, i.title, i.detail,
         i.group_id, i.group_name, i.body, i.photo_path,
         st.like_count, st.comment_count, st.liked, st.comments, i.actor_id = v_me, has_pro(i.actor_id)
  from (
    select * from social_items(v_me, v_actors, v_kinds, v_from = 'groups', now() - interval '30 days', p_before)
    union all
    -- Your own posts, so you see the likes and comments on them.
    select * from social_items(v_me, array[v_me], array['post'], false, now() - interval '30 days', p_before)
    order by at desc
    limit v_limit
  ) i
  join profiles p on p.id = i.actor_id
  cross join lateral feed_item_stats(v_me, i.item_key) st
  order by i.at desc;
end;
$$;
revoke execute on function social_feed(int, timestamptz) from public, anon;
grant execute on function social_feed(int, timestamptz) to authenticated;

-- One rider's profile page: who they are to you and their totals. Activity numbers only when
-- their activity is visible to you (or it's you). Blocked either way: name only.
create or replace function rider_profile(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_name text;
  v_since timestamptz;
  v_rel text := 'none';
  v_see boolean;
  f friendships;
begin
  if v_me is null then raise exception 'sign in first'; end if;
  select coalesce(nullif(btrim(display_name), ''), 'Rider'), created_at into v_name, v_since from profiles where id = p_user;
  if not found then raise exception 'rider not found'; end if;
  if p_user <> v_me and riders_blocked(v_me, p_user) then
    return jsonb_build_object('id', p_user, 'name', v_name, 'me', false, 'blocked', true, 'relation', 'none', 'can_see', false);
  end if;
  if p_user = v_me then v_rel := 'self';
  else
    select * into f from friendships where user_lo = least(v_me, p_user) and user_hi = greatest(v_me, p_user);
    if found then
      v_rel := case when f.status = 'accepted' then 'friends' when f.requested_by = v_me then 'sent' else 'received' end;
    end if;
  end if;
  v_see := p_user = v_me or feed_can_see(v_me, p_user);
  return jsonb_build_object(
    'id', p_user, 'name', v_name, 'me', p_user = v_me, 'blocked', false, 'relation', v_rel, 'can_see', v_see,
    'pro', has_pro(p_user),
    'since', v_since,
    'follows', exists (select 1 from leader_follows where follower_id = v_me and leader_id = p_user),
    'rides', case when v_see then (select count(*) from rider_ride_credits c join rides r on r.id = c.ride_id where c.user_id = p_user and r.status = 'ended') end,
    'miles', case when v_see then (select coalesce(sum(c.miles), 0) from rider_ride_credits c join rides r on r.id = c.ride_id where c.user_id = p_user and r.status = 'ended') end,
    'badges', case when v_see then (select count(*) from rider_badges where user_id = p_user) end,
    'posts', case when v_see then (select count(*) from rider_posts where author_id = p_user and hidden_at is null) end,
    'friends', case when v_see then (select count(*) from friendships where status = 'accepted' and p_user in (user_lo, user_hi)) end);
end;
$$;
revoke execute on function rider_profile(uuid) from public, anon;
grant execute on function rider_profile(uuid) to authenticated;

-- A rider's own timeline (their profile page): posts, rides, badges, trails, Out Riding, newest
-- first, the last year. Empty unless their activity is visible to you.
create or replace function rider_timeline(p_user uuid, p_limit int default 30, p_before timestamptz default null)
returns table (
  item_key text, kind text, actor_id uuid, actor_name text, at timestamptz, title text, detail jsonb,
  group_id uuid, group_name text, body text, photo_path text,
  like_count int, comment_count int, liked boolean, comments jsonb, mine boolean, actor_pro boolean
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_me uuid := auth.uid();
  v_limit int := least(greatest(coalesce(p_limit, 30), 1), 60);
begin
  if v_me is null then raise exception 'sign in first'; end if;
  if p_user is null or (p_user <> v_me and not feed_can_see(v_me, p_user)) then return; end if;
  return query
  select i.item_key, i.kind, i.actor_id, coalesce(nullif(btrim(p.display_name), ''), 'Rider'), i.at, i.title, i.detail,
         i.group_id, i.group_name, i.body, i.photo_path,
         st.like_count, st.comment_count, st.liked, st.comments, i.actor_id = v_me, has_pro(i.actor_id)
  from (
    select * from social_items(v_me, array[p_user], array['out', 'ride', 'badge', 'trail', 'post'], false, now() - interval '365 days', p_before)
    order by at desc limit v_limit
  ) i
  join profiles p on p.id = i.actor_id
  cross join lateral feed_item_stats(v_me, i.item_key) st
  order by i.at desc;
end;
$$;
revoke execute on function rider_timeline(uuid, int, timestamptz) from public, anon;
grant execute on function rider_timeline(uuid, int, timestamptz) to authenticated;

-- One item (opened from the Feed, a notification or a link), or nothing if you can't see it.
create or replace function feed_item(p_key text)
returns table (
  item_key text, kind text, actor_id uuid, actor_name text, at timestamptz, title text, detail jsonb,
  group_id uuid, group_name text, body text, photo_path text,
  like_count int, comment_count int, liked boolean, comments jsonb, mine boolean, actor_pro boolean
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_me uuid := auth.uid();
  v_owner uuid;
begin
  if v_me is null then raise exception 'sign in first'; end if;
  if not feed_can_interact(v_me, p_key) then return; end if;
  v_owner := feed_item_owner(p_key);
  return query
  select i.item_key, i.kind, i.actor_id, coalesce(nullif(btrim(p.display_name), ''), 'Rider'), i.at, i.title, i.detail,
         i.group_id, i.group_name, i.body, i.photo_path,
         st.like_count, st.comment_count, st.liked, st.comments, i.actor_id = v_me, has_pro(i.actor_id)
  from social_items(v_me, array[v_owner], array[split_part(p_key, ':', 1)], false, null, null) i
  join profiles p on p.id = i.actor_id
  cross join lateral feed_item_stats(v_me, i.item_key) st
  where i.item_key = p_key;
end;
$$;
revoke execute on function feed_item(text) from public, anon;
grant execute on function feed_item(text) to authenticated;

-- All comments on an item, oldest first (up to 200).
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
  where c.item_key = p_key and c.hidden_at is null and not riders_blocked(v_me, c.author_id)
  order by c.created_at
  limit 200;
end;
$$;
revoke execute on function feed_item_comments(text) from public, anon;
grant execute on function feed_item_comments(text) to authenticated;

-- Who liked an item (names for "Liked by ...").
create or replace function feed_item_likes(p_key text)
returns table (user_id uuid, name text, at timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'sign in first'; end if;
  if not feed_can_interact(v_me, p_key) then return; end if;
  return query
  select l.user_id, coalesce(nullif(btrim(p.display_name), ''), 'Rider'), l.created_at
  from feed_likes l join profiles p on p.id = l.user_id
  where l.item_key = p_key and not riders_blocked(v_me, l.user_id)
  order by l.created_at desc limit 200;
end;
$$;
revoke execute on function feed_item_likes(text) from public, anon;
grant execute on function feed_item_likes(text) to authenticated;

-- Like or unlike. Returns the new like count.
create or replace function set_feed_like(p_key text, p_liked boolean)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_owner uuid;
  v_burst boolean;
  n int;
begin
  if v_me is null then raise exception 'sign in first'; end if;
  if not feed_can_interact(v_me, p_key) then raise exception 'this post isn’t available'; end if;
  v_owner := feed_item_owner(p_key);
  if coalesce(p_liked, false) then
    if (select count(*) from feed_likes where user_id = v_me and created_at > now() - interval '1 hour') >= 300 then
      raise exception 'too many likes in an hour, try again later';
    end if;
    -- Someone else liked it in the last 15 minutes: that push already went out.
    v_burst := exists (select 1 from feed_likes where item_key = p_key and user_id <> v_me and created_at > now() - interval '15 minutes');
    insert into feed_likes (item_key, user_id, owner_id) values (p_key, v_me, v_owner) on conflict do nothing;
    get diagnostics n = row_count;
    if n > 0 and v_owner <> v_me and not v_burst then
      perform queue_push(jsonb_build_object('type', 'feed_like', 'key', p_key, 'from', v_me));
    end if;
  else
    delete from feed_likes where item_key = p_key and user_id = v_me;
  end if;
  return (select count(*)::int from feed_likes where item_key = p_key);
end;
$$;
revoke execute on function set_feed_like(text, boolean) from public, anon;
grant execute on function set_feed_like(text, boolean) to authenticated;

create or replace function add_feed_comment(p_key text, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
begin
  if v_me is null then raise exception 'sign in first'; end if;
  if char_length(v_body) < 1 then raise exception 'write a comment first'; end if;
  if char_length(v_body) > 500 then raise exception 'comments can be up to 500 characters'; end if;
  if not feed_can_interact(v_me, p_key) then raise exception 'this post isn’t available'; end if;
  perform pro_required(v_me, 'social_posts');
  if (select count(*) from feed_comments where author_id = v_me and created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'too many comments, try again in a few minutes';
  end if;
  insert into feed_comments (item_key, owner_id, author_id, body)
  values (p_key, feed_item_owner(p_key), v_me, v_body)
  returning id into v_id;
  perform queue_push(jsonb_build_object('type', 'feed_comment', 'id', v_id));
  return v_id;
end;
$$;
revoke execute on function add_feed_comment(text, text) from public, anon;
grant execute on function add_feed_comment(text, text) to authenticated;

-- The comment's author, or the rider whose item it is on.
create or replace function delete_feed_comment(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'sign in first'; end if;
  delete from feed_comments where id = p_id and (author_id = v_me or owner_id = v_me);
  if not found then raise exception 'comment not found'; end if;
  delete from rider_notifications where data ->> 'commentId' = p_id::text;
end;
$$;
revoke execute on function delete_feed_comment(uuid) from public, anon;
grant execute on function delete_feed_comment(uuid) to authenticated;

-- A new post on your profile. Up to 20 a day.
create or replace function create_rider_post(p_body text, p_photo_path text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_id uuid;
begin
  if v_me is null then raise exception 'sign in first'; end if;
  if v_body is null and p_photo_path is null then raise exception 'write something or add a photo'; end if;
  if char_length(coalesce(v_body, '')) > 500 then raise exception 'posts can be up to 500 characters'; end if;
  if p_photo_path is not null and (char_length(p_photo_path) > 120 or p_photo_path !~ ('^' || v_me::text || '/[A-Za-z0-9._-]{1,80}$')) then
    raise exception 'that photo can’t be used';
  end if;
  perform pro_required(v_me, 'social_posts');
  if (select count(*) from rider_posts where author_id = v_me and created_at > now() - interval '24 hours') >= 20 then
    raise exception 'that’s 20 posts today, try again tomorrow';
  end if;
  insert into rider_posts (author_id, body, photo_path) values (v_me, v_body, p_photo_path) returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function create_rider_post(text, text) from public, anon;
grant execute on function create_rider_post(text, text) to authenticated;

-- Delete your own post (with its likes and comments). Returns the photo's path so the app removes the file.
create or replace function delete_rider_post(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_path text;
begin
  if v_me is null then raise exception 'sign in first'; end if;
  delete from rider_posts where id = p_id and author_id = v_me returning photo_path into v_path;
  if not found then raise exception 'post not found'; end if;
  delete from feed_likes where item_key = 'post:' || p_id;
  delete from rider_notifications where data ->> 'key' = 'post:' || p_id::text
     or data ->> 'commentId' in (select id::text from feed_comments where item_key = 'post:' || p_id);
  delete from feed_comments where item_key = 'post:' || p_id;
  return v_path;
end;
$$;
revoke execute on function delete_rider_post(uuid) from public, anon;
grant execute on function delete_rider_post(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Notifications: likes and comments
-- ---------------------------------------------------------------------------
alter table notification_settings add column if not exists feed_activity boolean not null default true;

create or replace function wants_feed_push(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select feed_activity from notification_settings where user_id = p_user), true)
     and wants_social_push(p_user, 'feed_activity');
$$;
revoke execute on function wants_feed_push(uuid) from public, anon, authenticated;

-- "your post", "your ride", or "Bob's badge" for the notification text.
create or replace function feed_item_phrase(p_key text, p_owner uuid, p_to uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when p_owner = p_to then 'your '
              else coalesce(nullif(btrim((select display_name from profiles where id = p_owner)), ''), 'a rider') || '’s ' end
      || case split_part(p_key, ':', 1)
           when 'post' then 'post' when 'ride' then 'ride' when 'badge' then 'badge'
           when 'trail' then 'trail' when 'out' then 'Out Riding post' else 'post' end
$$;
revoke execute on function feed_item_phrase(text, uuid, uuid) from public, anon, authenticated;

-- What to send, to whom (service role only, like push_batch):
--   {"type":"feed_like","key":<item>,"from":<liker>}   to the item's rider
--   {"type":"feed_comment","id":<comment>}             to the item's rider and up to 20 earlier
--                                                       commenters who can still see it
-- Never to a rider who blocked the other, or who turned off Likes and Comments.
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
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'not allowed';
  end if;
  if v_type = 'feed_like' then
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

-- record_notifications as in 20261102100000_notification_inbox.sql, plus feed_like and
-- feed_comment (push_batch_feed). Nothing else changes.
create or replace function record_notifications(p_event jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_type text := p_event ->> 'type';
  v_fn text;
  v_sender uuid;
  v_chat_key text;
  v_key text;
  r record;
begin
  if v_type is null then return; end if;
  -- The same routing as the Edge Function.
  v_fn := case
    when v_type in ('trial', 'badge', 'trail_hidden') then 'push_batch_account'
    when v_type in ('invite', 'leader_ride') then 'push_batch_social'
    when v_type = 'group_message' then 'push_batch_group'
    when v_type = 'direct_message' then 'push_batch_dm'
    when v_type in ('friend_request', 'friend_accept') then 'push_batch_friends'
    when v_type in ('feed_like', 'feed_comment') then 'push_batch_feed'
    else 'push_batch'
  end;
  if to_regprocedure(v_fn || '(jsonb)') is null then return; end if;
  -- Chat folds into one row per conversation; riders who blocked the sender get nothing
  -- (status taps, quick replies and announcements are never filtered, like the push).
  if v_type = 'message' then
    select m.user_id, case when m.kind = 'chat' then 'chat:' || m.ride_id || ':' || m.audience end
      into v_sender, v_chat_key
    from ride_messages m where m.id = (p_event ->> 'id')::uuid;
    if v_chat_key is null then v_sender := null; end if;
  elsif v_type = 'group_message' then
    select m.user_id, 'group:' || m.group_id into v_sender, v_chat_key
    from group_messages m where m.id = (p_event ->> 'id')::uuid;
  end if;
  for r in execute format(
    'select distinct on (b.user_id) b.user_id, b.title, b.body, b.data from %I($1) b order by b.user_id', v_fn
  ) using p_event loop
    if v_sender is not null and exists (
      select 1 from blocked_riders x where x.blocker_id = r.user_id and x.blocked_id = v_sender
    ) then
      continue;
    end if;
    v_key := case
      when r.data ? 'collapseId' then 'item:' || (r.data ->> 'collapseId')
      when v_type = 'direct_message' then 'dm:' || coalesce(r.data ->> 'userId', '')
      else v_chat_key
    end;
    if v_key like 'item:%' then
      -- A status tap and its cancellation: the newer one replaces the older.
      delete from rider_notifications n where n.user_id = r.user_id and n.collapse_key = v_key;
    elsif v_key is not null then
      update rider_notifications n
      set title = r.title, body = coalesce(r.body, ''), data = coalesce(r.data, '{}'), count = n.count + 1, created_at = now()
      where n.user_id = r.user_id and n.collapse_key = v_key and n.read_at is null;
      if found then continue; end if;
    end if;
    insert into rider_notifications (user_id, kind, title, body, data, collapse_key)
    values (r.user_id, coalesce(r.data ->> 'type', v_type), r.title, coalesce(r.body, ''), coalesce(r.data, '{}'), v_key);
    delete from rider_notifications n
    where n.user_id = r.user_id
      and (n.created_at < now() - interval '30 days'
           or n.id in (select o.id from rider_notifications o where o.user_id = r.user_id order by o.created_at desc offset 100));
  end loop;
exception when others then
  -- Never stop the message, status tap or ride change that caused it.
  raise warning 'record_notifications: %', sqlerrm;
end;
$$;
revoke execute on function record_notifications(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Moderation: reporting a post or a comment
-- ---------------------------------------------------------------------------
alter table reports add column if not exists post_id uuid references rider_posts (id) on delete set null;
alter table reports add column if not exists comment_id uuid references feed_comments (id) on delete set null;
-- The post or comment text when it was reported (so deleting it hides nothing from the owner).
alter table reports add column if not exists reported_text text check (reported_text is null or char_length(reported_text) <= 1000);
alter table reports add column if not exists reported_photo text;
grant insert (post_id, comment_id) on reports to authenticated;
create index if not exists reports_post_idx on reports (post_id) where post_id is not null;
create index if not exists reports_comment_idx on reports (comment_id) where comment_id is not null;

do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'reports'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%source%'
  loop
    execute format('alter table reports drop constraint %I', c);
  end loop;
end $$;
alter table reports add constraint reports_source_check check (
  source is null or source in ('dm', 'group_chat', 'ride_chat', 'ride', 'roster', 'out_riding', 'you', 'post', 'comment', 'profile')
);

-- Fills in who is reported and copies the text; refuses posts and comments you can't see.
create or replace function reports_social_fill()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  p rider_posts;
  c feed_comments;
begin
  if new.post_id is null and new.comment_id is null then return new; end if;
  if new.post_id is not null and new.comment_id is not null then raise exception 'report a post or a comment, not both'; end if;
  if new.post_id is not null then
    select * into p from rider_posts where id = new.post_id;
    if not found or p.author_id = new.reporter_id
       or not (feed_can_see(new.reporter_id, p.author_id)) then
      raise exception 'post not found';
    end if;
    new.kind := 'rider';
    new.reported_user_id := p.author_id;
    new.reported_text := left(coalesce(p.body, ''), 1000);
    new.reported_photo := p.photo_path;
    new.source := coalesce(new.source, 'post');
  else
    select * into c from feed_comments where id = new.comment_id;
    if not found or c.author_id = new.reporter_id
       or not (c.owner_id = new.reporter_id or feed_can_interact(new.reporter_id, c.item_key)) then
      raise exception 'comment not found';
    end if;
    new.kind := 'rider';
    new.reported_user_id := c.author_id;
    new.reported_text := left(c.body, 1000);
    new.source := coalesce(new.source, 'comment');
  end if;
  return new;
end;
$$;
revoke execute on function reports_social_fill() from public, anon, authenticated;
drop trigger if exists reports_social_fill on reports;
-- "a_" so it runs before the other before-insert triggers (they fire in name order).
drop trigger if exists a_reports_social_fill on reports;
create trigger a_reports_social_fill before insert on reports for each row execute function reports_social_fill();

-- Three different riders reporting the same post or comment hide it until the owner reviews it.
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
  end if;
  return null;
end;
$$;
revoke execute on function reports_social_autohide() from public, anon, authenticated;
drop trigger if exists reports_social_autohide on reports;
create trigger reports_social_autohide after insert on reports for each row execute function reports_social_autohide();

-- ---------------------------------------------------------------------------
-- Admin Dashboard
-- ---------------------------------------------------------------------------
create or replace function admin_set_post_hidden(p_id uuid, p_hidden boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  perform require_admin();
  if p_hidden and length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'a reason is required'; end if;
  select jsonb_build_object('hidden_at', hidden_at, 'hidden_reason', hidden_reason) into v_before from rider_posts where id = p_id for update;
  if not found then raise exception 'post not found'; end if;
  update rider_posts
  set hidden_at = case when p_hidden then now() end,
      hidden_by = case when p_hidden then 'admin' end,
      hidden_reason = case when p_hidden then btrim(p_reason) end
  where id = p_id;
  perform log_admin_action(case when p_hidden then 'post.hide' else 'post.restore' end, 'post', p_id::text, v_before,
    jsonb_build_object('reason', nullif(btrim(coalesce(p_reason, '')), '')));
end;
$$;
revoke execute on function admin_set_post_hidden(uuid, boolean, text) from public, anon;
grant execute on function admin_set_post_hidden(uuid, boolean, text) to authenticated;

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
  if p_hidden then delete from rider_notifications where data ->> 'commentId' = p_id::text; end if;
  perform log_admin_action(case when p_hidden then 'comment.hide' else 'comment.restore' end, 'comment', p_id::text, v_before,
    jsonb_build_object('reason', nullif(btrim(coalesce(p_reason, '')), '')));
end;
$$;
revoke execute on function admin_set_comment_hidden(uuid, boolean, text) from public, anon;
grant execute on function admin_set_comment_hidden(uuid, boolean, text) to authenticated;

-- Deletes a post for good. Returns its photo path so the dashboard deletes the file.
create or replace function admin_delete_post(p_id uuid, p_reason text)
returns text language plpgsql security definer set search_path = public as $$
declare
  p rider_posts;
begin
  perform require_admin();
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'a reason is required'; end if;
  delete from rider_posts where id = p_id returning * into p;
  if p.id is null then raise exception 'post not found'; end if;
  delete from feed_likes where item_key = 'post:' || p_id;
  delete from feed_comments where item_key = 'post:' || p_id;
  delete from rider_notifications where data ->> 'key' = 'post:' || p_id::text;
  perform log_admin_action('post.delete', 'post', p_id::text,
    jsonb_build_object('author_id', p.author_id, 'body', p.body, 'photo_path', p.photo_path),
    jsonb_build_object('reason', btrim(p_reason)));
  return p.photo_path;
end;
$$;
revoke execute on function admin_delete_post(uuid, text) from public, anon;
grant execute on function admin_delete_post(uuid, text) to authenticated;

-- A rider's latest posts and comments, hidden ones included (Admin > Users > rider).
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
      select c.id, c.item_key, c.body, c.created_at, c.hidden_at, c.hidden_reason, c.hidden_by,
             coalesce(nullif(btrim(o.display_name), ''), 'Rider') as owner_name,
             (select count(*) from reports r where r.comment_id = c.id) as reports
      from feed_comments c left join profiles o on o.id = c.owner_id
      where c.author_id = p_user order by c.created_at desc limit 50) x), '[]'));
end;
$$;
revoke execute on function admin_rider_social(uuid) from public, anon;
grant execute on function admin_rider_social(uuid) to authenticated;

-- admin_reports as in 20261102800000_abuse_reports.sql, plus post_id, comment_id and reported_text.
create or replace function admin_reports(p_status text default 'open', p_page int default 0, p_page_size int default 50)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_rows jsonb; v_total bigint;
begin
  perform require_admin();
  p_page_size := least(greatest(coalesce(p_page_size, 50), 1), 200);
  p_page := greatest(coalesce(p_page, 0), 0);
  with f as (
    select x.id, x.kind, x.reason, x.details, x.status, x.created_at, x.resolved_at, x.resolution_note,
           x.source, x.group_id, g.name as group_name,
           x.ride_id, rd.name as ride_name, rd.status as ride_status,
           x.reported_user_id, ru.display_name as reported_name,
           x.reporter_id, rp.display_name as reporter_name,
           x.post_id, x.comment_id, x.reported_text,
           (select count(*) from reports y where y.reported_user_id is not null and y.reported_user_id = x.reported_user_id) as reports_on_user,
           (select count(*) from report_messages m where m.report_id = x.id) as messages_copied,
           (select u.banned_until from auth.users u where u.id = x.reported_user_id) as reported_banned_until
    from reports x
    left join rides rd on rd.id = x.ride_id
    left join riding_groups g on g.id = x.group_id
    left join profiles ru on ru.id = x.reported_user_id
    left join profiles rp on rp.id = x.reporter_id
    where case coalesce(p_status, 'open')
      when 'open' then x.status in ('open', 'reviewing')
      when 'all' then true
      else x.status = p_status end
  )
  select (select count(*) from f),
         coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
           select * from f order by created_at desc offset p_page * p_page_size limit p_page_size) x), '[]')
    into v_total, v_rows;
  return jsonb_build_object('rows', v_rows, 'total', v_total);
end;
$$;

-- admin_report as in 20261102800000_abuse_reports.sql, plus the reported post or comment: what it
-- said when reported, and (if it still exists) whether it is hidden now.
create or replace function admin_report(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v jsonb;
begin
  perform require_admin();
  select to_jsonb(x) into v from (
    select r.id, r.kind, r.reason, r.details, r.status, r.created_at, r.resolved_at, r.resolution_note, r.source,
           r.group_id, g.name as group_name, r.ride_id, rd.name as ride_name,
           r.reported_user_id, ru.display_name as reported_name,
           r.reporter_id, rp.display_name as reporter_name,
           r.post_id, r.comment_id, r.reported_text, r.reported_photo,
           (select count(*) from reports y where r.reported_user_id is not null and y.reported_user_id = r.reported_user_id) as reports_on_user,
           (select count(distinct y.reporter_id) from reports y where r.reported_user_id is not null and y.reported_user_id = r.reported_user_id) as reporters_on_user,
           (select u.banned_until from auth.users u where u.id = r.reported_user_id) as reported_banned_until,
           (select jsonb_build_object('id', p.id, 'body', p.body, 'photo_path', p.photo_path, 'created_at', p.created_at,
                     'hidden_at', p.hidden_at, 'hidden_reason', p.hidden_reason, 'hidden_by', p.hidden_by,
                     'reporters', (select count(distinct y.reporter_id) from reports y where y.post_id = p.id))
              from rider_posts p where p.id = r.post_id) as post,
           (select jsonb_build_object('id', c.id, 'body', c.body, 'item_key', c.item_key, 'created_at', c.created_at,
                     'hidden_at', c.hidden_at, 'hidden_reason', c.hidden_reason, 'hidden_by', c.hidden_by,
                     'owner_name', coalesce(nullif(btrim(o.display_name), ''), 'Rider'),
                     'reporters', (select count(distinct y.reporter_id) from reports y where y.comment_id = c.id))
              from feed_comments c left join profiles o on o.id = c.owner_id where c.id = r.comment_id) as comment,
           coalesce((select jsonb_agg(jsonb_build_object(
               'source', m.source, 'source_id', m.source_id, 'source_name', m.source_name,
               'sender_id', m.sender_id, 'sender_name', m.sender_name, 'body', m.body, 'sent_at', m.sent_at)
             order by m.source, m.source_id, m.sent_at)
             from report_messages m where m.report_id = r.id), '[]') as messages
    from reports r
    left join riding_groups g on g.id = r.group_id
    left join rides rd on rd.id = r.ride_id
    left join profiles ru on ru.id = r.reported_user_id
    left join profiles rp on rp.id = r.reporter_id
    where r.id = p_id
  ) x;
  if v is null then raise exception 'report not found'; end if;
  perform log_admin_action('report.view', 'report', p_id::text, null,
          jsonb_build_object('messages', jsonb_array_length(v -> 'messages')));
  return v;
end;
$$;
revoke execute on function admin_report(uuid) from public, anon;
grant execute on function admin_report(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: post photos (rider-posts/<user id>/<file>), and a smaller cap on profile pictures.
-- Same rules as rider-avatars: public read at an unguessable path, writes only into your own
-- folder, admins (with two-factor) can delete. Skipped when there is no storage schema (CI).
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'storage schema not found; skipping rider-posts bucket';
    return;
  end if;

  insert into storage.buckets (id, name, public)
  values ('rider-posts', 'rider-posts', true)
  on conflict (id) do update set public = true;

  -- The app uploads a JPEG at most 1280 px on its long side, about 120-300 KB.
  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit') then
    execute $q$update storage.buckets set file_size_limit = 1048576 where id = 'rider-posts'$q$;
    -- Profile pictures are 512 x 512 JPEGs of about 40-150 KB.
    execute $q$update storage.buckets set file_size_limit = 524288 where id = 'rider-avatars'$q$;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    execute $q$update storage.buckets set allowed_mime_types = array['image/jpeg'] where id = 'rider-posts'$q$;
  end if;

  execute 'drop policy if exists rider_posts_owner_read on storage.objects';
  execute 'drop policy if exists rider_posts_owner_insert on storage.objects';
  execute 'drop policy if exists rider_posts_owner_delete on storage.objects';
  execute 'drop policy if exists rider_posts_admin_read on storage.objects';
  execute 'drop policy if exists rider_posts_admin_delete on storage.objects';

  execute $p$create policy rider_posts_owner_read on storage.objects for select to authenticated
    using (bucket_id = 'rider-posts' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy rider_posts_owner_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'rider-posts' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy rider_posts_owner_delete on storage.objects for delete to authenticated
    using (bucket_id = 'rider-posts' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy rider_posts_admin_read on storage.objects for select to authenticated
    using (bucket_id = 'rider-posts' and is_admin(auth.uid()) and coalesce(auth.jwt() ->> 'aal', '') = 'aal2')$p$;
  execute $p$create policy rider_posts_admin_delete on storage.objects for delete to authenticated
    using (bucket_id = 'rider-posts' and is_admin(auth.uid()) and coalesce(auth.jwt() ->> 'aal', '') = 'aal2')$p$;
end $$;
