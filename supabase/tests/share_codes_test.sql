-- Custom share codes (20261101900000): riders type their own code for a ride, a riding group or
-- their friend link. Format and word rules, uniqueness regardless of case, the live check, who
-- may change a code, and that old codes keep working. Runs last (run_local.sh): as_user and
-- expect_refused come from privacy_test.sql, as_admin_session from admin_test.sql.
--
-- Riders (all new here):
--   Gus  0901  organizes the ride and owns the group
--   Hal  0902  joined Gus's ride as a rider
--   Ida  0903  a stranger
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000901', '{"full_name":"Gus Code"}'),
  ('00000000-0000-0000-0000-000000000902', '{"full_name":"Hal Code"}'),
  ('00000000-0000-0000-0000-000000000903', '{"full_name":"Ida Code"}');

-- S1. The rules: shape, reserved words (admins may use them) and blocked words.
do $$
declare
  c record;
begin
  for c in select * from (values
    ('MOAB-2026', null), ('moab-2026', null), ('  Moab-2026  ', null), ('7F3A9C21', null), ('A1B2C3D4E5', null),
    ('MOAB', 'too_short'), ('ABCDEFGHIJKLMNOPQRSTU', 'too_long'), ('MOAB 2026', 'bad_characters'), ('MOAB--2026', 'bad_characters'),
    ('-MOAB26', 'bad_characters'), ('MOAB26-', 'bad_characters'), ('MOAB_2026', 'bad_characters'), ('MÖAB-2026', 'bad_characters'),
    ('ONMYLEAD', 'reserved'), ('ONMYLEAD-CREW', 'reserved'), ('SUPPORT', 'reserved'), ('RUS-OFFROAD', 'reserved'),
    ('SHIT-RIDE', 'not_allowed'), ('5H1TRIDE', 'not_allowed'), ('RIDE-ASS', 'not_allowed'), ('BIG-D1CK', 'not_allowed'),
    ('MOAB-PASS', null), ('PEACOCK-RUN', null), ('ESSEX-RIDERS', null), ('GRAPE-VINE', null), ('CLASSIC-4X4', null)
  ) v(code, want) loop
    if share_code_problem(c.code) is distinct from c.want then
      raise exception 'FAIL: % should be %, got %', c.code, coalesce(c.want, 'fine'), coalesce(share_code_problem(c.code), 'fine');
    end if;
  end loop;
  if share_code_problem('ONMYLEAD-CREW', true) is not null then raise exception 'FAIL: admins may use brand words'; end if;
  if share_code_problem('SHIT-RIDE', true) is null then raise exception 'FAIL: admins still can''t use blocked words'; end if;
end $$;

-- S2. A ride created with a typed code keeps it in capitals; one without gets a made-up code.
select as_user('00000000-0000-0000-0000-000000000901');
set role authenticated;
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility, invite_code)
values ('09090909-0909-0909-0909-090909090901', auth.uid(), 'Moab Run', now() + interval '1 day', 38.5, -109.5, 'private', ' moab-run-26 ');
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility)
values ('09090909-0909-0909-0909-090909090902', auth.uid(), 'Plain Ride', now() + interval '2 days', 38.5, -109.5, 'public');
select expect_refused($q$insert into rides (organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility, invite_code)
  values (auth.uid(), 'Rude', now() + interval '1 day', 38.5, -109.5, 'public', 'FUCK-OFF')$q$, 'ride saved with a blocked code');
select expect_refused($q$insert into rides (organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility, invite_code)
  values (auth.uid(), 'Copy', now() + interval '1 day', 38.5, -109.5, 'public', 'Moab-Run-26')$q$, 'two rides with the same code (any case)');
select expect_refused($q$update rides set invite_code = 'NO' where id = '09090909-0909-0909-0909-090909090901'$q$, 'direct update to a bad code');
do $$ begin
  if (select invite_code from rides where id = '09090909-0909-0909-0909-090909090901') <> 'MOAB-RUN-26' then raise exception 'FAIL: typed code not kept in capitals'; end if;
  if (select invite_code from rides where id = '09090909-0909-0909-0909-090909090902') !~ '^[0-9A-F]{8}$' then raise exception 'FAIL: default code not made'; end if;
  if (select id from ride_preview('moab-run-26')) <> '09090909-0909-0909-0909-090909090901' then raise exception 'FAIL: lowercase link doesn''t open the ride'; end if;
end $$;

-- S3. The live check.
do $$ begin
  if share_code_status('ride', 'moab-run-26') <> 'taken' then raise exception 'FAIL: taken code'; end if;
  if share_code_status('ride', 'MOAB-RUN-26', '09090909-0909-0909-0909-090909090901') <> 'yours' then raise exception 'FAIL: own code'; end if;
  if share_code_status('ride', 'MOAB-RUN-27') <> 'available' then raise exception 'FAIL: free code'; end if;
  if share_code_status('ride', 'ONMYLEAD') <> 'reserved' then raise exception 'FAIL: reserved code'; end if;
  if share_code_status('group', 'MOAB-RUN-26') <> 'available' then raise exception 'FAIL: ride and group codes are separate'; end if;
end $$;
select expect_refused($q$select share_code_status('boat', 'MOAB-RUN-26')$q$, 'unknown kind');
reset role;
select as_user(null);
select expect_refused($q$select share_code_status('ride', 'MOAB-RUN-26')$q$, 'live check while signed out');

