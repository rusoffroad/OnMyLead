-- Friends: add a rider as a friend, see friends in Out Riding, and message them.
--
-- A rider sends a friend request; the other rider accepts or declines it. Once accepted the two
-- are friends: they count as "riders you know" everywhere riders_know_each_other is used, so a
-- friend who is Out Riding with "Riders I Know" shows up in your Out Riding list (still within
-- the 50-mile cap, still whole miles only), and you can start a direct message with a friend at
-- any time.
--
-- Who can send a request:
-- - By rider (send_friend_request): only a rider you already know (ridden with, or share a riding
--   group with), one you can see Out Riding right now, or one you already have a conversation
--   with. Nobody can friend-request a stranger just by knowing their id.
-- - By friend link (send_friend_request_by_code): every rider has a private friend code, shared as
--   onmylead.com/friend/<code>. Anyone signed in who has the link can send a request. A rider can make
--   a new link at any time, which stops the old one working.
-- - There is no search by name, so nobody can browse the list of riders.
--
-- Privacy and safety:
-- - Only the two riders can read a friendship row. Changes go through the functions below.
-- - Blocking a rider removes the friendship and any request (trigger on blocked_riders), and a
--   blocked rider can't send a request either way. A declined request just disappears; the
--   sender isn't told it was declined.
-- - Rate limits: 30 requests a day, and at most 2 to the same rider a week.
-- - Being friends never shares a location. Out Riding still decides that, with the same rules.
--
-- Push: a new category, friend_requests, with its own switch in notification settings. A new
-- request and an accepted request go through queue_push as {"type":"friend_request"} and
-- {"type":"friend_accept"}; push_batch_friends builds them and the notify-ride-message Edge
-- Function routes those types there.
--
-- Additive only: new tables and functions, one new notification setting column, and
-- riders_know_each_other now also counts friends (it is internal: no client can call it).
-- Every app build already in riders' hands keeps working.

-- ---------------------------------------------------------------------------
-- Friendships
-- ---------------------------------------------------------------------------
create table friendships (
  user_lo uuid not null references profiles (id) on delete cascade,
  user_hi uuid not null references profiles (id) on delete cascade,
  requested_by uuid not null references profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (user_lo, user_hi),
  check (user_lo < user_hi),
  check (requested_by in (user_lo, user_hi))
);
create index friendships_hi_idx on friendships (user_hi);
alter table friendships enable row level security;

create policy friendships_party_read on friendships for select to authenticated
  using (auth.uid() in (user_lo, user_hi));
revoke all on friendships from anon, authenticated;
grant select on friendships to authenticated;

-- Every request sent, for the rate limits (kept even when a request is cancelled or declined).
create table friend_request_log (
  sender_id uuid not null references profiles (id) on delete cascade,
  recipient_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index friend_request_log_sender_idx on friend_request_log (sender_id, created_at);
alter table friend_request_log enable row level security;
revoke all on friend_request_log from anon, authenticated;

-- Each rider's private friend link code.
create table friend_codes (
  user_id uuid primary key references profiles (id) on delete cascade,
  code text not null unique default upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 10)),
  created_at timestamptz not null default now()
);
alter table friend_codes enable row level security;
revoke all on friend_codes from anon, authenticated;

-- Are these two riders friends (accepted)?
create or replace function riders_are_friends(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from friendships
    where user_lo = least(p_a, p_b) and user_hi = greatest(p_a, p_b) and status = 'accepted'
  );
$$;
revoke execute on function riders_are_friends(uuid, uuid) from public, anon, authenticated;

