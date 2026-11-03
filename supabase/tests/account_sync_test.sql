-- Sync across devices (migration 20261103300000_account_sync.sql): settings merge setting by
-- setting with the newer change winning, trail backups keep the newer copy and tombstones, and
-- nobody but the rider can read or write either. Runs after privacy_test.sql (run_local.sh):
-- as_user and expect_refused come from there.
--
-- Riders (new here):
--   Sam  0c01  syncs from an iPhone and an iPad
--   Tia  0c02  another rider, who must never see Sam's
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000c01', 'sam@example.com'),
  ('00000000-0000-0000-0000-000000000c02', 'tia@example.com');

-- S1. Signed out: nothing.
select as_user(null);
set role anon;
select expect_refused($q$select sync_rider_settings('{}')$q$, 'anon synced settings');
select expect_refused($q$select backup_trail('t1', '{"id":"t1","points":[]}', now())$q$, 'anon backed up a trail');
select expect_refused($q$select * from rider_settings$q$, 'anon read settings');
reset role;

-- S2. Sam's iPhone sends two settings; the iPad reads them back.
select as_user('00000000-0000-0000-0000-000000000c01');
set role authenticated;
do $$
declare m jsonb;
begin
  m := sync_rider_settings('{"map.followMe.v1":{"v":"0","at":1000},"directions.app.v1":{"v":"google","at":1000}}');
  if m #>> '{map.followMe.v1,v}' <> '0' or m #>> '{directions.app.v1,v}' <> 'google' then raise exception 'FAIL: first sync %', m; end if;
  m := sync_rider_settings();
  if (select count(*) from jsonb_object_keys(m)) <> 2 then raise exception 'FAIL: read back %', m; end if;
end $$;

-- S3. Newer wins per setting: the iPad's older Follow Me change loses, its newer map style is kept,
-- and the iPhone's directions choice is untouched.
do $$
declare m jsonb;
begin
  m := sync_rider_settings('{"map.followMe.v1":{"v":"1","at":500},"map.layers.v1":{"v":"{\"base\":\"topo\"}","at":2000}}');
  if m #>> '{map.followMe.v1,v}' <> '0' then raise exception 'FAIL: older change won'; end if;
  if m #>> '{map.layers.v1,v}' <> '{"base":"topo"}' then raise exception 'FAIL: newer change lost'; end if;
  if m #>> '{directions.app.v1,v}' <> 'google' then raise exception 'FAIL: untouched setting changed'; end if;
  -- Same time: the larger value wins, the same on every device.
  m := sync_rider_settings('{"directions.app.v1":{"v":"apple","at":1000}}');
  if m #>> '{directions.app.v1,v}' <> 'google' then raise exception 'FAIL: tie not stable'; end if;
  -- Cleared settings sync as null.
  m := sync_rider_settings('{"directions.app.v1":{"v":null,"at":3000}}');
  if m -> 'directions.app.v1' -> 'v' <> 'null'::jsonb then raise exception 'FAIL: clear %', m; end if;
end $$;

