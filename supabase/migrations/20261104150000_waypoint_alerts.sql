-- Tap-and-hold waypoints (2.1). Chris 2026-11-04: "when in ride mode or map mode, if you tap and hold
-- on the map, pop up asking to create a waypoint in that spot ... If its on a group ride, share it
-- with the rest of the group ... and ding their phone saying the leader added a new waypoint".
--
--   1. New shared waypoint push. When the leader (or an organizer) shares a waypoint or a planned
--      stop while the ride is live, everyone else joined to the ride gets a push and an inbox row:
--      "Liam added a new waypoint: Fuel Stop". It goes out once per waypoint: when it is added as
--      shared, or when a Just Me waypoint is switched to Everyone on the Ride. Waypoints set up
--      before the ride starts (route planning) send nothing; they are on the map when riders open
--      Ride Mode. Riders who turned off Announcements in Notification Settings, or are in quiet
--      hours, don't get the push (the same setting as the organizer's announcements). The event
--      is {"type":"waypoint","id":<waypoint>}; push_batch_waypoint() writes the text and
--      notify-ride-message delivers it. Until that function is redeployed it routes the event to
--      push_batch, which ignores it: nothing breaks, only the push waits.
--   2. record_notifications, as in 20261102900000_social_hub.sql, plus the waypoint event.
--   3. rider_map_waypoints: a private copy of the waypoints a rider drops in Map Mode (no ride),
--      so they show on each device they sign in on, exactly like rider_trail_backups (migration
--      20261103300000_account_sync.sql): one row per waypoint, a tombstone (data null) when it is
--      deleted, the newer change wins. Only the rider reads or writes their rows.
--
-- Additive only: new functions, a new trigger and a new table. ride_waypoints itself doesn't change,
-- so older app builds keep working. Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. The push.
-- ---------------------------------------------------------------------------
-- {"type":"waypoint","id":<ride_waypoints.id>}: to every other rider joined to the ride.
create or replace function push_batch_waypoint(p_event jsonb)
returns table (user_id uuid, token text, platform text, title text, body text, thread_id text, data jsonb)
language plpgsql stable security invoker set search_path = public as $$
#variable_conflict use_column
declare
  w ride_waypoints;
  v_ride rides;
  v_who text;
  v_title text;
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'not allowed';
  end if;
  if p_event ->> 'type' is distinct from 'waypoint' then return; end if;
  select * into w from ride_waypoints x where x.id = (p_event ->> 'id')::uuid;
  -- Removed or made private again before the push went out: nothing to say.
  if not found or not w.shared then return; end if;
  select * into v_ride from rides r where r.id = w.ride_id;
  if not found then return; end if;
  select coalesce(nullif(btrim(p.display_name), ''), 'The leader') into v_who from profiles p where p.id = w.user_id;
  v_who := coalesce(v_who, 'The leader');
  v_title := v_who || case when w.planned_stop then ' added a planned stop: ' else ' added a new waypoint: ' end || w.name;
  return query
  select t.user_id, t.token, t.platform, v_title,
         v_ride.name || '. Tap to see it on the map.',
         v_ride.id::text,
         jsonb_build_object('type', 'waypoint', 'rideId', v_ride.id, 'inviteCode', v_ride.invite_code,
                            'waypointId', w.id, 'collapseId', 'waypoint:' || w.id)
  from ride_members m
  join push_tokens t on t.user_id = m.user_id
  where m.ride_id = w.ride_id and m.status = 'joined' and m.left_at is null
    and m.user_id <> w.user_id
    and wants_push(t.user_id, 'announcements');
end;
$$;
revoke execute on function push_batch_waypoint(jsonb) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function push_batch_waypoint(jsonb) to service_role;
  end if;
end $$;