-- Riders who know each other: been on a ride together, share a riding group, or are friends.
-- (Replaces the version from 20261101700000_out_riding.sql; same signature.)
create or replace function riders_know_each_other(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select riders_are_friends(p_a, p_b)
      or ridden_together(p_a, p_b)
      or exists (
        select 1 from riding_groups g
        where (g.owner_id = p_a or exists (select 1 from riding_group_members m where m.group_id = g.id and m.user_id = p_a))
          and (g.owner_id = p_b or exists (select 1 from riding_group_members m where m.group_id = g.id and m.user_id = p_b))
      );
$$;
revoke execute on function riders_know_each_other(uuid, uuid) from public, anon, authenticated;

-- Blocking removes the friendship and any request, both ways.
create or replace function friendships_on_block()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from friendships
  where user_lo = least(new.blocker_id, new.blocked_id) and user_hi = greatest(new.blocker_id, new.blocked_id);
  return null;
end;
$$;
create trigger blocked_riders_end_friendship after insert on blocked_riders
  for each row execute function friendships_on_block();

-- The shared part of sending a request (after the caller checked who may be asked).
-- Returns 'requested', 'accepted' (they had already asked me, so we're friends now) or 'already'.
create or replace function friend_request_send(p_me uuid, p_to uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_row friendships;
begin
  if p_me is null then raise exception 'sign in first'; end if;
  if p_to is null or p_to = p_me then raise exception 'friend_not_allowed: you can''t add yourself'; end if;
  if not exists (select 1 from profiles where id = p_to) then raise exception 'friend_not_allowed: rider not found'; end if;
  if exists (select 1 from blocked_riders where blocker_id = p_me and blocked_id = p_to) then
    raise exception 'friend_you_blocked: unblock this rider to add them';
  end if;
  -- If they blocked me it fails like any rider I can't add, so I can't tell.
  if riders_blocked(p_me, p_to) then
    raise exception 'friend_not_allowed: you can''t add this rider';
  end if;

  select * into v_row from friendships where user_lo = least(p_me, p_to) and user_hi = greatest(p_me, p_to) for update;
  if found then
    if v_row.status = 'accepted' or v_row.requested_by = p_me then return 'already'; end if;
    -- They asked me first: sending one back accepts it.
    update friendships set status = 'accepted', accepted_at = now()
    where user_lo = v_row.user_lo and user_hi = v_row.user_hi;
    perform queue_push(jsonb_build_object('type', 'friend_accept', 'from', p_me, 'to', p_to));
    return 'accepted';
  end if;

  if (select count(*) from friend_request_log where sender_id = p_me and created_at > now() - interval '1 day') >= 30 then
    raise exception 'friend_daily_limit: too many friend requests today';
  end if;
  if (select count(*) from friend_request_log
      where sender_id = p_me and recipient_id = p_to and created_at > now() - interval '7 days') >= 2 then
    raise exception 'friend_daily_limit: you already asked this rider this week';
  end if;

  insert into friendships (user_lo, user_hi, requested_by) values (least(p_me, p_to), greatest(p_me, p_to), p_me);
  insert into friend_request_log (sender_id, recipient_id) values (p_me, p_to);
  perform queue_push(jsonb_build_object('type', 'friend_request', 'from', p_me, 'to', p_to));
  return 'requested';
end;
$$;
revoke execute on function friend_request_send(uuid, uuid) from public, anon, authenticated;

-- Add a rider I know, can see Out Riding, or already have a conversation with.
create or replace function send_friend_request(p_to uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'sign in first'; end if;
  if p_to is not null and p_to <> v_me
     and not exists (select 1 from friendships where user_lo = least(v_me, p_to) and user_hi = greatest(v_me, p_to))
     and not (
       riders_know_each_other(v_me, p_to)
       or out_riding_visible(v_me, p_to)
       or exists (select 1 from dm_threads where user_lo = least(v_me, p_to) and user_hi = greatest(v_me, p_to))
     ) then
    raise exception 'friend_not_allowed: send them your friend link instead';
  end if;
  return friend_request_send(v_me, p_to);
end;
$$;

-- My friend link code (made the first time it's asked for).
create or replace function my_friend_code()
returns text language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_code text;
begin
  if v_me is null then raise exception 'sign in first'; end if;
  insert into friend_codes (user_id) values (v_me) on conflict (user_id) do nothing;
  select code into v_code from friend_codes where user_id = v_me;
  return v_code;
end;
$$;

-- A new friend link; the old one stops working.
create or replace function reset_friend_code()
returns text language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_code text;
begin
  if v_me is null then raise exception 'sign in first'; end if;
  delete from friend_codes where user_id = v_me;
  insert into friend_codes (user_id) values (v_me) returning code into v_code;
  return v_code;
end;
$$;

-- Who a friend link belongs to, for the link page. Signed-in riders only. Nothing for a link
-- that doesn't exist, or between riders where either blocked the other.
-- relation: 'self', 'friends', 'sent' (I asked them), 'received' (they asked me) or 'none'.
create or replace function friend_preview(p_code text)
returns table (user_id uuid, display_name text, photo_url text, relation text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_owner uuid;
begin
  if v_me is null then raise exception 'sign in first'; end if;
  select c.user_id into v_owner from friend_codes c where c.code = upper(btrim(coalesce(p_code, '')));
  if v_owner is null or riders_blocked(v_me, v_owner) then return; end if;
  return query
  select p.id,
         coalesce(nullif(btrim(p.display_name), ''), 'Rider'),
         p.photo_url,
         case
           when p.id = v_me then 'self'
           when f.status = 'accepted' then 'friends'
           when f.requested_by = v_me then 'sent'
           when f.requested_by is not null then 'received'
           else 'none'
         end
  from profiles p
  left join friendships f on f.user_lo = least(v_me, p.id) and f.user_hi = greatest(v_me, p.id)
  where p.id = v_owner;
end;
$$;

create or replace function send_friend_request_by_code(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_owner uuid;
begin
  if v_me is null then raise exception 'sign in first'; end if;
  select c.user_id into v_owner from friend_codes c where c.code = upper(btrim(coalesce(p_code, '')));
  if v_owner is null then raise exception 'friend_link_not_found: this friend link doesn''t work anymore'; end if;
  return friend_request_send(v_me, v_owner);
end;
$$;

-- Accept or decline a request someone sent me. Declining deletes it; they aren't told.
create or replace function respond_friend_request(p_from uuid, p_accept boolean)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_row friendships;
begin
  if v_me is null then raise exception 'sign in first'; end if;
  select * into v_row from friendships
  where user_lo = least(v_me, p_from) and user_hi = greatest(v_me, p_from) and status = 'pending' and requested_by = p_from
  for update;
  if not found then raise exception 'friend_request_not_found: this request isn''t there anymore'; end if;
  if coalesce(p_accept, false) then
    update friendships set status = 'accepted', accepted_at = now()
    where user_lo = v_row.user_lo and user_hi = v_row.user_hi;
    perform queue_push(jsonb_build_object('type', 'friend_accept', 'from', v_me, 'to', p_from));
    return 'accepted';
  end if;
  delete from friendships where user_lo = v_row.user_lo and user_hi = v_row.user_hi;
  return 'declined';
end;
$$;

-- Remove a friend, or cancel a request I sent (or decline one I got). The other rider isn't told.
create or replace function remove_friend(p_other uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'sign in first'; end if;
  delete from friendships where user_lo = least(v_me, p_other) and user_hi = greatest(v_me, p_other);
  return found;
end;
$$;

-- My friends and requests. out_now and miles only when the friend is in my Out Riding list right
-- now (same rules as nearby_riders: I must be Out Riding too, and it's whole miles only).
create or replace function my_friends()
returns table (
  user_id uuid, display_name text, photo_url text, status text, since timestamptz,
  out_now boolean, miles int, spot text, riding_types text[]
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_mine out_riding;
begin
  if v_me is null then raise exception 'sign in first'; end if;
  select * into v_mine from out_riding o where o.user_id = v_me and out_riding_live(o);
  return query
  select o.id,
         coalesce(nullif(btrim(p.display_name), ''), 'Rider'),
         p.photo_url,
         case when f.status = 'accepted' then 'friends' when f.requested_by = v_me then 'sent' else 'received' end,
         coalesce(f.accepted_at, f.created_at),
         vis.ok,
         case
           when not vis.ok then null
           when d.mi < 1 then 0
           when d.mi < 10 then round(d.mi)::int
           else (round(d.mi / 5) * 5)::int
         end,
         case when vis.ok then r.spot end,
         p.riding_types
  from friendships f
  cross join lateral (select case when f.user_lo = v_me then f.user_hi else f.user_lo end as id) o
  join profiles p on p.id = o.id
  left join out_riding r on r.user_id = o.id
  cross join lateral (select (f.status = 'accepted' and v_mine.user_id is not null and out_riding_visible(v_me, o.id)) as ok) vis
  cross join lateral (
    select case when vis.ok then miles_between(v_mine.area_lat, v_mine.area_lng, r.area_lat, r.area_lng) end as mi
  ) d
  where v_me in (f.user_lo, f.user_hi)
    and not riders_blocked(v_me, o.id)
  order by (f.status = 'accepted') desc, vis.ok desc, p.display_name;
end;
$$;

-- Riders I might add: ridden with or in a riding group with me, not friends or asked yet, not
-- blocked either way. Most recent first.
create or replace function friend_suggestions()
returns table (user_id uuid, display_name text, photo_url text, reason text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'sign in first'; end if;
  return query
  with known as (
    select b.user_id as id, max(b.created_at) as at, 'ride'::text as why
    from ride_members a join ride_members b on b.ride_id = a.ride_id
    where a.user_id = v_me and b.user_id <> v_me and a.status = 'joined' and b.status = 'joined'
    group by b.user_id
    union all
    select x.id, max(x.at), 'group'
    from (
      select m.user_id as id, m.created_at as at from riding_groups g join riding_group_members m on m.group_id = g.id
      where (g.owner_id = v_me or exists (select 1 from riding_group_members mm where mm.group_id = g.id and mm.user_id = v_me))
      union all
      select g.owner_id, g.created_at from riding_groups g
      where exists (select 1 from riding_group_members mm where mm.group_id = g.id and mm.user_id = v_me)
    ) x
    where x.id <> v_me
    group by x.id
  ), best as (
    select k.id, max(k.at) as at, min(k.why) as why from known k group by k.id
  )
  select p.id, coalesce(nullif(btrim(p.display_name), ''), 'Rider'), p.photo_url,
         case when b.why = 'group' then 'In a Riding Group With You' else 'Ridden With You' end
  from best b
  join profiles p on p.id = b.id
  where not exists (select 1 from friendships f where f.user_lo = least(v_me, b.id) and f.user_hi = greatest(v_me, b.id))
    and not riders_blocked(v_me, b.id)
  order by b.at desc
  limit 30;
end;
$$;

revoke execute on function send_friend_request(uuid), my_friend_code(), reset_friend_code(), friend_preview(text),
  send_friend_request_by_code(text), respond_friend_request(uuid, boolean), remove_friend(uuid), my_friends(),
  friend_suggestions() from public, anon;
grant execute on function send_friend_request(uuid), my_friend_code(), reset_friend_code(), friend_preview(text),
  send_friend_request_by_code(text), respond_friend_request(uuid, boolean), remove_friend(uuid), my_friends(),
  friend_suggestions() to authenticated;

-- ---------------------------------------------------------------------------
-- Push
-- ---------------------------------------------------------------------------
alter table notification_settings add column friend_requests boolean not null default true;

-- The Friend Requests switch, then quiet hours.
create or replace function wants_friend_push(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select friend_requests from notification_settings where user_id = p_user), true)
     and wants_social_push(p_user, 'friend_requests');
$$;
revoke execute on function wants_friend_push(uuid) from public, anon, authenticated;

-- What to send, to whom (service role only, like push_batch):
--   {"type":"friend_request","from":<sender>,"to":<recipient>}  only while the request is still waiting
--   {"type":"friend_accept","from":<accepter>,"to":<requester>}  only while they're still friends
-- Never to a rider who blocked the other.
create or replace function push_batch_friends(p_event jsonb)
returns table (user_id uuid, token text, platform text, title text, body text, thread_id text, data jsonb)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_type text := p_event ->> 'type';
  v_from uuid;
  v_to uuid;
  v_who text;
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'not allowed';
  end if;
  if v_type not in ('friend_request', 'friend_accept') then return; end if;
  v_from := (p_event ->> 'from')::uuid;
  v_to := (p_event ->> 'to')::uuid;
  if v_from is null or v_to is null or riders_blocked(v_from, v_to) then return; end if;
  if v_type = 'friend_request' and not exists (
    select 1 from friendships f
    where f.user_lo = least(v_from, v_to) and f.user_hi = greatest(v_from, v_to) and f.status = 'pending' and f.requested_by = v_from
  ) then return; end if;
  if v_type = 'friend_accept' and not riders_are_friends(v_from, v_to) then return; end if;
  select coalesce(nullif(btrim(display_name), ''), 'A rider') into v_who from profiles where id = v_from;

  return query
  select t.user_id, t.token, t.platform,
         case when v_type = 'friend_request' then 'Friend Request' else 'New Friend' end,
         case when v_type = 'friend_request'
              then coalesce(v_who, 'A rider') || ' wants to be friends on OnMyLead.'
              else coalesce(v_who, 'A rider') || ' accepted your friend request.' end,
         'friends',
         jsonb_build_object('type', v_type, 'userId', v_from)
  from push_tokens t
  where t.user_id = v_to
    and wants_friend_push(t.user_id);
end;
$$;
revoke execute on function push_batch_friends(jsonb) from public, anon, authenticated;