-- S4. Bad input is skipped, not stored; a clock far ahead is capped.
do $$
declare m jsonb; capped bigint;
begin
  m := sync_rider_settings(jsonb_build_object(
    'bad key!', jsonb_build_object('v', 'x', 'at', 1),
    'no.time', jsonb_build_object('v', 'x'),
    'not.text', jsonb_build_object('v', 5, 'at', 1),
    'too.long', jsonb_build_object('v', repeat('x', 20001), 'at', 1),
    'future.clock', jsonb_build_object('v', 'x', 'at', 99999999999999)));
  if m ? 'bad key!' or m ? 'no.time' or m ? 'not.text' or m ? 'too.long' then raise exception 'FAIL: bad input kept %', m; end if;
  capped := (m #>> '{future.clock,at}')::bigint;
  if capped > (extract(epoch from now()) * 1000)::bigint + 120000 then raise exception 'FAIL: clock not capped'; end if;
end $$;
select expect_refused($q$select sync_rider_settings('[1]')$q$, 'array accepted');
-- No direct writes: only the function. (The tests grant every table to authenticated, so
-- row-level security is what stops these here; on Supabase the revoke stops them first.)
update rider_settings set settings = '{}';
delete from rider_settings;
do $$ begin
  if (select settings ->> 'map.followMe.v1' from rider_settings) is null then raise exception 'FAIL: direct settings update'; end if;
end $$;
select expect_refused($q$insert into rider_settings (user_id) values (auth.uid())$q$, 'direct settings insert');
reset role;

-- S5. Tia sees none of Sam's settings and starts empty.
select as_user('00000000-0000-0000-0000-000000000c02');
set role authenticated;
do $$ begin
  if (select count(*) from rider_settings) <> 0 then raise exception 'FAIL: Tia read a settings row'; end if;
  if sync_rider_settings() <> '{}'::jsonb then raise exception 'FAIL: Tia got settings'; end if;
  if (select count(*) from rider_settings) <> 1 then raise exception 'FAIL: Tia cannot read her own'; end if;
end $$;
reset role;

-- T1. Sam backs up a trail; a newer copy replaces it, an older one does not.
select as_user('00000000-0000-0000-0000-000000000c01');
set role authenticated;
do $$ begin
  if not backup_trail('t1', '{"id":"t1","points":[[38.5,-109.5,null,0]],"photos":[]}', '2026-01-01T10:00:00Z') then raise exception 'FAIL: first backup'; end if;
  if not backup_trail('t1', '{"id":"t1","points":[],"photos":[],"v":2}', '2026-01-01T11:00:00Z') then raise exception 'FAIL: newer backup'; end if;
  if backup_trail('t1', '{"id":"t1","points":[],"photos":[],"v":0}', '2026-01-01T09:00:00Z') then raise exception 'FAIL: older backup kept'; end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-000000000c01');
set role authenticated;
do $$ begin
  if (select data ->> 'v' from rider_trail_backups where trail_id = 't1') <> '2' then raise exception 'FAIL: wrong copy kept'; end if;
end $$;
-- T2. Deleting leaves a tombstone; an older save from a slow device can't bring it back.
do $$ begin
  perform backup_trail('t2', '{"id":"t2","points":[],"photos":[]}', now() - interval '2 hours');
  if not backup_trail('t2', null, now() - interval '1 hour') then raise exception 'FAIL: delete'; end if;
  if backup_trail('t2', '{"id":"t2","points":[],"photos":[]}', now() - interval '90 minutes') then raise exception 'FAIL: old copy undeleted'; end if;
  if not (select deleted and data is null from rider_trail_backups where trail_id = 't2') then raise exception 'FAIL: tombstone'; end if;
end $$;
select expect_refused($q$select backup_trail('t3', '[1]', now())$q$, 'array trail');
select expect_refused($q$select backup_trail('', '{}', now())$q$, 'empty trail id');
update rider_trail_backups set data = '{"id":"t1","points":[],"photos":[],"v":9}' where trail_id = 't1';
do $$ begin
  if (select data ->> 'v' from rider_trail_backups where trail_id = 't1') <> '2' then raise exception 'FAIL: direct backup update'; end if;
end $$;
select expect_refused($q$insert into rider_trail_backups (user_id, trail_id, data, updated_at) values (auth.uid(), 'x', '{}', now())$q$, 'direct backup insert');
reset role;

-- T3. Tia sees none of Sam's trails, and her backup of the same trail id is her own row.
select as_user('00000000-0000-0000-0000-000000000c02');
set role authenticated;
do $$ begin
  if (select count(*) from rider_trail_backups) <> 0 then raise exception 'FAIL: Tia read Sam''s trails'; end if;
  perform backup_trail('t1', '{"id":"t1","points":[],"photos":[]}', now());
  if (select count(*) from rider_trail_backups) <> 1 then raise exception 'FAIL: Tia''s own backup'; end if;
end $$;
reset role;
do $$ begin
  if (select data ->> 'v' from rider_trail_backups where user_id = '00000000-0000-0000-0000-000000000c01' and trail_id = 't1') <> '2' then
    raise exception 'FAIL: Tia overwrote Sam''s trail';
  end if;
end $$;

-- T4. Deleting the account removes the settings and backups.
delete from auth.users where id = '00000000-0000-0000-0000-000000000c01';
do $$ begin
  if exists (select 1 from rider_settings where user_id = '00000000-0000-0000-0000-000000000c01') then raise exception 'FAIL: settings outlived the account'; end if;
  if exists (select 1 from rider_trail_backups where user_id = '00000000-0000-0000-0000-000000000c01') then raise exception 'FAIL: trails outlived the account'; end if;
end $$;

select 'ALL ACCOUNT SYNC TESTS PASSED';
