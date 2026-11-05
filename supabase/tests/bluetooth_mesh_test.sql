-- Bluetooth mesh and crew messaging (migration 20261104100000_bluetooth_mesh.sql): which relayed
-- messages and receipts the server accepts. Runs after bluetooth_sharing_test.sql, on its own ride.
--
-- Riders (all new here):
--   Eve  b1e11 organizer, relays for the others
--   Fay  b1e12 joined, sends from the back with no service
--   Gus  b1e13 joined, saw Fay's message
--   Hal  b1e14 a stranger
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000b1e11', '{"full_name":"Eve Gateway"}'),
  ('00000000-0000-0000-0000-0000000b1e12', '{"full_name":"Fay Back"}'),
  ('00000000-0000-0000-0000-0000000b1e13', '{"full_name":"Gus Middle"}'),
  ('00000000-0000-0000-0000-0000000b1e14', '{"full_name":"Hal Stranger"}');

select as_user('00000000-0000-0000-0000-0000000b1e11');
set role authenticated;
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility, max_vehicles)
values ('0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c', auth.uid(), 'Dead Zone Loop', now() + interval '1 hour', 38.5, -109.5, 'public', 6);
reset role;
select as_user('00000000-0000-0000-0000-0000000b1e12');
set role authenticated;
select join_ride('0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c');
reset role;
select as_user('00000000-0000-0000-0000-0000000b1e13');
set role authenticated;
select join_ride('0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c');
reset role;
select as_user('00000000-0000-0000-0000-0000000b1e11');
set role authenticated;
select set_ride_status('0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c', 'live');
reset role;
-- Everyone opened Ride Mode once with service: keys exist.
do $$
declare u uuid;
begin
  foreach u in array array['00000000-0000-0000-0000-0000000b1e11', '00000000-0000-0000-0000-0000000b1e12', '00000000-0000-0000-0000-0000000b1e13']::uuid[] loop
    perform as_user(u);
    execute 'set local role authenticated';
    perform bluetooth_ride_keys('0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c');
    execute 'reset role';
  end loop;
end $$;

-- Message and receipt JSON as core/nearby.ts uploadRow makes it, with the rider's code worked out here.
create function bm_key(p_user uuid) returns bytea language sql as $$
  select rider_key from ride_member_bluetooth_keys where ride_id = '0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c' and user_id = p_user;
$$;
create function bm_msg(p_user uuid, p_id uuid, p_body text, p_at bigint) returns jsonb language sql as $$
  select jsonb_build_object('k', 'r', 'user_id', p_user, 'id', p_id, 'body', p_body, 'at', p_at,
    'mac', bluetooth_mac(bm_key(p_user), 'r|0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c|' || p_user || '|' || p_id || '|' || p_body || '|' || p_at));
$$;
create function bm_ack(p_user uuid, p_id uuid, p_state int, p_at bigint) returns jsonb language sql as $$
  select jsonb_build_object('k', 'a', 'user_id', p_user, 'id', p_id, 'state', p_state, 'at', p_at,
    'mac', bluetooth_mac(bm_key(p_user), 'a|0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c|' || p_user || '|' || p_id || '|' || p_state || '|' || p_at));
$$;
create function bm_upload(p_as uuid, p_items jsonb) returns integer language plpgsql as $$
declare v integer;
begin
  perform as_user(p_as);
  execute 'set local role authenticated';
  v := bluetooth_relay_upload('0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c', p_items);
  execute 'reset role';
  return v;
end $$;

-- M0. The server's codes for a message and a receipt match the app's (same vectors as
-- core/__tests__/nearby.test.ts).
do $$ begin
  if bluetooth_mac(decode('020910171e252c333a41484f565d646b727980878e959ca3aab1b8bfc6cdd4db', 'hex'),
    'r|11111111-2222-4333-8444-555555555555|aaaaaaaa-0000-4000-8000-000000000001|cccccccc-0000-4000-8000-000000000003|On My Way|9')
    <> '8b2d5dcaa04a3c83d8c083335424750a' then
    raise exception 'FAIL: server message code differs from the app''s';
  end if;
  if bluetooth_mac(decode('020910171e252c333a41484f565d646b727980878e959ca3aab1b8bfc6cdd4db', 'hex'),
    'a|11111111-2222-4333-8444-555555555555|aaaaaaaa-0000-4000-8000-000000000001|cccccccc-0000-4000-8000-000000000003|2|9')
    <> 'e5e7ed8feb8d43beff6a2eb457a4f9a6' then
    raise exception 'FAIL: server receipt code differs from the app''s';
  end if;
end $$;

