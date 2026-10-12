-- Saved riding groups and Follow This Leader.
--
-- Riding groups: a rider saves the people they ride with as a named group (their crew), then
-- invites the whole group to a ride in one tap. People are added from riders they have already
-- been on a ride with, or join through the group's invite link (for friends not in the app yet).
-- Inviting a group uses the 'invited' member status that already exists: an invited rider can
-- see the ride, joins without waiting for approval, and can say no thanks.
--
-- Follow This Leader: a rider follows someone who organizes or leads rides and hears when that
-- leader posts a new public ride. Private rides are never announced to followers.
--
-- Privacy: a group, its name and who is in it are visible only to its owner and members; a follow
-- only to the follower and the leader. Nothing here touches locations.
--
-- Push: two new categories with their own switches in notification settings (ride_invites,
-- followed_leaders). The events go through queue_push like the rest; push_batch_social builds
-- them, and the notify-ride-message Edge Function sends {"type":"invite"} and
-- {"type":"leader_ride"} events there.
--
-- Additive only: new tables, functions and triggers, and two new notification setting columns.

-- ---------------------------------------------------------------------------
-- Groups
-- ---------------------------------------------------------------------------
create table riding_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  -- The group's invite link (onmylead.com/g/<code>), for friends not in the app yet.
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 10)),
  created_at timestamptz not null default now()
);
create index on riding_groups (owner_id);

