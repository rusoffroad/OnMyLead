-- Invite a whole riding group to an event (3.0), the same way "Invite All" works on a ride.
--
-- What riders get:
--   * An event's hosts see "Invite a Group" on the event page. One tap on Invite All sends every
--     rider in that saved group a notification ("Eve invited you to Moab Spring Rally"), which
--     also lands in their Notifications inbox and opens the event page.
--   * An invite is not an RSVP: riders still pick Going or Interested themselves. Riders who
--     already said Going or Interested, the event's hosts, riders already invited, and riders who
--     blocked the host (or were blocked by them) are skipped.
--
-- Push: the notification rides the existing 'invite' push event with an "event" key, so
-- notify-ride-message routes it to push_batch_social as it already does (no function deploy).
-- The tap data's type is 'event_invite'; app builds from before 3.0 open the app on a tap.
--
-- Backward compatible: one new table, one new function; push_batch_social is replaced with the
-- same signature and the ride branches unchanged.

create table if not exists rider_event_invites (
  event_id uuid not null references rider_events (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  invited_by uuid references profiles (id) on delete set null,
  group_id uuid references riding_groups (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index if not exists rider_event_invites_user_idx on rider_event_invites (user_id);
alter table rider_event_invites enable row level security;
revoke all on rider_event_invites from public, anon, authenticated;

-- A host invites everyone in a riding group they belong to. Returns how many were invited.
create or replace function invite_group_to_event(p_event uuid, p_group uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  e rider_events;
  v_ids uuid[];
  v_count int;
  v_user uuid;
begin
  if v_me is null then raise exception 'not signed in'; end if;
  select * into e from rider_events where id = p_event;
  if e.id is null then raise exception 'event not found'; end if;
  if not is_event_host(p_event, v_me) then raise exception 'only the event''s hosts can invite a group'; end if;
  if not is_group_member(p_group, v_me) then raise exception 'group not found'; end if;
  if e.status = 'cancelled' then raise exception 'this event was cancelled'; end if;
  if e.hidden_at is not null then raise exception 'this event is hidden'; end if;
  if e.ends_at < now() then raise exception 'this event is over'; end if;

  with added as (
    insert into rider_event_invites (event_id, user_id, invited_by, group_id)
    select p_event, u.user_id, v_me, p_group
    from (
      select owner_id as user_id from riding_groups where id = p_group
      union
      select user_id from riding_group_members where group_id = p_group
    ) u
    where u.user_id <> v_me
      and not is_event_host(p_event, u.user_id)
      and not exists (select 1 from rider_event_rsvps v where v.event_id = p_event and v.user_id = u.user_id)
      and not riders_blocked(v_me, u.user_id)
    on conflict (event_id, user_id) do nothing
    returning user_id
  )
  select coalesce(array_agg(user_id), '{}') into v_ids from added;
  v_count := cardinality(v_ids);

  foreach v_user in array v_ids loop
    perform queue_push(jsonb_build_object('type', 'invite', 'event', p_event, 'user', v_user, 'actor', v_me));
  end loop;

  insert into events (user_id, name, props)
  values (v_me, 'event_group_invited', jsonb_build_object('event_id', p_event, 'invited', v_count));
  return v_count;
end;
$$;
revoke execute on function invite_group_to_event(uuid, uuid) from public, anon;
grant execute on function invite_group_to_event(uuid, uuid) to authenticated;

-- push_batch_social as in 20261017430000_riding_groups.sql, plus event invites.
create or replace function push_batch_social(p_event jsonb)
returns table (user_id uuid, token text, platform text, title text, body text, thread_id text, data jsonb)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_type text := p_event ->> 'type';
  v_ride rides;
  v_ev rider_events;
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

  if v_type = 'invite' and p_event ? 'event' then
    select * into v_ev from rider_events where id = (p_event ->> 'event')::uuid;
    if not found or v_ev.status <> 'scheduled' or v_ev.hidden_at is not null or v_ev.ends_at < now() then return; end if;
    -- Still invited, and hasn't answered yet.
    if not exists (
      select 1 from rider_event_invites i
      where i.event_id = v_ev.id and i.user_id = (p_event ->> 'user')::uuid
    ) or exists (
      select 1 from rider_event_rsvps v where v.event_id = v_ev.id and v.user_id = (p_event ->> 'user')::uuid
    ) then
      return;
    end if;
    select coalesce(nullif(btrim(display_name), ''), 'A rider') into v_who
    from profiles where id = coalesce(nullif(p_event ->> 'actor', '')::uuid, v_ev.owner_id);
    v_title := coalesce(v_who, 'A rider') || ' invited you to ' || v_ev.title;

    return query
    select t.user_id, t.token, t.platform, v_title,
           case
             when s.time_zone is not null
               then to_char(v_ev.starts_at at time zone s.time_zone, 'FMDay, FMMonth FMDD') || ' at ' || v_ev.location_name
                    || '. Tap to see the event.'
             else v_ev.location_name || '. Tap to see the event.'
           end,
           'event:' || v_ev.id::text,
           jsonb_build_object('type', 'event_invite', 'eventId', v_ev.id, 'eventCode', v_ev.share_code)
    from push_tokens t
    left join notification_settings s on s.user_id = t.user_id
    where t.user_id = (p_event ->> 'user')::uuid
      and wants_social_push(t.user_id, 'ride_invites');
    return;

  elsif v_type = 'invite' then
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
