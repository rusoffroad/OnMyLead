-- Cancel with no service (3.1). A rider who takes back a status tap or quick reply while out of
-- service now sends the cancel over Bluetooth (core/nearby.ts, packet type 'cancel'), and the first
-- nearby phone with service uploads it here, the way it uploads relayed taps. The rider's own phone
-- also sends it itself once it has signal (lib/outbox.ts, through cancel_ride_item).
--
-- Backward compatible: cancel_ride_item keeps its signature and behaviour (it now calls the shared
-- cancel_ride_item_as), and bluetooth_relay_upload keeps its signature and rules and only learns
-- the new 'c' item. Builds before 3.1 never send one; older servers skip it.

-- ---------------------------------------------------------------------------
-- One rider takes back one of their own taps or quick replies. Internal: callers check who the
-- rider is (cancel_ride_item: the signed-in rider; bluetooth_relay_upload: the rider's own code).
-- ---------------------------------------------------------------------------
create or replace function cancel_ride_item_as(p_item uuid, p_user uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  st rider_statuses;
  msg ride_messages;
begin
  update rider_statuses set cancelled_at = now()
  where id = p_item and user_id = p_user and cancelled_at is null
  returning * into st;
  if found then
    delete from ride_receipts where item_id = p_item;
    perform queue_push(jsonb_build_object(
      'type', 'cancelled', 'ride', st.ride_id, 'user', st.user_id, 'item', st.id,
      'what', rider_status_label(st.status), 'help', st.status in ('need_help', 'emergency')));
    return 'status';
  end if;

  delete from ride_messages
  where id = p_item and user_id = p_user and kind = 'status'
  returning * into msg;
  if found then
    delete from ride_receipts where item_id = p_item;
    perform queue_push(jsonb_build_object(
      'type', 'cancelled', 'ride', msg.ride_id, 'user', msg.user_id, 'item', msg.id, 'what', msg.body, 'help', false));
    return 'message';
  end if;

  -- Already cancelled (a second tap, or a retry after a dropped reply) is fine.
  if exists (select 1 from rider_statuses where id = p_item and user_id = p_user) then return 'status'; end if;
  raise exception 'only the sender can cancel this';
end;
$$;
revoke execute on function cancel_ride_item_as(uuid, uuid) from public, anon, authenticated;

create or replace function cancel_ride_item(p_item uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  return cancel_ride_item_as(p_item, auth.uid());
end;
$$;
revoke execute on function cancel_ride_item(uuid) from public, anon;
grant execute on function cancel_ride_item(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- bluetooth_relay_upload, as in 20261105050000_release_fixes_pass1, plus the 'c' item.
-- ---------------------------------------------------------------------------
create or replace function bluetooth_relay_upload(p_ride uuid, p_items jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_user uuid;
  v_key bytea;
  v_at bigint;
  v_lat bigint;
  v_lng bigint;
  v_acc bigint;
  v_speed bigint;
  v_heading bigint;
  v_text text;
  v_count integer := 0;
  v_n integer;
  v_flags integer;
  v_id uuid;
  v_body text;
  v_state integer;
  v_sender uuid;
begin
  if v_uid is null or not is_ride_member(p_ride, v_uid) then
    raise exception 'not a rider on this ride' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' then return 0; end if;

  for v_item in select value from jsonb_array_elements(p_items) limit 200 loop
    begin
      v_user := (v_item ->> 'user_id')::uuid;
      v_at := (v_item ->> 'at')::bigint;
      v_lat := (v_item ->> 'lat_e7')::bigint;
      v_lng := (v_item ->> 'lng_e7')::bigint;
      v_flags := coalesce((v_item ->> 'flags')::int, 0);
      v_id := null;
      if (v_item ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        v_id := (v_item ->> 'id')::uuid;
      end if;
    exception when others then
      continue;
    end;
    -- A phone uploads its own spots, taps, messages and receipts itself.
    continue when v_user is null or v_user = v_uid or v_at is null;
    -- Compared as seconds, so a time far out of range skips the item instead of failing the upload.
    continue when v_at > extract(epoch from now())::bigint + 300 or v_at < extract(epoch from now())::bigint - 86400;
    continue when not is_ride_member(p_ride, v_user);
    select rider_key into v_key from ride_member_bluetooth_keys where ride_id = p_ride and user_id = v_user;
    continue when v_key is null;

    if v_item ->> 'k' = 'p' then
      continue when v_lat is null or v_lng is null or abs(v_lat) > 900000000 or abs(v_lng) > 1800000000;
      begin
        v_acc := (v_item ->> 'accuracy_m')::bigint;
        v_speed := (v_item ->> 'speed_cms')::bigint;
        v_heading := (v_item ->> 'heading_dd')::bigint;
      exception when others then
        continue;
      end;
      v_text := 'p|' || p_ride || '|' || v_user || '|' || v_lat || '|' || v_lng || '|'
        || coalesce(v_acc::text, '') || '|' || coalesce(v_speed::text, '') || '|' || coalesce(v_heading::text, '') || '|' || v_at;
      continue when bluetooth_mac(v_key, v_text) <> lower(coalesce(v_item ->> 'mac', ''));
      -- Only while that rider is sharing with this ride, as for a spot they send themselves.
      continue when not exists (
        select 1 from location_shares s
        where s.user_id = v_user and s.scope = 'ride' and s.ride_id = p_ride and share_is_active(s)
      );
      insert into positions_latest (user_id, lat, lng, speed_mps, heading_deg, accuracy_m, recorded_at)
      values (v_user, v_lat / 1e7, v_lng / 1e7, v_speed / 100.0, v_heading / 10.0, v_acc, to_timestamp(v_at))
      on conflict (user_id) do update
        set lat = excluded.lat, lng = excluded.lng, speed_mps = excluded.speed_mps,
            heading_deg = excluded.heading_deg, accuracy_m = excluded.accuracy_m, recorded_at = excluded.recorded_at
        -- Never older than what the server already has (the rider's own phone may have sent a newer one).
        where positions_latest.recorded_at < excluded.recorded_at;
      get diagnostics v_n = row_count;
      v_count := v_count + v_n;

    elsif v_item ->> 'k' = 's' then
      continue when v_id is null;
      continue when (v_item ->> 'status') is null
        or not (v_item ->> 'status') = any (enum_range(null::rider_status_kind)::text[]);
      v_text := 's|' || p_ride || '|' || v_user || '|' || v_id || '|' || (v_item ->> 'status') || '|'
        || v_flags || '|' || coalesce(v_lat::text, '') || '|' || coalesce(v_lng::text, '') || '|' || v_at;
      continue when bluetooth_mac(v_key, v_text) <> lower(coalesce(v_item ->> 'mac', ''));
      -- The tap keeps the id the rider's phone gave it, so when that phone later sends it itself
      -- it counts as the same tap, never a second one.
      insert into rider_statuses (id, ride_id, user_id, status, lat, lng, tapped_at)
      values (v_id, p_ride, v_user, (v_item ->> 'status')::rider_status_kind,
              v_lat / 1e7, v_lng / 1e7, to_timestamp(v_at))
      on conflict (id) do nothing;
      get diagnostics v_n = row_count;
      v_count := v_count + v_n;

    elsif v_item ->> 'k' = 'r' then
      continue when v_id is null;
      v_body := v_item ->> 'body';
      continue when v_body is null or length(v_body) = 0 or length(v_body) > 500;
      v_text := 'r|' || p_ride || '|' || v_user || '|' || v_id || '|' || v_body || '|' || v_at;
      continue when bluetooth_mac(v_key, v_text) <> lower(coalesce(v_item ->> 'mac', ''));
      -- Already there (the sender's own phone, or another relay, got there first).
      continue when exists (select 1 from ride_messages where id = v_id);
      begin
        insert into ride_messages (id, ride_id, user_id, kind, body, sent_at)
        values (v_id, p_ride, v_user, 'status', v_body, to_timestamp(v_at));
        v_count := v_count + 1;
      exception when unique_violation or check_violation or raise_exception then
        -- A race with the sender's own send, or the chat's own limits (length, rate): skipped.
        continue;
      end;

    elsif v_item ->> 'k' = 'a' then
      continue when v_id is null;
      v_state := case when (v_item ->> 'state') ~ '^[0-9]{1,2}$' then (v_item ->> 'state')::integer end;
      continue when v_state is null or v_state not in (1, 2);
      v_text := 'a|' || p_ride || '|' || v_user || '|' || v_id || '|' || v_state || '|' || v_at;
      continue when bluetooth_mac(v_key, v_text) <> lower(coalesce(v_item ->> 'mac', ''));
      -- Only "seen" reaches the sender's card from the server, the way ack_ride_items does it.
      continue when v_state <> 2;
      select x.user_id into v_sender from (
        select s.user_id from rider_statuses s where s.id = v_id and s.ride_id = p_ride and s.cancelled_at is null
        union all
        select m.user_id from ride_messages m where m.id = v_id and m.ride_id = p_ride and m.kind = 'status'
      ) x limit 1;
      continue when v_sender is null or v_sender = v_user;
      insert into ride_receipts (item_id, user_id, ride_id, sender_id, seen_at)
      values (v_id, v_user, p_ride, v_sender, to_timestamp(v_at))
      on conflict (item_id, user_id) do update set seen_at = coalesce(ride_receipts.seen_at, excluded.seen_at)
        where ride_receipts.seen_at is null;
      get diagnostics v_n = row_count;
      v_count := v_count + v_n;

    elsif v_item ->> 'k' = 'c' then
      -- The rider took back one of their own taps or quick replies with no service.
      continue when v_id is null;
      v_text := 'c|' || p_ride || '|' || v_user || '|' || v_id || '|' || v_at;
      continue when bluetooth_mac(v_key, v_text) <> lower(coalesce(v_item ->> 'mac', ''));
      -- Only that rider's own item on this ride, still out (already taken back counts as done).
      continue when not exists (
        select 1 from rider_statuses s where s.id = v_id and s.ride_id = p_ride and s.user_id = v_user and s.cancelled_at is null
        union all
        select 1 from ride_messages m where m.id = v_id and m.ride_id = p_ride and m.user_id = v_user and m.kind = 'status'
      );
      perform cancel_ride_item_as(v_id, v_user);
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end $$;


revoke execute on function bluetooth_relay_upload(uuid, jsonb) from public, anon;
grant execute on function bluetooth_relay_upload(uuid, jsonb) to authenticated;