-- M1. Fay's message from the back, relayed by Eve, lands in the chat as Fay's quick reply with
-- Fay's own id and time; the same message again, from anyone, changes nothing.
do $$
declare t bigint := extract(epoch from now())::bigint - 40;
begin
  if bm_upload('00000000-0000-0000-0000-0000000b1e11', jsonb_build_array(
       bm_msg('00000000-0000-0000-0000-0000000b1e12', '0c0c0c0c-0000-4000-8000-0000000000a1', 'Flat tire, go on without me', t))) <> 1 then
    raise exception 'FAIL: good relayed message refused';
  end if;
  if not exists (
    select 1 from ride_messages where id = '0c0c0c0c-0000-4000-8000-0000000000a1' and ride_id = '0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c'
      and user_id = '00000000-0000-0000-0000-0000000b1e12' and kind = 'status' and body = 'Flat tire, go on without me'
      and sent_at = to_timestamp(t)
  ) then
    raise exception 'FAIL: relayed message stored wrong';
  end if;
  if bm_upload('00000000-0000-0000-0000-0000000b1e13', jsonb_build_array(
       bm_msg('00000000-0000-0000-0000-0000000b1e12', '0c0c0c0c-0000-4000-8000-0000000000a1', 'Flat tire, go on without me', t))) <> 0 then
    raise exception 'FAIL: the same message counted twice';
  end if;
  if (select count(*) from ride_messages where ride_id = '0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c') <> 1 then
    raise exception 'FAIL: duplicate message row';
  end if;
end $$;

-- M2. Nobody can put words in Fay's mouth: a changed text, someone else's key, a wrong code, an
-- empty text, an unknown id shape, and a message from a stranger are all skipped.
do $$
declare t bigint := extract(epoch from now())::bigint - 20;
begin
  if bm_upload('00000000-0000-0000-0000-0000000b1e11', jsonb_build_array(
       bm_msg('00000000-0000-0000-0000-0000000b1e12', '0c0c0c0c-0000-4000-8000-0000000000a2', 'Go on', t) || '{"body":"Go on, I quit"}',
       bm_msg('00000000-0000-0000-0000-0000000b1e13', '0c0c0c0c-0000-4000-8000-0000000000a3', 'Hi', t) || jsonb_build_object('user_id', '00000000-0000-0000-0000-0000000b1e12'),
       bm_msg('00000000-0000-0000-0000-0000000b1e12', '0c0c0c0c-0000-4000-8000-0000000000a4', 'Hi', t) || '{"mac":"00000000000000000000000000000000"}',
       bm_msg('00000000-0000-0000-0000-0000000b1e12', '0c0c0c0c-0000-4000-8000-0000000000a5', '', t),
       bm_msg('00000000-0000-0000-0000-0000000b1e12', '0c0c0c0c-0000-4000-8000-0000000000a6', 'Hi', t) || '{"id":"nope"}',
       bm_msg('00000000-0000-0000-0000-0000000b1e12', '0c0c0c0c-0000-4000-8000-0000000000a7', 'Hi', t + 3600),
       jsonb_build_object('k', 'r', 'user_id', '00000000-0000-0000-0000-0000000b1e14', 'id', '0c0c0c0c-0000-4000-8000-0000000000a8', 'body', 'Hi', 'at', t, 'mac', 'ff'))) <> 0 then
    raise exception 'FAIL: forged message accepted';
  end if;
  if (select count(*) from ride_messages where ride_id = '0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c') <> 1 then
    raise exception 'FAIL: forged message stored';
  end if;
  -- Nobody relays their own message: the phone sends it itself.
  if bm_upload('00000000-0000-0000-0000-0000000b1e12', jsonb_build_array(
       bm_msg('00000000-0000-0000-0000-0000000b1e12', '0c0c0c0c-0000-4000-8000-0000000000a9', 'Me', t))) <> 0 then
    raise exception 'FAIL: own message accepted through the relay';
  end if;
end $$;