-- Queue it when a shared waypoint appears on a live ride.
create or replace function ride_waypoints_alert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.shared
     and (tg_op = 'INSERT' or not old.shared)
     and exists (select 1 from rides r where r.id = new.ride_id and r.status = 'live') then
    perform queue_push(jsonb_build_object('type', 'waypoint', 'id', new.id));
  end if;
  return null;
exception when others then
  -- Never stop the save because of the push.
  raise warning 'ride_waypoints_alert: %', sqlerrm;
  return null;
end;
$$;
revoke execute on function ride_waypoints_alert() from public, anon, authenticated;

drop trigger if exists ride_waypoints_alert on ride_waypoints;
create trigger ride_waypoints_alert after insert or update of shared on ride_waypoints
  for each row execute function ride_waypoints_alert();

-- ---------------------------------------------------------------------------
-- 2. The inbox: record_notifications as in 20261102900000_social_hub.sql, plus 'waypoint'
--    (push_batch_waypoint). Nothing else changes.
-- ---------------------------------------------------------------------------
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
    when v_type = 'waypoint' then 'push_batch_waypoint'
    else 'push_batch'
  end;
  if to_regprocedure(v_fn || '(jsonb)') is null then return; end if;
  -- Chat folds into one row per conversation; riders who blocked the sender get nothing
  -- (status taps, quick replies, announcements and shared waypoints are never filtered, like the push).
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
-- 3. Map Mode waypoints, backed up privately (app/src/lib/my-waypoints.ts).
-- ---------------------------------------------------------------------------
create table if not exists rider_map_waypoints (
  user_id uuid not null references auth.users (id) on delete cascade,
  waypoint_id text not null check (length(waypoint_id) between 1 and 64),
  data jsonb check (data is null or (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 4000)),
  deleted boolean not null default false,
  updated_at timestamptz not null,
  synced_at timestamptz not null default now(),
  primary key (user_id, waypoint_id),
  check (deleted = (data is null))
);

alter table rider_map_waypoints enable row level security;
drop policy if exists "rider reads own map waypoints" on rider_map_waypoints;
create policy "rider reads own map waypoints" on rider_map_waypoints for select to authenticated using (user_id = auth.uid());
-- Writes only through backup_map_waypoint().
revoke all on rider_map_waypoints from anon, authenticated;
grant select on rider_map_waypoints to authenticated;

-- Save one waypoint (p_data null: it was deleted). Only a newer change replaces the copy there.
-- Returns whether it was kept. A time more than a minute ahead of the server is capped.
create or replace function backup_map_waypoint(p_waypoint_id text, p_data jsonb, p_updated_at timestamptz)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  at timestamptz := least(p_updated_at, clock_timestamp() + interval '1 minute');
  n int;
begin
  if me is null then
    raise exception 'Sign in to back up your waypoints.' using errcode = '42501';
  end if;
  if p_waypoint_id is null or length(p_waypoint_id) not between 1 and 64 or at is null then
    raise exception 'Bad waypoint.' using errcode = '22023';
  end if;
  if p_data is not null and (jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 4000) then
    raise exception 'This waypoint is too big to back up.' using errcode = '22023';
  end if;
  if (select count(*) from rider_map_waypoints where user_id = me and not deleted) >= 2000
     and not exists (select 1 from rider_map_waypoints where user_id = me and waypoint_id = p_waypoint_id) then
    raise exception 'Waypoint backup is full (2,000 waypoints).' using errcode = '54000';
  end if;

  insert into rider_map_waypoints as b (user_id, waypoint_id, data, deleted, updated_at)
  values (me, p_waypoint_id, p_data, p_data is null, at)
  on conflict (user_id, waypoint_id) do update
    set data = excluded.data, deleted = excluded.deleted, updated_at = excluded.updated_at, synced_at = now()
    where b.updated_at < excluded.updated_at;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;
revoke all on function backup_map_waypoint(text, jsonb, timestamptz) from public, anon;
grant execute on function backup_map_waypoint(text, jsonb, timestamptz) to authenticated;
