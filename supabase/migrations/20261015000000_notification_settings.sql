-- Push notifications for the whole ride, and each rider's notification settings.
-- Builds on 20261012000000_chat_leader_push.sql (device tokens, the Vault secrets and the
-- notify-ride-message Edge Function). Additive only: one settings table, a few helpers, and
-- after-insert/update triggers on rider_statuses, rides and ride_members. Nothing is dropped;
-- ride_message_notify is replaced so chat goes through the same path as everything else.
--
-- What a rider can be notified about (each one can be switched off in the app, except help):
--   help             a rider on your ride taps Need help or EMERGENCY (always on, ignores quiet hours)
--   rider_status     Stopped, Need fuel, Mechanical, Flat tire, Stuck, Lost, and all good again
--   announcements    announcements from the organizer
--   leader_messages  leader-only messages, when you lead
--   chat             everything else in ride chat, quick replies included
--   ride_changes     a ride you're on starts, is cancelled, or gets a new time or meeting spot;
--                    you get off the waitlist or are approved; you're handed the lead, made tail
--                    gunner or given the ride
--   new_riders       someone joins or asks to join a ride you organize
-- Ride reminders are scheduled on the phone itself from reminder_minutes.

-- ---------------------------------------------------------------------------
-- Settings. A rider without a row gets the defaults (everything on, no quiet hours).
-- ---------------------------------------------------------------------------
create or replace function is_time_zone(p text)
returns boolean language sql stable set search_path = public as $$
  select exists (select 1 from pg_timezone_names where name = p);
$$;

create table notification_settings (
  user_id uuid primary key references profiles (id) on delete cascade,
  chat boolean not null default true,
  leader_messages boolean not null default true,
  announcements boolean not null default true,
  rider_status boolean not null default true,
  ride_changes boolean not null default true,
  new_riders boolean not null default true,
  -- Off: notifications say a message arrived but not what it says (lock screen privacy).
  previews boolean not null default true,
  -- Minutes before the meeting time; null means no reminder.
  reminder_minutes int default 60 check (reminder_minutes between 5 and 2880),
  quiet_hours boolean not null default false,
  -- Minutes after local midnight. Start after end means the quiet time runs past midnight.
  quiet_start smallint not null default 1320 check (quiet_start between 0 and 1439),
  quiet_end smallint not null default 360 check (quiet_end between 0 and 1439),
  -- The phone's time zone (IANA name), for quiet hours and meeting times.
  time_zone text check (time_zone is null or is_time_zone(time_zone)),
  updated_at timestamptz not null default now()
);
alter table notification_settings enable row level security;
create policy notification_settings_own_read on notification_settings for select to authenticated
  using (user_id = auth.uid());
create policy notification_settings_own_insert on notification_settings for insert to authenticated
  with check (user_id = auth.uid());
create policy notification_settings_own_update on notification_settings for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update on notification_settings to authenticated;

create trigger notification_settings_touch before update on notification_settings
  for each row execute function touch_updated_at();

-- Is a local time (minutes after midnight) inside the quiet window? Equal ends mean no window.
create or replace function in_quiet_window(p_start int, p_end int, p_local int)
returns boolean language sql immutable as $$
  select case
    when p_start = p_end then false
    when p_start < p_end then p_local >= p_start and p_local < p_end
    else p_local >= p_start or p_local < p_end
  end;
$$;