-- M3. Gus saw Fay's message (over Bluetooth, no service); Eve relays the receipt: Fay's card shows
-- Seen by Gus. "Got it" (state 1) stays on the phones; a receipt from Fay for her own message, or
-- for an unknown item, is skipped; a second "seen" keeps the first time.
do $$
declare t bigint := extract(epoch from now())::bigint - 10;
begin
  if bm_upload('00000000-0000-0000-0000-0000000b1e11', jsonb_build_array(
       bm_ack('00000000-0000-0000-0000-0000000b1e13', '0c0c0c0c-0000-4000-8000-0000000000a1', 1, t))) <> 0 then
    raise exception 'FAIL: a got-it receipt reached the server';
  end if;
  if bm_upload('00000000-0000-0000-0000-0000000b1e11', jsonb_build_array(
       bm_ack('00000000-0000-0000-0000-0000000b1e13', '0c0c0c0c-0000-4000-8000-0000000000a1', 2, t))) <> 1 then
    raise exception 'FAIL: good relayed receipt refused';
  end if;
  if not exists (
    select 1 from ride_receipts where item_id = '0c0c0c0c-0000-4000-8000-0000000000a1' and user_id = '00000000-0000-0000-0000-0000000b1e13'
      and sender_id = '00000000-0000-0000-0000-0000000b1e12' and seen_at = to_timestamp(t)
  ) then
    raise exception 'FAIL: relayed receipt stored wrong';
  end if;
  if bm_upload('00000000-0000-0000-0000-0000000b1e11', jsonb_build_array(
       bm_ack('00000000-0000-0000-0000-0000000b1e13', '0c0c0c0c-0000-4000-8000-0000000000a1', 2, t + 5),
       bm_ack('00000000-0000-0000-0000-0000000b1e12', '0c0c0c0c-0000-4000-8000-0000000000a1', 2, t),
       bm_ack('00000000-0000-0000-0000-0000000b1e13', '0c0c0c0c-0000-4000-8000-0000000000a2', 2, t),
       bm_ack('00000000-0000-0000-0000-0000000b1e13', '0c0c0c0c-0000-4000-8000-0000000000a1', 2, t) || '{"state":1}',
       bm_ack('00000000-0000-0000-0000-0000000b1e12', '0c0c0c0c-0000-4000-8000-0000000000a1', 2, t) || jsonb_build_object('user_id', '00000000-0000-0000-0000-0000000b1e13'))) <> 0 then
    raise exception 'FAIL: bad receipt accepted';
  end if;
  if (select seen_at from ride_receipts where item_id = '0c0c0c0c-0000-4000-8000-0000000000a1' and user_id = '00000000-0000-0000-0000-0000000b1e13') <> to_timestamp(t) then
    raise exception 'FAIL: first seen time lost';
  end if;
  -- Only the sender reads it.
  perform as_user('00000000-0000-0000-0000-0000000b1e12');
  execute 'set local role authenticated';
  if (select count(*) from ride_receipts where item_id = '0c0c0c0c-0000-4000-8000-0000000000a1') <> 1 then
    raise exception 'FAIL: sender cannot read the relayed receipt';
  end if;
  execute 'reset role';
  perform as_user('00000000-0000-0000-0000-0000000b1e13');
  execute 'set local role authenticated';
  if (select count(*) from ride_receipts where item_id = '0c0c0c0c-0000-4000-8000-0000000000a1') <> 0 then
    raise exception 'FAIL: receipt readable by someone else';
  end if;
  execute 'reset role';
end $$;

-- M4. A receipt for a status tap works the same, and the cancelled tap gets none.
do $$
declare t bigint := extract(epoch from now())::bigint - 5;
begin
  perform as_user('00000000-0000-0000-0000-0000000b1e12');
  execute 'set local role authenticated';
  insert into rider_statuses (id, ride_id, user_id, status, tapped_at)
  values ('0c0c0c0c-0000-4000-8000-0000000000b1', '0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c', auth.uid(), 'stuck', to_timestamp(t));
  insert into rider_statuses (id, ride_id, user_id, status, tapped_at, cancelled_at)
  values ('0c0c0c0c-0000-4000-8000-0000000000b2', '0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c', auth.uid(), 'lost', to_timestamp(t), now());
  execute 'reset role';
  if bm_upload('00000000-0000-0000-0000-0000000b1e11', jsonb_build_array(
       bm_ack('00000000-0000-0000-0000-0000000b1e13', '0c0c0c0c-0000-4000-8000-0000000000b1', 2, t),
       bm_ack('00000000-0000-0000-0000-0000000b1e13', '0c0c0c0c-0000-4000-8000-0000000000b2', 2, t))) <> 1 then
    raise exception 'FAIL: receipt for a status tap wrong';
  end if;
  if exists (select 1 from ride_receipts where item_id = '0c0c0c0c-0000-4000-8000-0000000000b2') then
    raise exception 'FAIL: receipt stored for a cancelled tap';
  end if;
end $$;

-- M5. A stranger can't upload at all.
do $$ begin
  begin
    perform bm_upload('00000000-0000-0000-0000-0000000b1e14', '[]');
    raise exception 'FAIL: stranger could upload';
  exception when insufficient_privilege then null;
  end;
end $$;

-- M6. One bad item (a time far out of range) skips only that item; the rest of the upload lands.
do $$
declare t bigint := extract(epoch from now())::bigint - 10;
begin
  if bm_upload('00000000-0000-0000-0000-0000000b1e11', jsonb_build_array(
       jsonb_build_object('k', 'r', 'user_id', '00000000-0000-0000-0000-0000000b1e12', 'id', '0c0c0c0c-0000-4000-8000-0000000000b1',
         'body', 'Bad clock', 'at', 999999999999999999, 'mac', 'ff'),
       bm_msg('00000000-0000-0000-0000-0000000b1e12', '0c0c0c0c-0000-4000-8000-0000000000b2', 'Still here', t))) <> 1 then
    raise exception 'FAIL: one bad item failed the whole upload';
  end if;
  if not exists (select 1 from ride_messages where id = '0c0c0c0c-0000-4000-8000-0000000000b2') then
    raise exception 'FAIL: the good message after a bad one was lost';
  end if;
end $$;

drop function bm_upload(uuid, jsonb);
drop function bm_ack(uuid, uuid, int, bigint);
drop function bm_msg(uuid, uuid, text, bigint);
drop function bm_key(uuid);
