-- Bluetooth Sharing (migration 20261103600000_bluetooth_sharing.sql): who gets the ride's keys, and
-- which relayed spots and taps the server accepts. Runs after privacy_test.sql (run_local.sh), which
-- sets up as_user and grants every table to authenticated, so these checks lean on row level
-- security and the functions alone. Each block raises an exception if a rule is broken.
--
-- Riders (all new here):
--   Amy  b1e01 organizer, relays for the others
--   Bo   b1e02 joined, sharing with the ride
--   Cy   b1e03 joined, not sharing
--   Dee  b1e04 a stranger
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000b1e01', '{"full_name":"Amy Relay"}'),
  ('00000000-0000-0000-0000-0000000b1e02', '{"full_name":"Bo Sharing"}'),
  ('00000000-0000-0000-0000-0000000b1e03', '{"full_name":"Cy Quiet"}'),
  ('00000000-0000-0000-0000-0000000b1e04', '{"full_name":"Dee Stranger"}');

select as_user('00000000-0000-0000-0000-0000000b1e01');
set role authenticated;
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility, max_vehicles)
values ('0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b', auth.uid(), 'No Bars Canyon', now() + interval '1 hour', 38.5, -109.5, 'public', 6);
reset role;
select as_user('00000000-0000-0000-0000-0000000b1e02');
set role authenticated;
select join_ride('0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b');
reset role;
select as_user('00000000-0000-0000-0000-0000000b1e03');
set role authenticated;
select join_ride('0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b');
reset role;
select as_user('00000000-0000-0000-0000-0000000b1e01');
set role authenticated;
select set_ride_status('0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b', 'live');
reset role;
select as_user('00000000-0000-0000-0000-0000000b1e02');
set role authenticated;
insert into location_shares (user_id, scope, ride_id, expires_at)
values (auth.uid(), 'ride', '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b', now() + interval '2 hours');
reset role;

-- Spot and tap JSON as core/nearby.ts uploadRow makes it, with the rider's code worked out here.
create function bt_spot(p_user uuid, p_lat bigint, p_at bigint, p_key_of uuid default null) returns jsonb language sql as $$
  select jsonb_build_object('k', 'p', 'user_id', p_user, 'lat_e7', p_lat, 'lng_e7', -1095000000,
    'accuracy_m', 5, 'speed_cms', null, 'heading_dd', 900, 'at', p_at,
    'mac', bluetooth_mac(
      (select rider_key from ride_member_bluetooth_keys where ride_id = '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b' and user_id = coalesce(p_key_of, p_user)),
      'p|0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b|' || p_user || '|' || p_lat || '|-1095000000|5||900|' || p_at));
$$;
create function bt_tap(p_user uuid, p_id uuid, p_status text, p_at bigint) returns jsonb language sql as $$
  select jsonb_build_object('k', 's', 'user_id', p_user, 'id', p_id, 'status', p_status, 'flags', 1,
    'lat_e7', 385000000, 'lng_e7', null, 'at', p_at,
    'mac', bluetooth_mac(
      (select rider_key from ride_member_bluetooth_keys where ride_id = '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b' and user_id = p_user),
      's|0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b|' || p_user || '|' || p_id || '|' || p_status || '|1|385000000||' || p_at));
$$;
create function bt_upload(p_as uuid, p_items jsonb) returns integer language plpgsql as $$
declare v integer;
begin
  perform as_user(p_as);
  execute 'set local role authenticated';
  v := bluetooth_relay_upload('0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b', p_items);
  execute 'reset role';
  return v;
end $$;

-- B0. The server's code matches the app's (same vector as core/__tests__/nearby.test.ts).
do $$ begin
  if bluetooth_mac(decode('020910171e252c333a41484f565d646b727980878e959ca3aab1b8bfc6cdd4db', 'hex'),
    'p|11111111-2222-4333-8444-555555555555|aaaaaaaa-0000-4000-8000-000000000001|302672000|-977431000|6||2713|1793721600')
    <> 'c12ba602abf58ee3a828b730570a601f' then
    raise exception 'FAIL: server rider code differs from the app''s';
  end if;