-- The owner is not listed here; they are always in their own group.
create table riding_group_members (
  group_id uuid not null references riding_groups (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  added_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index on riding_group_members (user_id);

alter table riding_groups enable row level security;
alter table riding_group_members enable row level security;

create or replace function is_group_owner(p_group uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from riding_groups where id = p_group and owner_id = p_user);
$$;

create or replace function is_group_member(p_group uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select is_group_owner(p_group, p_user)
      or exists (select 1 from riding_group_members where group_id = p_group and user_id = p_user);
$$;

create policy riding_groups_read on riding_groups for select to authenticated
  using (is_group_member(id, auth.uid()));
create policy riding_groups_insert on riding_groups for insert to authenticated
  with check (owner_id = auth.uid());
create policy riding_groups_update on riding_groups for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy riding_groups_delete on riding_groups for delete to authenticated
  using (owner_id = auth.uid());

-- Members see each other. Adding goes through add_group_members / join_group; a member can
-- leave and the owner can remove anyone.
create policy riding_group_members_read on riding_group_members for select to authenticated
  using (is_group_member(group_id, auth.uid()));
create policy riding_group_members_delete on riding_group_members for delete to authenticated
  using (user_id = auth.uid() or is_group_owner(group_id, auth.uid()));

grant select, insert, update, delete on riding_groups to authenticated;
grant select, delete on riding_group_members to authenticated;

-- Have these two riders been on a ride together?
create or replace function ridden_together(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from ride_members a
    join ride_members b on b.ride_id = a.ride_id
    where a.user_id = p_a and b.user_id = p_b and a.status = 'joined' and b.status = 'joined'
  );
$$;
revoke execute on function ridden_together(uuid, uuid) from public, anon, authenticated;

-- The owner adds riders they have ridden with. Returns how many were added.
create or replace function add_group_members(p_group uuid, p_users uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_added int;
begin
  if v_me is null or not is_group_owner(p_group, v_me) then
    raise exception 'only the group''s owner can add riders';
  end if;
  if exists (
    select 1 from unnest(p_users) u
    where u <> v_me and not ridden_together(v_me, u)
      and not exists (select 1 from riding_group_members where group_id = p_group and user_id = u)
  ) then
    raise exception 'you can add riders you have been on a ride with, or send them the group link';
  end if;
  insert into riding_group_members (group_id, user_id, added_by)
  select p_group, u, v_me from unnest(p_users) u where u <> v_me
  on conflict do nothing;
  get diagnostics v_added = row_count;
  if (select count(*) from riding_group_members where group_id = p_group) > 100 then
    raise exception 'a group holds up to 100 riders';
  end if;
  return v_added;
end;
$$;

-- Join through the group's invite link.
create or replace function join_group(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_group riding_groups;
begin
  if v_me is null then raise exception 'sign in to join the group'; end if;
  select * into v_group from riding_groups where invite_code = upper(btrim(p_code));
  if not found then raise exception 'group not found'; end if;
  if v_group.owner_id <> v_me then
    insert into riding_group_members (group_id, user_id, added_by)
    values (v_group.id, v_me, v_me)
    on conflict do nothing;
  end if;
  return v_group.id;
end;
$$;

-- What the invite link shows before joining: the name, who runs it and how many ride in it.
-- Not who they are; that needs joining.
create or replace function group_preview(p_code text)
returns table (id uuid, name text, owner_name text, riders int, is_member boolean)
language sql stable security definer set search_path = public as $$
  select g.id, g.name,
         coalesce(nullif(btrim(p.display_name), ''), 'A rider'),
         1 + (select count(*)::int from riding_group_members m where m.group_id = g.id),
         auth.uid() is not null and is_group_member(g.id, auth.uid())
  from riding_groups g
  left join profiles p on p.id = g.owner_id
  where g.invite_code = upper(btrim(p_code));
$$;

-- A fresh invite link; the old one stops working.
create or replace function reset_group_link(p_group uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_code text := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 10));
begin
  if not is_group_owner(p_group, auth.uid()) then raise exception 'only the group''s owner can do that'; end if;
  update riding_groups set invite_code = v_code where id = p_group;
  return v_code;
end;
$$;

grant execute on function add_group_members(uuid, uuid[]), join_group(text), reset_group_link(uuid) to authenticated;
grant execute on function group_preview(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Inviting a group to a ride
-- ---------------------------------------------------------------------------
-- An organizer or co-organizer of the ride invites everyone in a group they belong to. Riders
-- already on the ride, waiting, or who said no thanks to it are left alone. Returns how many
-- were invited.
create or replace function invite_group_to_ride(p_ride uuid, p_group uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_status ride_status;
  v_count int;
begin
  if v_me is null or not is_ride_manager(p_ride, v_me) then
    raise exception 'only the ride''s organizers can invite a group';
  end if;
  if not is_group_member(p_group, v_me) then raise exception 'group not found'; end if;
  select status into v_status from rides where id = p_ride;
  if v_status not in ('scheduled', 'live') then raise exception 'ride is %', v_status; end if;

  insert into ride_members (ride_id, user_id, status)
  select p_ride, u.user_id, 'invited'
  from (
    select owner_id as user_id from riding_groups where id = p_group
    union
    select user_id from riding_group_members where group_id = p_group
  ) u
  where u.user_id <> v_me
  on conflict (ride_id, user_id) do update
    set status = 'invited', left_at = null, created_at = now()
    where ride_members.status = 'cancelled';
  get diagnostics v_count = row_count;

  insert into events (user_id, name, props)
  values (v_me, 'ride_group_invited', jsonb_build_object('ride_id', p_ride, 'invited', v_count));
  return v_count;
end;
$$;

-- An invited rider says no thanks. They can still join later with the link.
create or replace function decline_ride_invite(p_ride uuid)
returns void language sql security definer set search_path = public as $$
  update ride_members set status = 'declined'
  where ride_id = p_ride and user_id = auth.uid() and status = 'invited';
$$;

grant execute on function invite_group_to_ride(uuid, uuid), decline_ride_invite(uuid) to authenticated;

-- An invitation is not a yes: only the invited rider (through join_ride or decline_ride_invite)
-- can move it on. Organizers can still approve requests and manage joined riders as before.
create or replace function guard_ride_invite()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.status = 'invited' and new.status is distinct from old.status
     and current_user in ('authenticated', 'anon') then
    raise exception 'only the invited rider can accept or decline an invitation';
  end if;
  return new;
end;
$$;
create trigger ride_members_guard_invite before update of status on ride_members
  for each row execute function guard_ride_invite();

-- ---------------------------------------------------------------------------
-- Follow This Leader
-- ---------------------------------------------------------------------------
create table leader_follows (
  follower_id uuid not null references profiles (id) on delete cascade,
  leader_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, leader_id),
  check (follower_id <> leader_id)
);
create index on leader_follows (leader_id);
alter table leader_follows enable row level security;

-- The follower sees who they follow; the leader sees who follows them. Either can end it.
create policy leader_follows_read on leader_follows for select to authenticated
  using (follower_id = auth.uid() or leader_id = auth.uid());
create policy leader_follows_delete on leader_follows for delete to authenticated
  using (follower_id = auth.uid() or leader_id = auth.uid());
grant select, delete on leader_follows to authenticated;

-- Follow someone who organizes or leads a ride you can see.
create or replace function follow_leader(p_leader uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'sign in to follow a leader'; end if;
  if p_leader = v_me then raise exception 'you can''t follow yourself'; end if;
  if not exists (
    select 1 from ride_members m join rides r on r.id = m.ride_id
    where m.user_id = p_leader and m.status = 'joined' and m.role in ('organizer', 'co_organizer', 'leader')
      and (r.visibility in ('public', 'unlisted') or is_ride_member(r.id, v_me, '{joined,pending,waitlisted,invited}'))
  ) then
    raise exception 'you can follow riders who lead a ride you can see';
  end if;
  insert into leader_follows (follower_id, leader_id) values (v_me, p_leader) on conflict do nothing;
end;
$$;
grant execute on function follow_leader(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
alter table notification_settings
  add column ride_invites boolean not null default true,
  add column followed_leaders boolean not null default true;

-- Same rules as wants_push, for the two categories added here.
create or replace function wants_social_push(p_user uuid, p_category text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  s notification_settings;
  v_now timestamp;
begin
  select * into s from notification_settings where user_id = p_user;
  if not found then return true; end if;
  if (p_category = 'ride_invites' and not s.ride_invites)
     or (p_category = 'followed_leaders' and not s.followed_leaders) then
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
--   {"type":"invite","ride":<uuid>,"user":<uuid>,"actor":<uuid>}   you're invited to a ride
--   {"type":"leader_ride","id":<rides.id>}                          a leader you follow posted a ride
create or replace function push_batch_social(p_event jsonb)
returns table (user_id uuid, token text, platform text, title text, body text, thread_id text, data jsonb)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_type text := p_event ->> 'type';
  v_ride rides;
  v_who text;
  v_category text;
  v_title text;
  v_lead text;
  v_tail text;
  v_to uuid[];
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'not allowed';
  end if;

  if v_type = 'invite' then
    select * into v_ride from rides where id = (p_event ->> 'ride')::uuid;
    if not found or v_ride.status not in ('scheduled', 'live') then return; end if;
    -- Still invited (not already joined or declined by the time this runs).
    if not exists (
      select 1 from ride_members m
      where m.ride_id = v_ride.id and m.user_id = (p_event ->> 'user')::uuid and m.status = 'invited'
    ) then
      return;
    end if;
    select coalesce(nullif(btrim(display_name), ''), 'A rider') into v_who
    from profiles where id = coalesce(nullif(p_event ->> 'actor', '')::uuid, v_ride.organizer_id);
    v_category := 'ride_invites';
    v_title := coalesce(v_who, 'A rider') || ' invited you to ' || v_ride.name;
    v_lead := 'Meeting ';
    v_tail := '. Tap to see the ride and join.';
    v_to := array[(p_event ->> 'user')::uuid];

  elsif v_type = 'leader_ride' then
    select * into v_ride from rides where id = (p_event ->> 'id')::uuid;
    if not found or v_ride.visibility <> 'public' or v_ride.status <> 'scheduled' then return; end if;
    select coalesce(nullif(btrim(display_name), ''), 'A leader you follow') into v_who
    from profiles where id = v_ride.organizer_id;
    v_category := 'followed_leaders';
    v_title := 'New ride from ' || coalesce(v_who, 'a leader you follow');
    v_lead := v_ride.name || ', ';
    v_tail := '. Tap to see it and join.';
    select array_agg(f.follower_id) into v_to from leader_follows f where f.leader_id = v_ride.organizer_id;

  else
    return;
  end if;

  return query
  select t.user_id, t.token, t.platform, v_title,
         case
           when s.time_zone is not null
             then v_lead || to_char(v_ride.meet_at at time zone s.time_zone, 'FMDay, FMMonth FMDD "at" FMHH12:MI AM') || v_tail
           when v_type = 'invite' then 'Tap to see the ride and join.'
           else v_ride.name || v_tail
         end,
         v_ride.id::text,
         jsonb_build_object('type', v_type, 'rideId', v_ride.id, 'inviteCode', v_ride.invite_code)
  from push_tokens t
  left join notification_settings s on s.user_id = t.user_id
  where t.user_id = any (coalesce(v_to, '{}'))
    and wants_social_push(t.user_id, v_category);
end;
$$;
revoke execute on function push_batch_social(jsonb) from public, anon, authenticated;

create or replace function ride_invite_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'invited' and (tg_op = 'INSERT' or old.status is distinct from 'invited') then
    perform queue_push(jsonb_build_object('type', 'invite', 'ride', new.ride_id, 'user', new.user_id, 'actor', auth.uid()));
  end if;
  return null;
end;
$$;
create trigger ride_members_invite_notify after insert or update of status on ride_members
  for each row execute function ride_invite_notify();

create or replace function leader_ride_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.visibility = 'public' then
    perform queue_push(jsonb_build_object('type', 'leader_ride', 'id', new.id));
  end if;
  return null;
end;
$$;
create trigger rides_leader_notify after insert on rides
  for each row execute function leader_ride_notify();