-- Should this rider get a push in this category right now?
create or replace function wants_push(p_user uuid, p_category text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  s notification_settings;
  v_now timestamp;
begin
  if p_category = 'help' then return true; end if;
  select * into s from notification_settings where user_id = p_user;
  if not found then return true; end if;
  if not coalesce(case p_category
      when 'chat' then s.chat
      when 'leader_messages' then s.leader_messages
      when 'announcements' then s.announcements
      when 'rider_status' then s.rider_status
      when 'ride_changes' then s.ride_changes
      when 'new_riders' then s.new_riders
    end, false) then
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
revoke execute on function wants_push(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- What to send, to whom. The Edge Function calls this with the service role for each event
-- and sends one notification per row; anyone else gets an error.
--   {"type":"message","id":<ride_messages.id>}
--   {"type":"status","id":<rider_statuses.id>}
--   {"type":"ride","id":<rides.id>,"change":"live|cancelled|time|place|time_place","actor":<uuid>}
--   {"type":"member","ride":<uuid>,"user":<uuid>,"change":"joined|pending|in|role","role":<role>,"actor":<uuid>}
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
-- Hand events to the Edge Function (pg_net, so nothing waits on it). Does nothing until the
-- Vault secrets onmylead_push_url and onmylead_push_secret exist, and only warns on failure:
-- nothing a rider does is ever refused because a notification could not be sent.
-- ---------------------------------------------------------------------------
create or replace function queue_push(p_event jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_secret text;
begin
  if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then
    return;
  end if;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'onmylead_push_url'$q$ into v_url;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'onmylead_push_secret'$q$ into v_secret;
  if v_url is null or v_secret is null then return; end if;
  execute $q$select net.http_post(url := $1, body := $2, headers := $3)$q$
    using v_url, p_event,
          jsonb_build_object('Content-Type', 'application/json', 'x-onmylead-push-secret', v_secret);
exception when others then
  raise warning 'queue_push: %', sqlerrm;
end;
$$;
revoke execute on function queue_push(jsonb) from public, anon, authenticated;

-- Chat now uses the same path (same trigger, new body).
create or replace function ride_message_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform queue_push(jsonb_build_object('type', 'message', 'id', new.id));
  return null;
end;
$$;

create or replace function rider_status_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform queue_push(jsonb_build_object('type', 'status', 'id', new.id));
  return null;
end;
$$;
create trigger rider_statuses_notify after insert on rider_statuses
  for each row execute function rider_status_notify();

create or replace function ride_change_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_change text;
  v_time boolean := new.meet_at is distinct from old.meet_at;
  v_place boolean := new.meet_area_label is distinct from old.meet_area_label
                  or new.meet_area_lat is distinct from old.meet_area_lat
                  or new.meet_area_lng is distinct from old.meet_area_lng;
begin
  if new.status is distinct from old.status then
    v_change := case new.status when 'live' then 'live' when 'cancelled' then 'cancelled' end;
  elsif new.status = 'scheduled' and (v_time or v_place) then
    v_change := case when v_time and v_place then 'time_place' when v_time then 'time' else 'place' end;
  end if;
  if v_change is not null then
    perform queue_push(jsonb_build_object('type', 'ride', 'id', new.id, 'change', v_change, 'actor', auth.uid()));
  end if;
  return null;
end;
$$;
create trigger rides_notify after update of status, meet_at, meet_area_label, meet_area_lat, meet_area_lng on rides
  for each row execute function ride_change_notify();

-- Riders arriving (for the organizers), getting a spot or a role (for that rider).
create or replace function ride_member_notify_event(
  p_old_status member_status, p_new_status member_status, p_old_role member_role, p_new_role member_role,
  p_user uuid, p_actor uuid, p_organizer uuid
) returns jsonb language sql immutable as $$
  select case
    when p_new_status = 'pending' and p_old_status is distinct from 'pending' and p_actor is not distinct from p_user
      then jsonb_build_object('change', 'pending')
    when p_new_status = 'joined' and p_old_status is distinct from 'joined' and p_user <> p_organizer
         and p_actor is not distinct from p_user
      then jsonb_build_object('change', 'joined')
    when p_new_status = 'joined' and p_old_status in ('pending', 'waitlisted') and p_actor is distinct from p_user
      then jsonb_build_object('change', 'in')
    when p_new_status = 'joined' and p_old_status = 'joined' and p_new_role is distinct from p_old_role
         and p_new_role in ('leader', 'sweep', 'organizer') and p_actor is distinct from p_user
      then jsonb_build_object('change', 'role', 'role', p_new_role)
  end;
$$;

create or replace function ride_member_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_event jsonb;
  v_actor uuid := auth.uid();
begin
  v_event := ride_member_notify_event(
    case when tg_op = 'UPDATE' then old.status end, new.status,
    case when tg_op = 'UPDATE' then old.role end, new.role,
    new.user_id, v_actor, (select organizer_id from rides where id = new.ride_id));
  if v_event is not null then
    perform queue_push(v_event || jsonb_build_object('type', 'member', 'ride', new.ride_id, 'user', new.user_id, 'actor', v_actor));
  end if;
  return null;
end;
$$;
create trigger ride_members_notify after insert or update of status, role on ride_members
  for each row execute function ride_member_notify();