end $$;

-- B1. A stranger gets no keys and can't read the key tables.
select as_user('00000000-0000-0000-0000-0000000b1e04');
set role authenticated;
do $$ begin
  begin
    perform bluetooth_ride_keys('0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b');
    raise exception 'FAIL: stranger got the ride key';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- B2. Joined riders get the same ride key and their own rider key; asking again gives the same.
select as_user('00000000-0000-0000-0000-0000000b1e02');
set role authenticated;
create temp table bo_keys as select * from bluetooth_ride_keys('0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b');
do $$ begin
  if (select count(*) from ride_member_bluetooth_keys) <> 0 or (select count(*) from ride_bluetooth_keys) <> 0 then
    raise exception 'FAIL: key tables readable directly';
  end if;
  if (select rider_key from bo_keys) <> (select rider_key from bluetooth_ride_keys('0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b')) then
    raise exception 'FAIL: rider key changed on a second ask';
  end if;
  if length(decode((select ride_key from bo_keys), 'base64')) <> 32 then raise exception 'FAIL: ride key not 32 bytes'; end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-0000000b1e01');
set role authenticated;
do $$ begin
  if (select ride_key from bluetooth_ride_keys('0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b')) <> (select ride_key from bo_keys) then
    raise exception 'FAIL: riders on one ride got different ride keys';
  end if;
  if (select rider_key from bluetooth_ride_keys('0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b')) = (select rider_key from bo_keys) then
    raise exception 'FAIL: two riders share a rider key';
  end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-0000000b1e03');
set role authenticated;
select bluetooth_ride_keys('0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b');
reset role;

-- B3. Amy relays Bo's spot: accepted, and the map shows it.
do $$
declare t bigint := extract(epoch from now())::bigint - 30;
begin
  if bt_upload('00000000-0000-0000-0000-0000000b1e01', jsonb_build_array(bt_spot('00000000-0000-0000-0000-0000000b1e02', 385100000, t))) <> 1 then
    raise exception 'FAIL: good relayed spot refused';
  end if;
  if (select round(lat::numeric, 4) from positions_latest where user_id = '00000000-0000-0000-0000-0000000b1e02') <> 38.51 then
    raise exception 'FAIL: relayed spot not stored';
  end if;
  -- An older spot never replaces a newer one, and the same spot again changes nothing.
  if bt_upload('00000000-0000-0000-0000-0000000b1e01', jsonb_build_array(
       bt_spot('00000000-0000-0000-0000-0000000b1e02', 385200000, t - 60),
       bt_spot('00000000-0000-0000-0000-0000000b1e02', 385100000, t))) <> 0 then
    raise exception 'FAIL: older or repeated spot accepted';
  end if;
end $$;

-- B4. Forged spots are refused: wrong code, someone else's key, changed numbers, from the future.
do $$
declare t bigint := extract(epoch from now())::bigint;
begin
  if bt_upload('00000000-0000-0000-0000-0000000b1e01', jsonb_build_array(
       bt_spot('00000000-0000-0000-0000-0000000b1e02', 386000000, t) || '{"mac":"00000000000000000000000000000000"}',
       bt_spot('00000000-0000-0000-0000-0000000b1e02', 386000000, t, '00000000-0000-0000-0000-0000000b1e01'),
       bt_spot('00000000-0000-0000-0000-0000000b1e02', 386000000, t) || '{"lat_e7":386000001}',
       bt_spot('00000000-0000-0000-0000-0000000b1e02', 386000000, t + 3600),
       '{"k":"p","user_id":"not-a-uuid"}'::jsonb)) <> 0 then
    raise exception 'FAIL: forged spot accepted';
  end if;
  if (select round(lat::numeric, 4) from positions_latest where user_id = '00000000-0000-0000-0000-0000000b1e02') <> 38.51 then
    raise exception 'FAIL: forged spot moved the rider';
  end if;
