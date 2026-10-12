-- Ride Mode status buttons: proof the group got it, and a one-tap Cancel.
--   1. rider_statuses.cancelled_at: a status tap the rider took back. It stops counting as their
--      status (the one before it shows again) and Ride Mode clears it from everyone's screen.
--   2. ride_receipts: one row per rider who got a status tap or quick reply, readable only by
--      whoever sent it. seen_at is set by the rider's app when the tap reaches it (Ride Mode,
--      the ride chat, or a push that arrives while the app is open); pushed_at by the push
--      function once Apple accepts the notification for that rider.
--   3. ack_ride_items (riders' apps), record_push_reach (push function only) and
--      cancel_ride_item (the sender) write them.
--   4. push_batch, as in 20261017000000, plus: quick replies go out under Rider Status (not
--      Chat) with "Name: On My Way" titles, status pushes carry a collapse id, cancelled taps
--      are skipped, and {"type":"cancelled",...} tells the group a tap was taken back.
-- Additive: one nullable column, one table, three functions, push_batch replaced. Safe to run
-- straight after 20261019200000_planned_stops.

alter table rider_statuses add column if not exists cancelled_at timestamptz;

create table if not exists ride_receipts (
  item_id uuid not null,
  user_id uuid not null references profiles (id) on delete cascade,
  ride_id uuid not null references rides (id) on delete cascade,
  sender_id uuid not null references profiles (id) on delete cascade,
  seen_at timestamptz,
  pushed_at timestamptz,
  primary key (item_id, user_id)
);
create index if not exists ride_receipts_sender on ride_receipts (sender_id, item_id);

alter table ride_receipts enable row level security;
-- Only the sender reads who got their tap. Nobody writes directly; the functions below do.
create policy receipts_read on ride_receipts for select to authenticated using (sender_id = auth.uid());

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'ride_receipts') then
    alter publication supabase_realtime add table ride_receipts;
  end if;
end $$;

-- What a status tap is called in a push.
create or replace function rider_status_label(p rider_status_kind)
returns text language sql immutable as $$
  select case p
    when 'ok' then 'OK' when 'stopped' then 'Stopped' when 'need_fuel' then 'Need Fuel'
    when 'mechanical' then 'Mechanical Issue' when 'flat_tire' then 'Flat Tire' when 'stuck' then 'Stuck'
    when 'lost' then 'Lost' when 'need_help' then 'Need Help' when 'emergency' then 'EMERGENCY'
  end;
$$;

