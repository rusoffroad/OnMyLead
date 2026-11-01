-- Out Riding: see who else is out riding near you, and message them.
--
-- A rider can switch on "Out Riding" when they're out on the trail or at a park for the weekend.
-- While it's on, other riders who are Out Riding nearby see them in a list, with roughly how far
-- away they are, and can send them a direct message. It's like "online" in a video game, for
-- riders.
--
-- Privacy (Chris has real users, and precise location is never public):
-- - Off by default. Nobody shows up until they switch it on themselves.
-- - Only a rough area is stored: the point is snapped here, in the database, to a grid of about
--   half a mile to a mile, before it is saved. The exact point never leaves set_out_riding.
-- - Nobody can read the out_riding table except their own row. Other riders only get
--   nearby_riders(), which returns a name and a whole number of miles (rounded, never closer than
--   "under a mile"), never coordinates.
-- - You only see others while you're Out Riding yourself (no lurking), and only riders within
--   50 miles at most.
-- - Who sees you: "riders" (the default) means only riders you've been on a ride with or share a
--   riding group with. "everyone" adds any other rider who is Out Riding nearby and also chose
--   "everyone". You can only see strangers while strangers can see you.
-- - Blocking works both ways: a blocked rider and the rider who blocked them never see each other
--   here, and the blocked rider can't message them. The blocked rider is never told.
-- - It turns itself off: at the end the rider picked (at most 3 days), and after 6 hours without
--   the app being opened (the app refreshes the area each time it's opened while Out Riding).
-- - Turning it off deletes the row.
--
-- Direct messages: two riders can message each other. A conversation can only be started with
-- someone you can see Out Riding right now, or someone you've ridden with or share a group with.
-- Until the other rider replies, you can send at most 3 messages. Rate limits: 10 messages a
-- minute, 200 a day, 10 new conversations a day. Messages from a rider you blocked are hidden from
-- you by the read policy and send no push. Report Rider works from a conversation (reports table).
-- Each rider can mute a conversation or delete it from their own list.
--
-- Push: a new category, direct_messages, with its own switch in notification settings. Each
-- message goes through queue_push as {"type":"direct_message","id":...}; push_batch_dm builds it
-- and the notify-ride-message Edge Function routes that type there.
--
-- Additive only: new tables, functions and triggers, and one new notification setting column.
-- Nothing existing is changed, so every app build already in riders' hands keeps working.

-- ---------------------------------------------------------------------------
-- Out Riding status
-- ---------------------------------------------------------------------------
create table out_riding (
  user_id uuid primary key references profiles (id) on delete cascade,
  -- Rough area only (see out_riding_snap): never the rider's exact position.
  area_lat double precision not null check (area_lat between -90 and 90),
  area_lng double precision not null check (area_lng between -180 and 180),
  audience text not null default 'riders' check (audience in ('riders', 'everyone')),
  -- Optional, in the rider's words: "Windrock Park", "Hatfield-McCoy this weekend".
  spot text check (spot is null or char_length(spot) between 1 and 40),
  started_at timestamptz not null default now(),
  refreshed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  -- Rate limit on area updates (stops anyone walking a fake point around to pin someone down).
  updates_window_at timestamptz not null default now(),
  updates_in_window int not null default 0
);
create index out_riding_expires_idx on out_riding (expires_at);
create index out_riding_area_idx on out_riding (area_lat, area_lng);
alter table out_riding enable row level security;

-- Each rider reads only their own row. Changes go through set_out_riding / stop_out_riding.
create policy out_riding_own_read on out_riding for select to authenticated using (user_id = auth.uid());
revoke all on out_riding from anon, authenticated;
grant select on out_riding to authenticated;

-- How long after the app was last opened a rider stays listed.
create or replace function out_riding_idle() returns interval language sql immutable as $$ select interval '6 hours' $$;

-- Is this row listed right now?
create or replace function out_riding_live(o out_riding)
returns boolean language sql stable set search_path = public as $$
  select o.expires_at > now() and o.refreshed_at > now() - out_riding_idle();
$$;

-- Snap a coordinate to a grid of 0.01 degrees (about 0.7 of a mile north-south, less east-west).
create or replace function out_riding_snap(p double precision)
returns double precision language sql immutable as $$
  select round(p::numeric, 2)::double precision;
$$;

-- Miles between two points (haversine).
create or replace function miles_between(a_lat double precision, a_lng double precision, b_lat double precision, b_lng double precision)
returns double precision language sql immutable as $$
  select 3958.8 * 2 * asin(sqrt(
    power(sin(radians(b_lat - a_lat) / 2), 2)
    + cos(radians(a_lat)) * cos(radians(b_lat)) * power(sin(radians(b_lng - a_lng) / 2), 2)
  ));
$$;

-- Riders who know each other: been on a ride together, or share a riding group.
create or replace function riders_know_each_other(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select ridden_together(p_a, p_b)
      or exists (
        select 1 from riding_groups g
        where (g.owner_id = p_a or exists (select 1 from riding_group_members m where m.group_id = g.id and m.user_id = p_a))
          and (g.owner_id = p_b or exists (select 1 from riding_group_members m where m.group_id = g.id and m.user_id = p_b))
      );
$$;
revoke execute on function riders_know_each_other(uuid, uuid) from public, anon, authenticated;

-- Either rider blocked the other.
create or replace function riders_blocked(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from blocked_riders
    where (blocker_id = p_a and blocked_id = p_b) or (blocker_id = p_b and blocked_id = p_a)
  );
$$;
revoke execute on function riders_blocked(uuid, uuid) from public, anon, authenticated;

-- The farthest anyone can look.
create or replace function out_riding_max_miles() returns int language sql immutable as $$ select 50 $$;

-- Can p_viewer see p_rider in Out Riding right now? Both must be Out Riding, within 50 miles,
-- not blocked either way, and either know each other or both have chosen "everyone".
create or replace function out_riding_visible(p_viewer uuid, p_rider uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_viewer is not null and p_rider is not null and p_viewer <> p_rider and exists (
    select 1 from out_riding v join out_riding o on o.user_id = p_rider
    where v.user_id = p_viewer and out_riding_live(v) and out_riding_live(o)
      and miles_between(v.area_lat, v.area_lng, o.area_lat, o.area_lng) <= out_riding_max_miles()
      and not riders_blocked(p_viewer, p_rider)
      and ((o.audience = 'everyone' and v.audience = 'everyone') or riders_know_each_other(p_viewer, p_rider))
  );
$$;
revoke execute on function out_riding_visible(uuid, uuid) from public, anon, authenticated;

-- Switch Out Riding on, or refresh the area while it's on. p_hours is how long it stays on (1 to
-- 72); null keeps the current end when refreshing (or 4 hours when switching on). Returns the row.
create or replace function set_out_riding(
  p_lat double precision,
  p_lng double precision,
  p_audience text default null,
  p_spot text default null,
  p_hours int default null,
  p_keep_spot boolean default true
)
returns out_riding language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_row out_riding;
  v_old out_riding;
  v_spot text := nullif(btrim(coalesce(p_spot, '')), '');
  v_hours int;
begin
  if v_me is null then raise exception 'sign in first'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'out_riding: a location is needed';
  end if;
  if p_audience is not null and p_audience not in ('riders', 'everyone') then raise exception 'out_riding: bad audience'; end if;
  if p_hours is not null and p_hours not between 1 and 72 then raise exception 'out_riding: pick between 1 hour and 3 days'; end if;
  if v_spot is not null and char_length(v_spot) > 40 then raise exception 'out_riding: keep the spot under 40 characters'; end if;

  select * into v_old from out_riding where user_id = v_me for update;
  if found then
    -- At most 30 area updates an hour.
    if v_old.updates_window_at > now() - interval '1 hour' and v_old.updates_in_window >= 30 then
      raise exception 'out_riding_rate: too many updates, try again later' using errcode = 'P0001';
    end if;
  end if;

  v_hours := coalesce(p_hours, case when found and v_old.expires_at > now() then null else 4 end);
  insert into out_riding as o (user_id, area_lat, area_lng, audience, spot, started_at, refreshed_at, expires_at, updates_window_at, updates_in_window)
  values (
    v_me, out_riding_snap(p_lat), out_riding_snap(p_lng), coalesce(p_audience, 'riders'), v_spot, now(), now(),
    now() + make_interval(hours => coalesce(v_hours, 4)), now(), 1
  )
  on conflict (user_id) do update set
    area_lat = excluded.area_lat,
    area_lng = excluded.area_lng,
    audience = coalesce(p_audience, o.audience),
    spot = case when p_keep_spot and v_spot is null then o.spot else v_spot end,
    -- An expired status starting again is a new start.
    started_at = case when o.expires_at > now() then o.started_at else now() end,
    refreshed_at = now(),
    expires_at = case when v_hours is null then o.expires_at else now() + make_interval(hours => v_hours) end,
    updates_window_at = case when o.updates_window_at > now() - interval '1 hour' then o.updates_window_at else now() end,
    updates_in_window = case when o.updates_window_at > now() - interval '1 hour' then o.updates_in_window + 1 else 1 end
  returning * into v_row;
  return v_row;
end;
$$;

-- Switch it off: the row (and the area in it) is deleted.
create or replace function stop_out_riding()
returns void language sql security definer set search_path = public as $$
  delete from out_riding where user_id = auth.uid();
$$;

-- Who's Out Riding near me. p_scope 'riders' lists only riders I know; 'everyone' also lists
-- strangers (only if I chose "everyone" too). p_miles is capped at 50. Returns no coordinates:
-- miles is a whole number (0 means under a mile), rounded to 5 past 10 miles.
create or replace function nearby_riders(p_miles int default 10, p_scope text default 'riders')
returns table (
  user_id uuid, display_name text, photo_url text, miles int, spot text, known boolean, since timestamptz, riding_types text[]
)
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_mine out_riding;
  v_miles int := least(greatest(coalesce(p_miles, 10), 1), out_riding_max_miles());
  v_lat_box double precision;
  v_lng_box double precision;
begin
  if v_me is null then raise exception 'sign in first'; end if;
  -- Tidy up: statuses that ended a day ago are deleted, so old areas don't linger.
  delete from out_riding where expires_at < now() - interval '1 day' or refreshed_at < now() - interval '2 days';
  select * into v_mine from out_riding o where o.user_id = v_me;
  if not found or not out_riding_live(v_mine) then return; end if;
  v_lat_box := v_miles / 69.0 + 0.02;
  v_lng_box := v_miles / (69.0 * greatest(cos(radians(v_mine.area_lat)), 0.1)) + 0.02;

  return query
  select o.user_id,
         coalesce(nullif(btrim(p.display_name), ''), 'Rider'),
         p.photo_url,
         case
           when d.mi < 1 then 0
           when d.mi < 10 then round(d.mi)::int
           else (round(d.mi / 5) * 5)::int
         end,
         o.spot,
         k.known,
         o.started_at,
         p.riding_types
  from out_riding o
  join profiles p on p.id = o.user_id
  cross join lateral (select miles_between(v_mine.area_lat, v_mine.area_lng, o.area_lat, o.area_lng) as mi) d
  cross join lateral (select riders_know_each_other(v_me, o.user_id) as known) k
  where o.user_id <> v_me
    and o.area_lat between v_mine.area_lat - v_lat_box and v_mine.area_lat + v_lat_box
    and o.area_lng between v_mine.area_lng - v_lng_box and v_mine.area_lng + v_lng_box
    and out_riding_live(o)
    and d.mi <= v_miles
    and not riders_blocked(v_me, o.user_id)
    and (
      k.known
      or (coalesce(p_scope, 'riders') = 'everyone' and o.audience = 'everyone' and v_mine.audience = 'everyone')
    )
  order by d.mi, p.display_name
  limit 100;
end;
$$;

revoke execute on function set_out_riding(double precision, double precision, text, text, int, boolean), stop_out_riding(), nearby_riders(int, text)
  from public, anon;
grant execute on function set_out_riding(double precision, double precision, text, text, int, boolean), stop_out_riding(), nearby_riders(int, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Direct messages
-- ---------------------------------------------------------------------------
create table dm_threads (
  id uuid primary key default gen_random_uuid(),
  -- The two riders, lower id first, so each pair has one conversation.
  user_lo uuid not null references profiles (id) on delete cascade,
  user_hi uuid not null references profiles (id) on delete cascade,
  started_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  check (user_lo < user_hi),
  unique (user_lo, user_hi)
);
create index on dm_threads (user_hi);
create index on dm_threads (started_by, created_at desc);
alter table dm_threads enable row level security;

create or replace function in_dm_thread(p_thread uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from dm_threads where id = p_thread and (user_lo = p_user or user_hi = p_user));
$$;
revoke execute on function in_dm_thread(uuid, uuid) from public, anon, authenticated;
grant execute on function in_dm_thread(uuid, uuid) to authenticated;

create policy dm_threads_read on dm_threads for select to authenticated
  using (user_lo = auth.uid() or user_hi = auth.uid());
-- Created only through send_direct_message.
revoke all on dm_threads from anon, authenticated;
grant select on dm_threads to authenticated;

create table direct_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references dm_threads (id) on delete cascade,
  sender_id uuid not null references profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index on direct_messages (thread_id, created_at desc);
create index on direct_messages (sender_id, created_at desc);
alter table direct_messages enable row level security;

-- The two riders in the conversation read it, except messages from a rider the reader blocked.
create policy direct_messages_read on direct_messages for select to authenticated
  using (
    in_dm_thread(thread_id, auth.uid())
    and (sender_id = auth.uid() or not exists (
      select 1 from blocked_riders b where b.blocker_id = auth.uid() and b.blocked_id = sender_id
    ))
  );
-- Written only through send_direct_message; never edited.
revoke all on direct_messages from anon, authenticated;
grant select on direct_messages to authenticated;

-- Per rider, per conversation: last read, muted, and deleted from their list.
create table dm_reads (
  thread_id uuid not null references dm_threads (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  last_read_at timestamptz not null default '-infinity',
  muted boolean not null default false,
  -- Deleted from my list: messages before this are hidden from me. A new message brings the
  -- conversation back.
  cleared_at timestamptz,
  primary key (thread_id, user_id)
);
alter table dm_reads enable row level security;
create policy dm_reads_own on dm_reads for select to authenticated using (user_id = auth.uid());
revoke all on dm_reads from anon, authenticated;
grant select on dm_reads to authenticated;

-- Send a message to a rider, starting the conversation if there isn't one.
create or replace function send_direct_message(p_to uuid, p_body text, p_sent_at timestamptz default null)
returns direct_messages language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_thread dm_threads;
  v_msg direct_messages;
  v_lo uuid;
  v_hi uuid;
begin
  if v_me is null then raise exception 'sign in first'; end if;
  if p_to is null or p_to = v_me then raise exception 'dm_not_allowed: you can''t message this rider'; end if;
  if not exists (select 1 from profiles where id = p_to) then raise exception 'dm_not_allowed: rider not found'; end if;
  if length(v_body) = 0 then raise exception 'message is empty'; end if;
  if length(v_body) > 500 then raise exception 'message too long (500 characters max)'; end if;
  if exists (select 1 from blocked_riders where blocker_id = v_me and blocked_id = p_to) then
    raise exception 'dm_you_blocked: unblock this rider to message them';
  end if;

  -- Rate limits.
  if (select count(*) from direct_messages where sender_id = v_me and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'slow down: too many messages, try again in a minute';
  end if;
  if (select count(*) from direct_messages where sender_id = v_me and created_at > now() - interval '1 day') >= 200 then
    raise exception 'dm_daily_limit: too many messages today';
  end if;

  v_lo := least(v_me, p_to);
  v_hi := greatest(v_me, p_to);
  select * into v_thread from dm_threads where user_lo = v_lo and user_hi = v_hi;
  if not found then
    -- Starting a conversation: only with someone you can see Out Riding right now, or someone
    -- you know. If they blocked you, it fails the same way as for anyone you can't message, so
    -- you can't tell.
    if riders_blocked(v_me, p_to) or not (out_riding_visible(v_me, p_to) or riders_know_each_other(v_me, p_to)) then
      raise exception 'dm_not_allowed: you can message riders you see Out Riding nearby, or riders you''ve ridden with';
    end if;
    if (select count(*) from dm_threads where started_by = v_me and created_at > now() - interval '1 day') >= 10 then
      raise exception 'dm_daily_limit: too many new conversations today';
    end if;
    insert into dm_threads (user_lo, user_hi, started_by) values (v_lo, v_hi, v_me)
    on conflict (user_lo, user_hi) do update set last_message_at = dm_threads.last_message_at
    returning * into v_thread;
  end if;

  -- Until they reply, at most 3 messages.
  if not exists (select 1 from direct_messages where thread_id = v_thread.id and sender_id = p_to)
     and (select count(*) from direct_messages where thread_id = v_thread.id and sender_id = v_me) >= 3 then
    raise exception 'dm_wait_for_reply: wait for them to reply before sending more';
  end if;

  insert into direct_messages (thread_id, sender_id, body, sent_at)
  values (v_thread.id, v_me, v_body, least(coalesce(p_sent_at, now()), now()))
  returning * into v_msg;
  update dm_threads set last_message_at = v_msg.created_at where id = v_thread.id;
  -- Sending means I've read everything before it.
  insert into dm_reads (thread_id, user_id, last_read_at) values (v_thread.id, v_me, v_msg.created_at)
  on conflict (thread_id, user_id) do update set last_read_at = greatest(dm_reads.last_read_at, excluded.last_read_at);
  return v_msg;
end;
$$;

-- Opened the conversation: everything up to now is read.
create or replace function mark_dm_read(p_thread uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not in_dm_thread(p_thread, auth.uid()) then raise exception 'conversation not found'; end if;
  insert into dm_reads (thread_id, user_id, last_read_at) values (p_thread, auth.uid(), now())
  on conflict (thread_id, user_id) do update set last_read_at = now();
end;
$$;

create or replace function set_dm_muted(p_thread uuid, p_muted boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not in_dm_thread(p_thread, auth.uid()) then raise exception 'conversation not found'; end if;
  insert into dm_reads (thread_id, user_id, muted) values (p_thread, auth.uid(), coalesce(p_muted, false))
  on conflict (thread_id, user_id) do update set muted = coalesce(p_muted, false);
end;
$$;

-- Delete the conversation from my list (the other rider keeps their copy).
create or replace function clear_dm_thread(p_thread uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not in_dm_thread(p_thread, auth.uid()) then raise exception 'conversation not found'; end if;
  insert into dm_reads (thread_id, user_id, last_read_at, cleared_at) values (p_thread, auth.uid(), now(), now())
  on conflict (thread_id, user_id) do update set cleared_at = now(), last_read_at = now();
end;
$$;

-- My conversations, newest first: the other rider, the newest message I can see, unread count,
-- muted. Leaves out conversations I deleted with nothing new since, and riders I blocked.
create or replace function my_dm_threads()
returns table (
  thread_id uuid, other_id uuid, other_name text, last_body text, last_sender_id uuid, last_at timestamptz,
  unread int, muted boolean, cleared_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select t.id, x.other, coalesce(nullif(btrim(p.display_name), ''), 'Rider'),
         l.body, l.sender_id, l.created_at,
         (select count(*)::int from direct_messages m
          where m.thread_id = t.id and m.sender_id <> auth.uid()
            and m.created_at > greatest(coalesce(r.last_read_at, '-infinity'), coalesce(r.cleared_at, '-infinity'))),
         coalesce(r.muted, false),
         r.cleared_at
  from dm_threads t
  cross join lateral (select case when t.user_lo = auth.uid() then t.user_hi else t.user_lo end as other) x
  left join profiles p on p.id = x.other
  left join dm_reads r on r.thread_id = t.id and r.user_id = auth.uid()
  left join lateral (
    select m.body, m.sender_id, m.created_at from direct_messages m
    where m.thread_id = t.id and m.created_at > coalesce(r.cleared_at, '-infinity')
    order by m.created_at desc limit 1
  ) l on true
  where auth.uid() is not null
    and (t.user_lo = auth.uid() or t.user_hi = auth.uid())
    and l.created_at is not null
    and not exists (select 1 from blocked_riders b where b.blocker_id = auth.uid() and b.blocked_id = x.other)
  order by l.created_at desc;
$$;

-- Find (not create) my conversation with a rider, for opening it from their name.
create or replace function dm_thread_with(p_other uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from dm_threads
  where auth.uid() is not null and user_lo = least(auth.uid(), p_other) and user_hi = greatest(auth.uid(), p_other);
$$;

revoke execute on function send_direct_message(uuid, text, timestamptz), mark_dm_read(uuid), set_dm_muted(uuid, boolean),
  clear_dm_thread(uuid), my_dm_threads(), dm_thread_with(uuid) from public, anon;
grant execute on function send_direct_message(uuid, text, timestamptz), mark_dm_read(uuid), set_dm_muted(uuid, boolean),
  clear_dm_thread(uuid), my_dm_threads(), dm_thread_with(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
alter table notification_settings add column direct_messages boolean not null default true;

-- The Direct Messages switch, then quiet hours (wants_social_push with a category it doesn't
-- switch on or off only checks quiet hours).
create or replace function wants_dm_push(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select direct_messages from notification_settings where user_id = p_user), true)
     and wants_social_push(p_user, 'direct_messages');
$$;
revoke execute on function wants_dm_push(uuid) from public, anon, authenticated;

-- What to send, to whom (service role only, like push_batch):
--   {"type":"direct_message","id":<direct_messages.id>}
-- The other rider, unless they blocked the sender, muted the conversation or switched Direct
-- Messages off. With previews off the text isn't shown.
create or replace function push_batch_dm(p_event jsonb)
returns table (user_id uuid, token text, platform text, title text, body text, thread_id text, data jsonb)
language plpgsql stable security invoker set search_path = public as $$
declare
  msg direct_messages;
  v_thread dm_threads;
  v_to uuid;
  v_who text;
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'not allowed';
  end if;
  if p_event ->> 'type' is distinct from 'direct_message' then return; end if;
  select * into msg from direct_messages where id = (p_event ->> 'id')::uuid;
  if not found then return; end if;
  select * into v_thread from dm_threads where id = msg.thread_id;
  v_to := case when v_thread.user_lo = msg.sender_id then v_thread.user_hi else v_thread.user_lo end;
  if exists (select 1 from blocked_riders b where b.blocker_id = v_to and b.blocked_id = msg.sender_id) then return; end if;
  select coalesce(nullif(btrim(display_name), ''), 'A rider') into v_who from profiles where id = msg.sender_id;

  return query
  select t.user_id, t.token, t.platform,
         coalesce(v_who, 'A rider'),
         case when s.previews is false then 'Sent you a message' else msg.body end,
         'dm:' || v_thread.id::text,
         jsonb_build_object('type', 'direct_message', 'threadId', v_thread.id, 'userId', msg.sender_id)
  from push_tokens t
  left join notification_settings s on s.user_id = t.user_id
  left join dm_reads r on r.thread_id = v_thread.id and r.user_id = t.user_id
  where t.user_id = v_to
    and not coalesce(r.muted, false)
    and wants_dm_push(t.user_id);
end;
$$;
revoke execute on function push_batch_dm(jsonb) from public, anon, authenticated;

create or replace function direct_message_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform queue_push(jsonb_build_object('type', 'direct_message', 'id', new.id));
  return null;
end;
$$;
create trigger direct_messages_notify after insert on direct_messages
  for each row execute function direct_message_notify();

-- Live updates in the conversation.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table direct_messages;
  end if;
end $$;
