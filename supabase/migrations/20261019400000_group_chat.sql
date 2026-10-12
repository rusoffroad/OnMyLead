-- Group Chat: a group text inside each riding group.
--
-- Everyone in a riding group (its owner and members) can read and post. A message can be about
-- one of the sender's rides (an upcoming ride, one happening now, or one that's over), so the
-- group can talk about it with the ride linked. Nobody else can read the messages, see who sent
-- them, or post, and that is enforced here, not in the app.
--
-- The sender can clear a message for everyone; the group's owner can clear any message in it.
-- Each rider can mute a group's chat; unread counts come from when they last opened it.
--
-- Push: a new category, group_chat, with its own switch in notification settings. Each message
-- goes through queue_push as {"type":"group_message","id":...}; push_batch_group builds it and
-- the notify-ride-message Edge Function routes that type there.
--
-- Additive only: two new tables, functions and triggers, one new notification setting column,
-- and a new version of wants_social_push that also knows about group_chat.

-- ---------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------
create table group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references riding_groups (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  body text not null check (length(body) between 1 and 2000),
  -- The ride this message is about, if any. A deleted ride just drops the link.
  ride_id uuid references rides (id) on delete set null,
  -- When it was tapped (earlier than created_at for a message sent once signal came back).
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index on group_messages (group_id, created_at desc);
create index on group_messages (user_id, created_at desc);
alter table group_messages enable row level security;

create policy group_messages_read on group_messages for select to authenticated
  using (is_group_member(group_id, auth.uid()));
-- Post as yourself, into a group you're in, about a ride you're on (or no ride).
create policy group_messages_write on group_messages for insert to authenticated
  with check (
    user_id = auth.uid()
    and is_group_member(group_id, auth.uid())
    and (ride_id is null or is_ride_member(ride_id, auth.uid(), '{joined}'))
  );
-- No update or delete rights: clearing goes through clear_group_message.
revoke all on group_messages from anon, authenticated;
grant select, insert on group_messages to authenticated;

-- Same light limits as ride chat: trimmed, at most 500 characters, at most 10 messages a minute
-- per rider, server time for created_at, and sent_at never in the future.
create or replace function group_message_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_recent int;
begin
  new.body := btrim(new.body);
  if length(new.body) = 0 then raise exception 'message is empty'; end if;
  if length(new.body) > 500 then raise exception 'message too long (500 characters max)'; end if;
  new.created_at := now();
  new.sent_at := least(coalesce(new.sent_at, now()), now());
  select count(*) into v_recent from group_messages
  where user_id = new.user_id and created_at > now() - interval '1 minute';
  if v_recent >= 10 then raise exception 'slow down: too many messages, try again in a minute'; end if;
  return new;
end;
$$;
create trigger group_messages_guard before insert on group_messages
  for each row execute function group_message_guard();

-- Clear a message for everyone: your own, or any message in a group you run.
create or replace function clear_group_message(p_message uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  delete from group_messages m
  where m.id = p_message
    and (m.user_id = auth.uid() or is_group_owner(m.group_id, auth.uid()));
  if not found then raise exception 'only the sender or the group''s owner can clear this message'; end if;
end;
$$;
revoke execute on function clear_group_message(uuid) from public, anon;
grant execute on function clear_group_message(uuid) to authenticated;

-- The rides a group's chat talks about: name, time, status and the code that opens the ride
-- page. Only for people in the group, and only rides someone in it linked while on the ride.
create or replace function group_chat_rides(p_group uuid)
returns table (id uuid, name text, meet_at timestamptz, status ride_status, invite_code text)
language sql stable security definer set search_path = public as $$
  select r.id, r.name, r.meet_at, r.status, r.invite_code
  from rides r
  where is_group_member(p_group, auth.uid())
    and r.id in (select m.ride_id from group_messages m where m.group_id = p_group and m.ride_id is not null);
$$;
revoke execute on function group_chat_rides(uuid) from public, anon;
grant execute on function group_chat_rides(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Read markers and mute, one row per rider per group
-- ---------------------------------------------------------------------------
create table group_chat_reads (
  group_id uuid not null references riding_groups (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  muted boolean not null default false,
  primary key (group_id, user_id)
);
alter table group_chat_reads enable row level security;
create policy group_chat_reads_own on group_chat_reads for select to authenticated
  using (user_id = auth.uid());
-- Changed only through mark_group_chat_read and set_group_chat_muted.
revoke all on group_chat_reads from anon, authenticated;
grant select on group_chat_reads to authenticated;

-- Opened the chat: everything up to now is read.
create or replace function mark_group_chat_read(p_group uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not is_group_member(p_group, auth.uid()) then raise exception 'group not found'; end if;
  insert into group_chat_reads (group_id, user_id, last_read_at) values (p_group, auth.uid(), now())
  on conflict (group_id, user_id) do update set last_read_at = now();
end;
$$;

create or replace function set_group_chat_muted(p_group uuid, p_muted boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not is_group_member(p_group, auth.uid()) then raise exception 'group not found'; end if;
  insert into group_chat_reads (group_id, user_id, muted) values (p_group, auth.uid(), p_muted)
  on conflict (group_id, user_id) do update set muted = p_muted;
end;
$$;

-- For the groups list: each of my groups' newest message, how many I haven't read, and whether
-- I muted it. Groups with no messages yet have nulls and 0.
create or replace function my_group_chats()
returns table (group_id uuid, last_body text, last_user_id uuid, last_at timestamptz, unread int, muted boolean)
language sql stable security definer set search_path = public as $$
  select g.id,
         l.body, l.user_id, l.created_at,
         (select count(*)::int from group_messages m
          where m.group_id = g.id and m.user_id <> auth.uid()
            and m.created_at > coalesce(r.last_read_at, '-infinity')),
         coalesce(r.muted, false)
  from riding_groups g
  left join group_chat_reads r on r.group_id = g.id and r.user_id = auth.uid()
  left join lateral (
    select m.body, m.user_id, m.created_at from group_messages m
    where m.group_id = g.id order by m.created_at desc limit 1
  ) l on true
  where auth.uid() is not null and is_group_member(g.id, auth.uid());
$$;

revoke execute on function mark_group_chat_read(uuid), set_group_chat_muted(uuid, boolean), my_group_chats() from public, anon;
grant execute on function mark_group_chat_read(uuid), set_group_chat_muted(uuid, boolean), my_group_chats() to authenticated;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
alter table notification_settings add column group_chat boolean not null default true;

-- Same as before, plus the group_chat switch.
create or replace function wants_social_push(p_user uuid, p_category text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  s notification_settings;
  v_now timestamp;
begin
  select * into s from notification_settings where user_id = p_user;
  if not found then return true; end if;
  if (p_category = 'ride_invites' and not s.ride_invites)
     or (p_category = 'followed_leaders' and not s.followed_leaders)
     or (p_category = 'group_chat' and not s.group_chat) then
    return false;
  end if;
  if s.quiet_hours then
    v_now := now() at time zone coalesce(s.time_zone, 'UTC');
    if in_quiet_window(s.quiet_start, s.quiet_end, (extract(hour from v_now) * 60 + extract(minute from v_now))::int) then
      return false;
    end if;
  end if;
  return true;
end;
$$;
revoke execute on function wants_social_push(uuid, text) from public, anon, authenticated;

-- What to send, to whom (service role only, like push_batch):
--   {"type":"group_message","id":<group_messages.id>}
-- Everyone in the group except the sender, unless they muted the group or switched Group Chat
-- off. With previews off the text isn't shown.
create or replace function push_batch_group(p_event jsonb)
returns table (user_id uuid, token text, platform text, title text, body text, thread_id text, data jsonb)
language plpgsql stable security invoker set search_path = public as $$
declare
  msg group_messages;
  v_group riding_groups;
  v_who text;
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'not allowed';
  end if;
  if p_event ->> 'type' is distinct from 'group_message' then return; end if;
  select * into msg from group_messages where id = (p_event ->> 'id')::uuid;
  if not found then return; end if;
  select * into v_group from riding_groups where id = msg.group_id;
  select coalesce(nullif(btrim(display_name), ''), 'A rider') into v_who from profiles where id = msg.user_id;

  return query
  select t.user_id, t.token, t.platform,
         coalesce(v_who, 'A rider') || ' · ' || v_group.name,
         case when s.previews is false then 'New message in your group chat' else msg.body end,
         'group:' || v_group.id::text,
         jsonb_build_object('type', 'group_message', 'groupId', v_group.id)
  from push_tokens t
  left join notification_settings s on s.user_id = t.user_id
  left join group_chat_reads r on r.group_id = v_group.id and r.user_id = t.user_id
  where t.user_id <> msg.user_id
    and is_group_member(v_group.id, t.user_id)
    and not coalesce(r.muted, false)
    and wants_social_push(t.user_id, 'group_chat');
end;
$$;
revoke execute on function push_batch_group(jsonb) from public, anon, authenticated;

create or replace function group_message_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform queue_push(jsonb_build_object('type', 'group_message', 'id', new.id));
  return null;
end;
$$;
create trigger group_messages_notify after insert on group_messages
  for each row execute function group_message_notify();

-- Live updates in the chat.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table group_messages;
  end if;
end $$;