end $$;

-- B5. A rider who isn't sharing never shows up through a relay, and nobody relays their own.
do $$
declare t bigint := extract(epoch from now())::bigint;
begin
  if bt_upload('00000000-0000-0000-0000-0000000b1e01', jsonb_build_array(bt_spot('00000000-0000-0000-0000-0000000b1e03', 385000000, t))) <> 0 then
    raise exception 'FAIL: spot of a rider who is not sharing accepted';
  end if;
  if exists (select 1 from positions_latest where user_id = '00000000-0000-0000-0000-0000000b1e03') then
    raise exception 'FAIL: not-sharing rider placed on the map';
  end if;
  if bt_upload('00000000-0000-0000-0000-0000000b1e02', jsonb_build_array(bt_spot('00000000-0000-0000-0000-0000000b1e02', 385300000, t))) <> 0 then
    raise exception 'FAIL: own spot accepted through the relay';
  end if;
end $$;

-- B6. A stranger can't upload at all.
do $$ begin
  begin
    perform bt_upload('00000000-0000-0000-0000-0000000b1e04', '[]');
    raise exception 'FAIL: stranger could upload';
  exception when insufficient_privilege then null;
  end;
end $$;

-- B7. Bo's emergency, relayed by Cy, becomes a normal status tap with Bo's own id; once only.
do $$
declare t bigint := extract(epoch from now())::bigint - 10;
begin
  if bt_upload('00000000-0000-0000-0000-0000000b1e03', jsonb_build_array(
       bt_tap('00000000-0000-0000-0000-0000000b1e02', '0b0b0b0b-0000-4000-8000-0000000000e1', 'emergency', t))) <> 1 then
    raise exception 'FAIL: relayed emergency refused';
  end if;
  if (select status from rider_statuses where id = '0b0b0b0b-0000-4000-8000-0000000000e1') <> 'emergency'
     or (select user_id from rider_statuses where id = '0b0b0b0b-0000-4000-8000-0000000000e1') <> '00000000-0000-0000-0000-0000000b1e02' then
    raise exception 'FAIL: relayed emergency stored wrong';
  end if;
  if bt_upload('00000000-0000-0000-0000-0000000b1e01', jsonb_build_array(
       bt_tap('00000000-0000-0000-0000-0000000b1e02', '0b0b0b0b-0000-4000-8000-0000000000e1', 'emergency', t))) <> 0 then
    raise exception 'FAIL: the same tap counted twice';
  end if;
  -- A changed kind breaks the code; an unknown kind is skipped.
  if bt_upload('00000000-0000-0000-0000-0000000b1e01', jsonb_build_array(
       bt_tap('00000000-0000-0000-0000-0000000b1e02', '0b0b0b0b-0000-4000-8000-0000000000e2', 'ok', t) || '{"status":"emergency"}',
       bt_tap('00000000-0000-0000-0000-0000000b1e02', '0b0b0b0b-0000-4000-8000-0000000000e3', 'party', t))) <> 0 then
    raise exception 'FAIL: forged or unknown tap accepted';
  end if;
end $$;

-- B8. Once the ride ends nobody gets keys.
select as_user('00000000-0000-0000-0000-0000000b1e01');
set role authenticated;
select set_ride_status('0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b', 'ended');
do $$ begin
  begin
    perform bluetooth_ride_keys('0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b');
    raise exception 'FAIL: keys handed out after the ride ended';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

drop function bt_upload(uuid, jsonb);
drop function bt_tap(uuid, uuid, text, bigint);
drop function bt_spot(uuid, bigint, bigint, uuid);

select 'ALL BLUETOOTH SHARING TESTS PASSED';