-- S4. Changing a ride's code: organizers yes, riders and strangers no. The old code stops working.
insert into ride_members (ride_id, user_id, role, status) values
  ('09090909-0909-0909-0909-090909090901', '00000000-0000-0000-0000-000000000902', 'rider', 'joined');
select as_user('00000000-0000-0000-0000-000000000902');
set role authenticated;
select expect_refused($q$select set_ride_code('09090909-0909-0909-0909-090909090901', 'HALS-RIDE')$q$, 'rider changed the ride''s code');
reset role;
select as_user('00000000-0000-0000-0000-000000000903');
set role authenticated;
select expect_refused($q$select set_ride_code('09090909-0909-0909-0909-090909090901', 'IDAS-RIDE')$q$, 'stranger changed the ride''s code');
reset role;
select as_user('00000000-0000-0000-0000-000000000901');
set role authenticated;
do $$
declare v_plain text := (select invite_code from rides where id = '09090909-0909-0909-0909-090909090902');
begin
  if set_ride_code('09090909-0909-0909-0909-090909090902', 'saturday-crew') <> 'SATURDAY-CREW' then raise exception 'FAIL: set_ride_code'; end if;
  if exists (select 1 from ride_preview(v_plain)) then raise exception 'FAIL: old code still opens the ride'; end if;
  if set_ride_code('09090909-0909-0909-0909-090909090902', 'SATURDAY-CREW') <> 'SATURDAY-CREW' then raise exception 'FAIL: same code again'; end if;
  begin
    perform set_ride_code('09090909-0909-0909-0909-090909090902', 'MOAB-RUN-26');
    raise exception 'FAIL: took another ride''s code';
  exception when others then
    if sqlerrm not like 'share_code_taken%' then raise; end if;
  end;
  begin
    perform set_ride_code('09090909-0909-0909-0909-090909090902', 'HELP');
    raise exception 'FAIL: saved a bad code';
  exception when others then
    if sqlerrm not like 'share_code_too_short%' then raise; end if;
  end;
end $$;
reset role;

-- S5. Riding group codes: created with one, changed by the owner only.
select as_user('00000000-0000-0000-0000-000000000901');
set role authenticated;
insert into riding_groups (id, owner_id, name, invite_code) values ('09090909-0909-0909-0909-0909090909a1', auth.uid(), 'Gus Crew', 'gus-crew');
do $$ begin
  if (select invite_code from riding_groups where id = '09090909-0909-0909-0909-0909090909a1') <> 'GUS-CREW' then raise exception 'FAIL: group code'; end if;
  if set_group_code('09090909-0909-0909-0909-0909090909a1', 'Gus-Crew-2') <> 'GUS-CREW-2' then raise exception 'FAIL: set_group_code'; end if;
  if (select name from group_preview('gus-crew-2')) <> 'Gus Crew' then raise exception 'FAIL: new group link'; end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-000000000903');
set role authenticated;
select expect_refused($q$select set_group_code('09090909-0909-0909-0909-0909090909a1', 'IDAS-CREW')$q$, 'stranger changed a group''s code');
reset role;

-- S6. Friend link codes.
select as_user('00000000-0000-0000-0000-000000000902');
set role authenticated;
do $$ begin
  if set_friend_code('hal-rides') <> 'HAL-RIDES' then raise exception 'FAIL: set_friend_code'; end if;
  if share_code_status('friend', 'HAL-RIDES') <> 'yours' then raise exception 'FAIL: own friend code'; end if;
  if my_friend_code() <> 'HAL-RIDES' then raise exception 'FAIL: my_friend_code after set'; end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-000000000903');
set role authenticated;
do $$ begin
  if share_code_status('friend', 'hal-rides') <> 'taken' then raise exception 'FAIL: taken friend code'; end if;
  if (select display_name from friend_preview('hal-rides')) <> 'Hal Code' then raise exception 'FAIL: custom friend link'; end if;
  begin
    perform set_friend_code('HAL-RIDES');
    raise exception 'FAIL: took another rider''s friend code';
  exception when others then
    if sqlerrm not like 'share_code_taken%' then raise; end if;
  end;
end $$;
reset role;

-- S7. Admins can reset a ride's code (logged), riders can't call it.
select as_user('00000000-0000-0000-0000-000000000901');
set role authenticated;
select expect_refused($q$select admin_reset_ride_code('09090909-0909-0909-0909-090909090901', 'not an admin')$q$, 'rider used the admin reset');
reset role;
select as_admin_session('00000000-0000-0000-0000-00000000ad01', 'aal2');
set role authenticated;
do $$
declare v_code text := admin_reset_ride_code('09090909-0909-0909-0909-090909090901', 'Rude code');
begin
  if v_code !~ '^[0-9A-F]{8}$' then raise exception 'FAIL: admin reset code'; end if;
  if exists (select 1 from ride_preview('MOAB-RUN-26')) then raise exception 'FAIL: old code after admin reset'; end if;
end $$;
reset role;
do $$ begin
  if not exists (select 1 from admin_audit_log where action = 'ride.reset_code' and target_id = '09090909-0909-0909-0909-090909090901') then
    raise exception 'FAIL: admin reset not logged';
  end if;
end $$;

select 'SHARE CODE TESTS PASSED';
