-- Bluetooth mesh and crew messaging (app 2.1, app/src/core/nearby.ts): with no cell service, riders'
-- phones also pass quick replies, typed messages and receipts ("their phone got it", "they saw it")
-- phone to phone, and whichever phone gets service first uploads them. This replaces
-- bluetooth_relay_upload (20261104060000) in place, with the same signature and the same rules for
-- spots and status taps, plus two new item kinds. Nothing existing changes; additive only.
--
--   {"k":"r","user_id","id","body","at","mac"}        a quick reply or message: a ride_messages row of
--                                                     kind 'status', with the id the sender's phone gave
--                                                     it, so when that phone later sends it itself it is
--                                                     the same message, never a second one. The sender's
--                                                     code covers the whole text, so nobody can change
--                                                     or invent a rider's words on the server.
--   {"k":"a","user_id","id","state","at","mac"}       a receipt from rider user_id's phone for tap or
--                                                     message id: state 2 means they saw it on screen and
--                                                     becomes ride_receipts.seen_at (the same row
--                                                     ack_ride_items makes); state 1 (their phone got it)
--                                                     is kept on the phones only.
-- Every item is accepted only if its code checks out with that rider's own key and both riders are
-- joined riders of the ride, as before.

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
    continue when to_timestamp(v_at) > now() + interval '5 minutes' or to_timestamp(v_at) < now() - interval '1 day';
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
      v_state := (v_item ->> 'state')::integer;
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
    end if;
  end loop;
  return v_count;
end $$;

revoke execute on function bluetooth_relay_upload(uuid, jsonb) from public, anon;
grant execute on function bluetooth_relay_upload(uuid, jsonb) to authenticated;
