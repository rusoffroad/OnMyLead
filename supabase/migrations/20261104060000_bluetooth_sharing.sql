-- Bluetooth Sharing (app 2.1): with no cell service, Ride Mode passes riders' spots, status taps and
-- quick replies phone to phone over Bluetooth (app/src/core/nearby.ts). This adds the two things the
-- server does for it. Nothing existing changes, so every app build already in riders' hands keeps
-- working exactly as before.
--
-- 1. Keys, handed out while a joined rider still has service:
--    - the ride key (one per ride): every packet on the air is encrypted with it, so only the
--      ride's joined riders can read them;
--    - the rider key (one per rider per ride): each packet carries a code made with the sending
--      rider's key, which only that rider and the server know.
--    Neither table has a policy: nobody reads them except through bluetooth_ride_keys below.
--
-- 2. bluetooth_relay_upload: when a phone gets service back it uploads the spots and taps it heard
--    from other riders. Each one is accepted only if its code checks out with that rider's own
--    key, both riders are joined riders of the ride, and (for a spot) that rider is sharing with the
--    ride right now. So no rider can place another somewhere they are not, and a rider who has
--    stopped sharing never reappears on anyone's map. An emergency relayed this way goes out to
--    the group as a normal status tap, with the usual notifications.

create table ride_bluetooth_keys (
  ride_id uuid primary key references rides (id) on delete cascade,
  ride_key bytea not null default extensions.gen_random_bytes(32),
  created_at timestamptz not null default now()
);

create table ride_member_bluetooth_keys (
  ride_id uuid not null references rides (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  rider_key bytea not null default extensions.gen_random_bytes(32),
  created_at timestamptz not null default now(),
  primary key (ride_id, user_id)
);

alter table ride_bluetooth_keys enable row level security;
alter table ride_member_bluetooth_keys enable row level security;
revoke all on ride_bluetooth_keys, ride_member_bluetooth_keys from anon, authenticated;

-- The ride key and this rider's own key, for a joined rider of a ride that hasn't ended.
create or replace function bluetooth_ride_keys(p_ride uuid)
returns table (ride_key text, rider_key text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not is_ride_member(p_ride, v_uid) then
    raise exception 'not a rider on this ride' using errcode = '42501';
  end if;
  if exists (select 1 from rides where id = p_ride and status in ('ended', 'cancelled')) then
    raise exception 'this ride is over' using errcode = '42501';
  end if;
  insert into ride_bluetooth_keys (ride_id) values (p_ride) on conflict do nothing;
  insert into ride_member_bluetooth_keys (ride_id, user_id) values (p_ride, v_uid) on conflict do nothing;
  return query
    select encode(k.ride_key, 'base64'), encode(m.rider_key, 'base64')
    from ride_bluetooth_keys k
    join ride_member_bluetooth_keys m on m.ride_id = k.ride_id and m.user_id = v_uid
    where k.ride_id = p_ride;
end $$;

-- The code a rider's phone puts on a packet: the first 16 bytes of HMAC-SHA256, as hex.
create or replace function bluetooth_mac(p_key bytea, p_text text)
returns text language sql immutable set search_path = public as $$
  select encode(substring(extensions.hmac(convert_to(p_text, 'UTF8'), p_key, 'sha256') from 1 for 16), 'hex');
$$;
revoke execute on function bluetooth_mac(bytea, text) from public, anon, authenticated;

-- Spots and taps this rider's phone heard over Bluetooth. Returns how many were accepted. Items
-- that fail a check are skipped, never an error, so one bad item can't block the rest.
-- Each item is the JSON from core/nearby.ts uploadRow:
--   {"k":"p","user_id","lat_e7","lng_e7","accuracy_m","speed_cms","heading_dd","at","mac"}
--   {"k":"s","user_id","id","status","flags","lat_e7","lng_e7","at","mac"}
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
    exception when others then
      continue;
    end;
    -- A phone uploads its own spots and taps itself.
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
      continue when (v_item ->> 'status') is null
        or not (v_item ->> 'status') = any (enum_range(null::rider_status_kind)::text[]);
      continue when (v_item ->> 'id') is null or (v_item ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
      v_text := 's|' || p_ride || '|' || v_user || '|' || lower(v_item ->> 'id') || '|' || (v_item ->> 'status') || '|'
        || v_flags || '|' || coalesce(v_lat::text, '') || '|' || coalesce(v_lng::text, '') || '|' || v_at;
      continue when bluetooth_mac(v_key, v_text) <> lower(coalesce(v_item ->> 'mac', ''));
      -- The tap keeps the id the rider's phone gave it, so when that phone later sends it itself
      -- it counts as the same tap, never a second one.
      insert into rider_statuses (id, ride_id, user_id, status, lat, lng, tapped_at)
      values ((v_item ->> 'id')::uuid, p_ride, v_user, (v_item ->> 'status')::rider_status_kind,
              v_lat / 1e7, v_lng / 1e7, to_timestamp(v_at))
      on conflict (id) do nothing;
      get diagnostics v_n = row_count;
      v_count := v_count + v_n;
    end if;
  end loop;
  return v_count;
end $$;

revoke execute on function bluetooth_ride_keys(uuid), bluetooth_relay_upload(uuid, jsonb) from public, anon;
grant execute on function bluetooth_ride_keys(uuid), bluetooth_relay_upload(uuid, jsonb) to authenticated;
