-- Cancel and delete a ride, and tell everyone on it by push and by email.
--   1. cancel_ride: the organizer or a co-organizer calls off a ride that hasn't ended. It stays
--      in everyone's list as Cancelled; the rides_notify trigger (20261015000000) sends the
--      "is cancelled" push, and the Edge Function emails the same riders.
--   2. delete_ride: the organizer removes the ride for good. If it hadn't ended or been
--      cancelled, everyone who had joined, asked to join or was on the waitlist hears about it
--      the same way, so nobody loses a ride silently. The ride is gone by the time the push is
--      sent, so its name and who was on it travel in the event.
--   3. email_batch: who to email and what about, for the Edge Function (service role only).
--      Riders can turn these emails off (notification_settings.ride_emails).
-- Additive: one column, three functions, one trigger; push_batch is replaced with the same body
-- plus the ride_deleted event. Safe to run straight after 20261016000000_join_ride_approval_fix.

alter table notification_settings add column if not exists ride_emails boolean not null default true;

-- ---------------------------------------------------------------------------
-- 1. Cancel.
-- ---------------------------------------------------------------------------
create or replace function cancel_ride(p_ride uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_status ride_status;
begin
  select status into v_status from rides where id = p_ride for update;
  if v_status is null or auth.uid() is null then raise exception 'ride not found'; end if;
  if not is_ride_manager(p_ride, auth.uid()) then raise exception 'only the organizer can cancel the ride'; end if;
  if v_status not in ('scheduled', 'live') then raise exception 'this ride is already %', v_status; end if;
  perform set_ride_status(p_ride, 'cancelled');
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Delete. The trigger also covers a ride removed because its organizer deleted their account.
-- ---------------------------------------------------------------------------
create or replace function delete_ride(p_ride uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_organizer uuid;
begin
  select organizer_id into v_organizer from rides where id = p_ride for update;
  if v_organizer is null or auth.uid() is null then raise exception 'ride not found'; end if;
  if v_organizer <> auth.uid() then raise exception 'only the organizer can delete the ride'; end if;
  delete from rides where id = p_ride;
end;
$$;

revoke execute on function cancel_ride(uuid), delete_ride(uuid) from public, anon;
grant execute on function cancel_ride(uuid), delete_ride(uuid) to authenticated;

-- Before the delete, while the roster still exists.
create or replace function ride_delete_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_to jsonb;
begin
  if old.status not in ('scheduled', 'live') then return old; end if;
  select coalesce(jsonb_agg(m.user_id order by m.created_at), '[]') into v_to
  from ride_members m
  where m.ride_id = old.id and m.left_at is null and m.status in ('joined', 'pending', 'waitlisted')
    and m.user_id <> old.organizer_id and m.user_id is distinct from auth.uid();
  if jsonb_array_length(v_to) > 0 then
    perform queue_push(jsonb_build_object(
      'type', 'ride_deleted', 'id', old.id, 'name', old.name, 'meet_at', old.meet_at,
      'organizer', old.organizer_id, 'to', v_to, 'actor', auth.uid()));
  end if;
  return old;
end;
$$;
drop trigger if exists rides_delete_notify on rides;
create trigger rides_delete_notify before delete on rides
  for each row execute function ride_delete_notify();

-- ---------------------------------------------------------------------------
-- push_batch, as in 20261015000000, plus:
--   {"type":"ride_deleted","id":<uuid>,"name":<text>,"meet_at":<timestamptz>,"organizer":<uuid>,"to":[<uuid>...],"actor":<uuid>}
-- ---------------------------------------------------------------------------
create or replace function push_batch(p_event jsonb)
returns table (user_id uuid, token text, platform text, title text, body text, thread_id text, data jsonb)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_type text := p_event ->> 'type';
  v_change text := p_event ->> 'change';
  v_actor uuid := nullif(p_event ->> 'actor', '')::uuid;
  v_ride rides;
  v_who text;
  v_category text;
  v_title text;
  v_body text;
  v_private_body text;
  v_meet_time boolean := false;
  v_data jsonb;
  v_to uuid[];
  msg ride_messages;
  st rider_statuses;
  v_prev rider_status_kind;
  v_user uuid;
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'not allowed';
  end if;

  if v_type = 'message' then
    select * into msg from ride_messages where id = (p_event ->> 'id')::uuid;
    if not found then return; end if;
    select * into v_ride from rides where id = msg.ride_id;
    select coalesce(nullif(btrim(display_name), ''), 'A rider') into v_who from profiles where id = msg.user_id;
    v_who := coalesce(v_who, 'A rider');
    if msg.kind = 'announcement' then
      v_category := 'announcements';
      v_title := 'Announcement from ' || v_who;
      v_private_body := 'New announcement. Open OnMyLead to read it.';
    elsif msg.audience = 'leader' then
      v_category := 'leader_messages';
      v_title := v_who || ' (to you, the leader)';
      v_private_body := 'New message for the leader. Open OnMyLead to read it.';
    else
      v_category := 'chat';
      v_title := v_who;
      v_private_body := 'New message. Open OnMyLead to read it.';
    end if;
    v_title := v_title || ' · ' || v_ride.name;
    v_body := msg.body;
    v_data := jsonb_build_object('type', 'message', 'rideId', msg.ride_id, 'inviteCode', v_ride.invite_code, 'messageId', msg.id);
    select array_agg(m.user_id) into v_to
    from ride_members m
    where m.ride_id = msg.ride_id and m.status = 'joined' and m.left_at is null
      and m.user_id <> msg.user_id
      and (msg.audience = 'everyone' or is_ride_leader(msg.ride_id, m.user_id));

  elsif v_type = 'status' then
    select * into st from rider_statuses where id = (p_event ->> 'id')::uuid;
    if not found then return; end if;
    -- "All good" only matters after something that wasn't.
    if st.status = 'ok' then
      select s2.status into v_prev from rider_statuses s2
      where s2.ride_id = st.ride_id and s2.user_id = st.user_id and s2.id <> st.id
        and (s2.created_at, s2.id) < (st.created_at, st.id)
      order by s2.created_at desc, s2.id desc limit 1;
      if v_prev is null or v_prev = 'ok' then return; end if;
    end if;
    select * into v_ride from rides where id = st.ride_id;
    select coalesce(nullif(btrim(display_name), ''), 'A rider') into v_who from profiles where id = st.user_id;
    v_who := coalesce(v_who, 'A rider');
    v_category := case when st.status in ('need_help', 'emergency') then 'help' else 'rider_status' end;
    v_title := case st.status
      when 'emergency' then 'EMERGENCY: ' || v_who || ' needs help now'
      when 'need_help' then v_who || ' needs help'
      when 'ok' then v_who || ' is all good now'
      when 'stopped' then v_who || ' has stopped'
      when 'need_fuel' then v_who || ' needs fuel'
      when 'mechanical' then v_who || ' has a mechanical problem'
      when 'flat_tire' then v_who || ' has a flat tire'
      when 'stuck' then v_who || ' is stuck'
      when 'lost' then v_who || ' is lost'
    end;
    v_body := v_ride.name || case when v_category = 'help' then '. Tap to see where they are.' else '' end;
    v_data := jsonb_build_object('type', 'status', 'rideId', st.ride_id, 'inviteCode', v_ride.invite_code, 'status', st.status);
    select array_agg(m.user_id) into v_to
    from ride_members m
    where m.ride_id = st.ride_id and m.status = 'joined' and m.left_at is null and m.user_id <> st.user_id;

  elsif v_type = 'ride' then
    select * into v_ride from rides where id = (p_event ->> 'id')::uuid;
    if not found then return; end if;
    v_category := 'ride_changes';
    v_data := jsonb_build_object('type', 'ride', 'change', v_change, 'rideId', v_ride.id, 'inviteCode', v_ride.invite_code);
    if v_change = 'live' then
      v_title := v_ride.name || ' is starting';
      v_body := 'Open Ride Mode to share your location with the group.';
    elsif v_change = 'cancelled' then
      v_title := v_ride.name || ' is cancelled';
      v_body := 'The organizer called it off.';
    elsif v_change in ('time', 'time_place') then
      v_title := case when v_change = 'time' then v_ride.name || ' has a new time' else v_ride.name || ' has a new time and meeting spot' end;
      v_meet_time := true;
      v_body := 'Tap to see the new time.';
    elsif v_change = 'place' then
      v_title := v_ride.name || ' has a new meeting spot';
      v_body := coalesce('Now meeting at ' || nullif(btrim(v_ride.meet_area_label), '') || '.', 'Tap to see where to meet.');
    else
      return;
    end if;
    select array_agg(m.user_id) into v_to
    from ride_members m
    where m.ride_id = v_ride.id and m.left_at is null
      and (m.status = 'joined' or (v_change <> 'live' and m.status in ('pending', 'waitlisted')))
      and m.user_id is distinct from v_actor;

  elsif v_type = 'ride_deleted' then
    -- The ride is already gone, so its name and who was on it travel in the event.
    v_ride.id := (p_event ->> 'id')::uuid;
    v_ride.name := p_event ->> 'name';
    v_category := 'ride_changes';
    v_title := v_ride.name || ' is cancelled';
    v_body := 'The organizer called it off and removed the ride.';
    v_data := jsonb_build_object('type', 'ride', 'change', 'deleted', 'rideId', v_ride.id);
    select array_agg(x::uuid) into v_to from jsonb_array_elements_text(coalesce(p_event -> 'to', '[]')) x;

  elsif v_type = 'member' then
    select * into v_ride from rides where id = (p_event ->> 'ride')::uuid;
    if not found then return; end if;
    v_user := (p_event ->> 'user')::uuid;
    select coalesce(nullif(btrim(display_name), ''), 'A rider') into v_who from profiles where id = v_user;
    v_who := coalesce(v_who, 'A rider');
    v_data := jsonb_build_object('type', 'member', 'change', v_change, 'rideId', v_ride.id, 'inviteCode', v_ride.invite_code);
    if v_change in ('joined', 'pending') then
      v_category := 'new_riders';
      v_title := case when v_change = 'joined' then v_who || ' joined ' || v_ride.name else v_who || ' asks to join ' || v_ride.name end;
      v_body := case when v_change = 'joined' then 'Tap to see who’s going.' else 'Tap to see the request.' end;
      select array_agg(m.user_id) into v_to
      from ride_members m
      where m.ride_id = v_ride.id and m.status = 'joined' and m.left_at is null
        and m.role in ('organizer', 'co_organizer') and m.user_id <> v_user;
    else
      v_category := 'ride_changes';
      if v_change = 'in' then
        v_title := 'You’re in: ' || v_ride.name;
        v_body := 'You have a spot on the ride.';
      elsif v_change = 'role' and p_event ->> 'role' = 'leader' then
        v_title := 'You’re leading ' || v_ride.name;
        v_body := 'The group follows you. Your dot is the blue one.';
      elsif v_change = 'role' and p_event ->> 'role' = 'sweep' then
        v_title := 'You’re tail gunner on ' || v_ride.name;
        v_body := 'You ride at the back and make sure nobody gets left behind.';
      elsif v_change = 'role' and p_event ->> 'role' = 'organizer' then
        v_title := v_ride.name || ' is yours now';
        v_body := 'You’re the organizer and the leader.';
      else
        return;
      end if;
      v_to := array[v_user];
    end if;

  else
    return;
  end if;

  return query
  select t.user_id, t.token, t.platform, v_title,
         case
           when v_meet_time and s.time_zone is not null
             then 'Now meeting ' || to_char(v_ride.meet_at at time zone s.time_zone, 'FMDay, FMMonth FMDD "at" FMHH12:MI AM') || '.'
           when v_private_body is not null and s.previews is false then v_private_body
           else v_body
         end,
         v_ride.id::text,
         v_data
  from push_tokens t
  left join notification_settings s on s.user_id = t.user_id
  where t.user_id = any (coalesce(v_to, '{}'))
    and t.user_id is distinct from v_actor
    and wants_push(t.user_id, v_category);
end;
$$;
revoke execute on function push_batch(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Emails for a cancelled or deleted ride: one row per rider, with the meeting time in their
-- own time zone (else the organizer's). Only the service role (the Edge Function) may call it;
-- the addresses come from auth.users through user_emails, which nobody else can call either.
-- ---------------------------------------------------------------------------
create or replace function user_emails(p_ids uuid[])
returns table (id uuid, email text) language sql stable security definer set search_path = public as $$
  select u.id, u.email::text from auth.users u where u.id = any (p_ids) and u.email is not null and u.email <> '';
$$;
revoke execute on function user_emails(uuid[]) from public, anon, authenticated;

create or replace function email_batch(p_event jsonb)
returns table (user_id uuid, email text, rider_name text, ride_name text, organizer_name text, meet_local text, deleted boolean)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_deleted boolean := p_event ->> 'type' = 'ride_deleted';
  v_actor uuid := nullif(p_event ->> 'actor', '')::uuid;
  v_ride_id uuid := (p_event ->> 'id')::uuid;
  v_name text;
  v_meet timestamptz;
  v_organizer uuid;
  v_to uuid[];
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'not allowed';
  end if;
  if v_deleted then
    v_name := p_event ->> 'name';
    v_meet := (p_event ->> 'meet_at')::timestamptz;
    v_organizer := (p_event ->> 'organizer')::uuid;
    select array_agg(x::uuid) into v_to from jsonb_array_elements_text(coalesce(p_event -> 'to', '[]')) x;
  elsif p_event ->> 'type' = 'ride' and p_event ->> 'change' = 'cancelled' then
    select r.name, r.meet_at, r.organizer_id into v_name, v_meet, v_organizer from rides r where r.id = v_ride_id;
    if v_name is null then return; end if;
    select array_agg(m.user_id) into v_to
    from ride_members m
    where m.ride_id = v_ride_id and m.left_at is null and m.status in ('joined', 'pending', 'waitlisted');
  else
    return;
  end if;

  return query
  select u.id, u.email,
         nullif(btrim(p.display_name), ''),
         v_name,
         coalesce((select nullif(btrim(op.display_name), '') from profiles op where op.id = coalesce(v_actor, v_organizer)), 'The organizer'),
         case when coalesce(s.time_zone, os.time_zone) is not null
           then to_char(v_meet at time zone coalesce(s.time_zone, os.time_zone), 'FMDay, FMMonth FMDD "at" FMHH12:MI AM')
         end,
         v_deleted
  from user_emails(coalesce(v_to, '{}')) u
  left join profiles p on p.id = u.id
  left join notification_settings s on s.user_id = u.id
  left join notification_settings os on os.user_id = v_organizer
  where u.id is distinct from v_actor
    and coalesce(s.ride_emails, true);
end;
$$;
revoke execute on function email_batch(jsonb) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function email_batch(jsonb), user_emails(uuid[]) to service_role;
  end if;
end $$;