-- ---------------------------------------------------------------------------
-- A rider's app saw these status taps or quick replies. Ignores anything that isn't one, the
-- caller's own, cancelled ones, and other rides. Returns how many were new.
-- ---------------------------------------------------------------------------
create or replace function ack_ride_items(p_ride uuid, p_items uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if not is_ride_member(p_ride, auth.uid()) then return 0; end if;
  insert into ride_receipts (item_id, user_id, ride_id, sender_id, seen_at)
  select x.id, auth.uid(), p_ride, x.user_id, now()
  from (
    select s.id, s.user_id from rider_statuses s
    where s.id = any (p_items) and s.ride_id = p_ride and s.cancelled_at is null
    union all
    select m.id, m.user_id from ride_messages m
    where m.id = any (p_items) and m.ride_id = p_ride and m.kind = 'status'
  ) x
  where x.user_id <> auth.uid()
  on conflict (item_id, user_id) do update set seen_at = coalesce(ride_receipts.seen_at, excluded.seen_at)
  where ride_receipts.seen_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function ack_ride_items(uuid, uuid[]) from public, anon;
grant execute on function ack_ride_items(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- The push function: Apple accepted a notification about this item for these riders.
-- ---------------------------------------------------------------------------
create or replace function record_push_reach(p_item uuid, p_users uuid[])
returns void language plpgsql security invoker set search_path = public as $$
declare
  v_ride uuid;
  v_sender uuid;
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'not allowed';
  end if;
  select ride_id, user_id into v_ride, v_sender from rider_statuses where id = p_item;
  if v_ride is null then
    select ride_id, user_id into v_ride, v_sender from ride_messages where id = p_item and kind = 'status';
  end if;
  if v_ride is null then return; end if;
  insert into ride_receipts (item_id, user_id, ride_id, sender_id, pushed_at)
  select p_item, u, v_ride, v_sender, now() from unnest(p_users) u where u <> v_sender
  on conflict (item_id, user_id) do update set pushed_at = coalesce(ride_receipts.pushed_at, excluded.pushed_at);
end;
$$;
revoke execute on function record_push_reach(uuid, uuid[]) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function record_push_reach(uuid, uuid[]) to service_role;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The sender takes back a status tap or quick reply. A status is marked cancelled (realtime
-- tells Ride Mode to drop it); a quick reply is removed from the chat. Either way the riders
-- who could have been notified get a push saying so. Returns 'status' or 'message'.
-- ---------------------------------------------------------------------------
create or replace function cancel_ride_item(p_item uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  st rider_statuses;
  msg ride_messages;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;

  update rider_statuses set cancelled_at = now()
  where id = p_item and user_id = auth.uid() and cancelled_at is null
  returning * into st;
  if found then
    delete from ride_receipts where item_id = p_item;
    perform queue_push(jsonb_build_object(
      'type', 'cancelled', 'ride', st.ride_id, 'user', st.user_id, 'item', st.id,
      'what', rider_status_label(st.status), 'help', st.status in ('need_help', 'emergency')));
    return 'status';
  end if;

  delete from ride_messages
  where id = p_item and user_id = auth.uid() and kind = 'status'
  returning * into msg;
  if found then
    delete from ride_receipts where item_id = p_item;
    perform queue_push(jsonb_build_object(
      'type', 'cancelled', 'ride', msg.ride_id, 'user', msg.user_id, 'item', msg.id, 'what', msg.body, 'help', false));
    return 'message';
  end if;

  -- Already cancelled (a second tap, or a retry after a dropped reply) is fine.
  if exists (select 1 from rider_statuses where id = p_item and user_id = auth.uid()) then return 'status'; end if;
  raise exception 'only the sender can cancel this';
end;
$$;
revoke execute on function cancel_ride_item(uuid) from public, anon;
grant execute on function cancel_ride_item(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- push_batch, as in 20261017000000, plus the changes listed at the top and:
--   {"type":"cancelled","ride":<uuid>,"user":<uuid>,"item":<uuid>,"what":<text>,"help":<bool>}
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
    elsif msg.kind = 'status' then
      -- A Ride Mode quick reply (On My Way, Running Late...): it goes out like a status tap.
      v_category := 'rider_status';
      v_title := v_who || ': ' || msg.body;
    elsif msg.audience = 'leader' then
      v_category := 'leader_messages';
      v_title := v_who || ' (to you, the leader)';
      v_private_body := 'New message for the leader. Open OnMyLead to read it.';
    else
      v_category := 'chat';
      v_title := v_who;
      v_private_body := 'New message. Open OnMyLead to read it.';
    end if;
    if msg.kind = 'status' then
      v_body := v_ride.name;
      v_data := jsonb_build_object('type', 'message', 'rideId', msg.ride_id, 'inviteCode', v_ride.invite_code, 'messageId', msg.id,
                                   'itemId', msg.id, 'collapseId', msg.id);
    else
      v_title := v_title || ' · ' || v_ride.name;
      v_body := msg.body;
      v_data := jsonb_build_object('type', 'message', 'rideId', msg.ride_id, 'inviteCode', v_ride.invite_code, 'messageId', msg.id);
    end if;
    select array_agg(m.user_id) into v_to
    from ride_members m
    where m.ride_id = msg.ride_id and m.status = 'joined' and m.left_at is null
      and m.user_id <> msg.user_id
      and (msg.audience = 'everyone' or is_ride_leader(msg.ride_id, m.user_id));

  elsif v_type = 'status' then
    select * into st from rider_statuses where id = (p_event ->> 'id')::uuid;
    -- Cancelled before the push went out: nothing to say.
    if not found or st.cancelled_at is not null then return; end if;
    -- "All good" only matters after something that wasn't.
    if st.status = 'ok' then
      select s2.status into v_prev from rider_statuses s2
      where s2.ride_id = st.ride_id and s2.user_id = st.user_id and s2.id <> st.id and s2.cancelled_at is null
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
    v_data := jsonb_build_object('type', 'status', 'rideId', st.ride_id, 'inviteCode', v_ride.invite_code, 'status', st.status,
                                 'itemId', st.id, 'collapseId', st.id);
    select array_agg(m.user_id) into v_to
    from ride_members m
    where m.ride_id = st.ride_id and m.status = 'joined' and m.left_at is null and m.user_id <> st.user_id;

  elsif v_type = 'cancelled' then
    -- The sender took back a status or quick reply. Same riders, same setting; the push carries
    -- the original's collapse id so it replaces the first notification on the lock screen.
    select * into v_ride from rides where id = (p_event ->> 'ride')::uuid;
    if not found then return; end if;
    v_user := (p_event ->> 'user')::uuid;
    select coalesce(nullif(btrim(display_name), ''), 'A rider') into v_who from profiles where id = v_user;
    v_who := coalesce(v_who, 'A rider');
    v_category := case when (p_event ->> 'help')::boolean then 'help' else 'rider_status' end;
    v_title := v_who || ' cancelled “' || (p_event ->> 'what') || '”';
    v_body := v_ride.name || '. No need to act on it.';
    v_data := jsonb_build_object('type', 'cancelled', 'rideId', v_ride.id, 'inviteCode', v_ride.invite_code,
                                 'itemId', p_event ->> 'item', 'collapseId', p_event ->> 'item');
    select array_agg(m.user_id) into v_to
    from ride_members m
    where m.ride_id = v_ride.id and m.status = 'joined' and m.left_at is null and m.user_id <> v_user;

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
