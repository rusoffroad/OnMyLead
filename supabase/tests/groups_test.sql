-- Saved riding groups, group invites to rides, and Follow This Leader.
-- Runs after privacy_test.sql (run_local.sh), which sets up as_user, expect_refused and the
-- pg_net / Vault stand-ins that let push events be read back from net.calls.
-- Each block raises an exception if a privacy or invite rule is broken.

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', '{"full_name":"Eve Leader"}'),
  ('00000000-0000-0000-0000-0000000000f1', '{"full_name":"Finn Friend"}'),
  ('00000000-0000-0000-0000-0000000000a1', '{"full_name":"Gus Stranger"}'),
  ('00000000-0000-0000-0000-0000000000b1', '{"full_name":"Hana New"}');

-- Eve's private ride; Finn joins with the code, so they have ridden together.
select as_user('00000000-0000-0000-0000-0000000000e1');
set role authenticated;
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility, invite_code)
values ('21212121-2121-2121-2121-212121212121', auth.uid(), 'Last weekend', now() + interval '1 hour', 38.5, -109.5, 'private', 'LASTWKND');
insert into ride_private_details (ride_id, meet_lat, meet_lng) values ('21212121-2121-2121-2121-212121212121', 38.51, -109.51);
reset role;
select as_user('00000000-0000-0000-0000-0000000000f1');
set role authenticated;
select join_ride(p_invite_code => 'lastwknd');
reset role;

-- G1. Eve saves a group and adds Finn. Gus, whom she has never ridden with, can't be added.
select as_user('00000000-0000-0000-0000-0000000000e1');
set role authenticated;
insert into riding_groups (id, owner_id, name, invite_code)
values ('31313131-3131-3131-3131-313131313131', auth.uid(), 'Saturday Crew', 'CREWLINK01');
-- The app creates a group with insert ... returning (supabase-js .insert().select().single()),
-- so the owner must be able to read back the row in the same statement.
do $$
declare v_id uuid;
begin
  insert into riding_groups (owner_id, name) values (auth.uid(), 'Returning Crew') returning id into v_id;
  if v_id is null then raise exception 'FAIL: owner could not read back the group they just made'; end if;
  delete from riding_groups where id = v_id;
end $$;
do $$ begin
  if add_group_members('31313131-3131-3131-3131-313131313131', array['00000000-0000-0000-0000-0000000000f1'::uuid]) <> 1 then
    raise exception 'FAIL: owner could not add a riding friend';
  end if;
end $$;
select expect_refused(
  $q$select add_group_members('31313131-3131-3131-3131-313131313131', array['00000000-0000-0000-0000-0000000000a1'::uuid])$q$,
  'owner added a stranger they never rode with');
reset role;

-- G2. Nobody else can see the group, add themselves directly, or make a group for someone else.
select as_user('00000000-0000-0000-0000-0000000000a1');
set role authenticated;
do $$ begin
  if (select count(*) from riding_groups) <> 0 or (select count(*) from riding_group_members) <> 0 then
    raise exception 'FAIL: stranger saw a riding group or its members';
  end if;
end $$;
select expect_refused(
  $q$insert into riding_group_members (group_id, user_id) values ('31313131-3131-3131-3131-313131313131', '00000000-0000-0000-0000-0000000000a1')$q$,
  'stranger added themselves to a group directly');
select expect_refused(
  $q$insert into riding_groups (owner_id, name) values ('00000000-0000-0000-0000-0000000000e1', 'Fake')$q$,
  'made a group owned by someone else');
select expect_refused(
  $q$select add_group_members('31313131-3131-3131-3131-313131313131', array['00000000-0000-0000-0000-0000000000a1'::uuid])$q$,
  'non-owner added riders');
update riding_groups set name = 'Hijacked' where id = '31313131-3131-3131-3131-313131313131';
delete from riding_groups where id = '31313131-3131-3131-3131-313131313131';
do $$ begin
  if (select count(*) from group_preview('NOPE')) <> 0 then raise exception 'FAIL: preview for a wrong code'; end if;
end $$;
reset role;
do $$ begin
  if (select name from riding_groups where id = '31313131-3131-3131-3131-313131313131') <> 'Saturday Crew' then
    raise exception 'FAIL: stranger renamed or deleted the group';
  end if;
end $$;

-- G3. Hana, not on any ride yet, joins with the group link. The preview shows only the name,
-- who runs it and how many ride in it.
select as_user('00000000-0000-0000-0000-0000000000b1');
set role authenticated;
do $$
declare p record;
begin
  select * into p from group_preview('crewlink01');
  if p.name <> 'Saturday Crew' or p.owner_name <> 'Eve Leader' or p.riders <> 2 or p.is_member then
    raise exception 'FAIL: group preview %', row_to_json(p);
  end if;
  perform join_group('crewlink01');
  if (select count(*) from riding_group_members where group_id = '31313131-3131-3131-3131-313131313131') <> 2 then
    raise exception 'FAIL: member did not see the other members after joining by link';
  end if;
  if not (select is_member from group_preview('CREWLINK01')) then raise exception 'FAIL: preview did not show membership'; end if;
end $$;
reset role;
select as_user(null);
set role anon;
do $$ begin
  if (select riders from group_preview('CREWLINK01')) <> 3 then raise exception 'FAIL: signed-out link preview'; end if;
end $$;
select expect_refused($q$select join_group('CREWLINK01')$q$, 'signed-out visitor joined a group');
reset role;

-- G4. Eve invites the whole group to a new approval-only public ride in one go.
select as_user('00000000-0000-0000-0000-0000000000e1');
set role authenticated;
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility, join_policy, invite_code)
values ('22222222-3333-4444-5555-666666666666', auth.uid(), 'Crew ride', now() + interval '3 days', 38.5, -109.5, 'private', 'approval', 'CREWRIDE');
insert into ride_private_details (ride_id, meet_lat, meet_lng) values ('22222222-3333-4444-5555-666666666666', 38.52, -109.52);
do $$ begin
  if invite_group_to_ride('22222222-3333-4444-5555-666666666666', '31313131-3131-3131-3131-313131313131') <> 2 then
    raise exception 'FAIL: group invite did not invite both riders';
  end if;
  if invite_group_to_ride('22222222-3333-4444-5555-666666666666', '31313131-3131-3131-3131-313131313131') <> 0 then
    raise exception 'FAIL: inviting again re-invited riders';
  end if;
end $$;
-- An invitation isn't a yes: the organizer can't mark an invited rider as going.
select expect_refused(
  $q$update ride_members set status = 'joined' where ride_id = '22222222-3333-4444-5555-666666666666' and user_id = '00000000-0000-0000-0000-0000000000b1'$q$,
  'organizer turned an invitation into a yes');
reset role;

-- G5. Only the ride's organizers can invite a group, and only a group they are in.
select as_user('00000000-0000-0000-0000-0000000000f1');
set role authenticated;
select expect_refused(
  $q$select invite_group_to_ride('22222222-3333-4444-5555-666666666666', '31313131-3131-3131-3131-313131313131')$q$,
  'a rider who does not organize the ride invited a group');
reset role;
select as_user('00000000-0000-0000-0000-0000000000a1');
set role authenticated;
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility)
values ('23232323-2323-2323-2323-232323232323', auth.uid(), 'Gus ride', now() + interval '2 days', 38.5, -109.5, 'public');
select expect_refused(
  $q$select invite_group_to_ride('23232323-2323-2323-2323-232323232323', '31313131-3131-3131-3131-313131313131')$q$,
  'someone outside the group invited it to their ride');
-- And Gus can't see the private crew ride or who was invited.
do $$ begin
  if exists (select 1 from rides where id = '22222222-3333-4444-5555-666666666666')
     or exists (select 1 from ride_members where ride_id = '22222222-3333-4444-5555-666666666666') then
    raise exception 'FAIL: stranger saw a private ride or its invitations';
  end if;
end $$;
reset role;

-- G6. Invited riders see the ride but not the meeting point; they join without waiting for
-- approval, or say no thanks.
select as_user('00000000-0000-0000-0000-0000000000b1');
set role authenticated;
do $$ begin
  if not exists (select 1 from rides where id = '22222222-3333-4444-5555-666666666666') then
    raise exception 'FAIL: invited rider could not see the ride';
  end if;
  if exists (select 1 from ride_private_details where ride_id = '22222222-3333-4444-5555-666666666666') then
    raise exception 'FAIL: invited rider saw the meeting point before joining';
  end if;
  if join_ride('22222222-3333-4444-5555-666666666666') <> 'joined' then
    raise exception 'FAIL: invited rider not let straight in';
  end if;
  if not exists (select 1 from ride_private_details where ride_id = '22222222-3333-4444-5555-666666666666') then
    raise exception 'FAIL: joined rider still missing the meeting point';
  end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-0000000000f1');
set role authenticated;
select decline_ride_invite('22222222-3333-4444-5555-666666666666');
reset role;
select as_user('00000000-0000-0000-0000-0000000000e1');
set role authenticated;
do $$ begin
  if (select status from ride_members where ride_id = '22222222-3333-4444-5555-666666666666' and user_id = '00000000-0000-0000-0000-0000000000f1') <> 'declined' then
    raise exception 'FAIL: no thanks not recorded';
  end if;
  if invite_group_to_ride('22222222-3333-4444-5555-666666666666', '31313131-3131-3131-3131-313131313131') <> 0 then
    raise exception 'FAIL: group invite re-invited someone who said no thanks';
  end if;
end $$;
reset role;

-- G7. Follow This Leader. Gus can't follow Eve while she only leads private rides he can't see;
-- Finn, who rode with her, can.
select as_user('00000000-0000-0000-0000-0000000000a1');
set role authenticated;
select expect_refused($q$select follow_leader('00000000-0000-0000-0000-0000000000e1')$q$, 'followed a leader of only hidden rides');
select expect_refused(
  $q$insert into leader_follows (follower_id, leader_id) values (auth.uid(), '00000000-0000-0000-0000-0000000000e1')$q$,
  'follow written directly');
reset role;
select as_user('00000000-0000-0000-0000-0000000000f1');
set role authenticated;
select follow_leader('00000000-0000-0000-0000-0000000000e1');
select expect_refused($q$select follow_leader(auth.uid())$q$, 'followed themselves');
reset role;

-- G8. Eve posts a public ride: now Gus can follow her too. Her followers hear about it.
select as_user('00000000-0000-0000-0000-0000000000f1');
set role authenticated;
select register_push_token('finn-phone-000000000000000', 'ios');
reset role;
select as_user('00000000-0000-0000-0000-0000000000a1');
set role authenticated;
select register_push_token('gus-phone-0000000000000000', 'ios');
reset role;
truncate net.calls;
select as_user('00000000-0000-0000-0000-0000000000e1');
set role authenticated;
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility)
values ('24242424-2424-2424-2424-242424242424', auth.uid(), 'Open Sunday', now() + interval '4 days', 38.5, -109.5, 'public');
reset role;
do $$ begin
  if last_push() ->> 'type' <> 'leader_ride' then raise exception 'FAIL: new public ride not queued for followers'; end if;
end $$;
select as_user('00000000-0000-0000-0000-0000000000a1');
set role authenticated;
select follow_leader('00000000-0000-0000-0000-0000000000e1');
do $$ begin
  if (select count(*) from leader_follows) <> 1 then raise exception 'FAIL: follower saw someone else''s follow'; end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-0000000000e1');
set role authenticated;
do $$ begin
  if (select count(*) from leader_follows where leader_id = auth.uid()) <> 2 then raise exception 'FAIL: leader could not see their followers'; end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-0000000000b1');
set role authenticated;
do $$ begin
  if (select count(*) from leader_follows) <> 0 then raise exception 'FAIL: outsider saw who follows whom'; end if;
end $$;
reset role;

do $$
declare rows text[];
begin
  select array_agg(token order by token) into rows from push_batch_social('{"type":"leader_ride","id":"24242424-2424-2424-2424-242424242424"}');
  if rows is distinct from array['finn-phone-000000000000000', 'gus-phone-0000000000000000'] then
    raise exception 'FAIL: followers to notify %', rows;
  end if;
  if (select title from push_batch_social('{"type":"leader_ride","id":"24242424-2424-2424-2424-242424242424"}') limit 1) <> 'New ride from Eve Leader' then
    raise exception 'FAIL: followed leader title';
  end if;
  -- Private rides are never announced to followers.
  if exists (select 1 from push_batch_social('{"type":"leader_ride","id":"22222222-3333-4444-5555-666666666666"}')) then
    raise exception 'FAIL: private ride announced to followers';
  end if;
end $$;

-- Gus switches off "Leaders You Follow"; Finn turns on quiet hours around the clock.
select as_user('00000000-0000-0000-0000-0000000000a1');
set role authenticated;
insert into notification_settings (user_id, followed_leaders) values (auth.uid(), false);
reset role;
do $$ begin
  if (select array_agg(token) from push_batch_social('{"type":"leader_ride","id":"24242424-2424-2424-2424-242424242424"}'))
     is distinct from array['finn-phone-000000000000000'] then
    raise exception 'FAIL: followed leaders switch ignored';
  end if;
end $$;
select as_user('00000000-0000-0000-0000-0000000000f1');
set role authenticated;
insert into notification_settings (user_id, quiet_hours, quiet_start, quiet_end) values (auth.uid(), true, 0, 1439);
reset role;
do $$ begin
  if exists (select 1 from push_batch_social('{"type":"leader_ride","id":"24242424-2424-2424-2424-242424242424"}')) then
    raise exception 'FAIL: quiet hours ignored for followed leaders';
  end if;
end $$;
select as_user('00000000-0000-0000-0000-0000000000f1');
set role authenticated;
update notification_settings set quiet_hours = false where user_id = auth.uid();
reset role;

-- G9. Invite pushes: queued for each invited rider, sent only while still invited.
select as_user('00000000-0000-0000-0000-0000000000e1');
set role authenticated;
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility, invite_code)
values ('25252525-2525-2525-2525-252525252525', auth.uid(), 'Night run', now() + interval '5 days', 38.5, -109.5, 'private', 'NIGHTRUN');
reset role;
truncate net.calls;
set role authenticated;
select invite_group_to_ride('25252525-2525-2525-2525-252525252525', '31313131-3131-3131-3131-313131313131');
reset role;
do $$
declare finn constant jsonb := '{"type":"invite","ride":"25252525-2525-2525-2525-252525252525","user":"00000000-0000-0000-0000-0000000000f1","actor":"00000000-0000-0000-0000-0000000000e1"}';
begin
  if (select count(*) from net.calls where body ->> 'type' = 'invite') <> 2 then
    raise exception 'FAIL: group invite not queued once per rider';
  end if;
  if (select title from push_batch_social(finn)) <> 'Eve Leader invited you to Night run' then
    raise exception 'FAIL: invite title';
  end if;
  if (select data ->> 'inviteCode' from push_batch_social(finn)) <> 'NIGHTRUN' then
    raise exception 'FAIL: invite push does not open the ride';
  end if;
end $$;
select as_user('00000000-0000-0000-0000-0000000000f1');
set role authenticated;
select expect_refused($q$select * from push_batch_social('{"type":"leader_ride"}')$q$, 'rider called push_batch_social');
insert into notification_settings (user_id, ride_invites) values (auth.uid(), false)
  on conflict (user_id) do update set ride_invites = false;
reset role;
do $$ begin
  if exists (select 1 from push_batch_social('{"type":"invite","ride":"25252525-2525-2525-2525-252525252525","user":"00000000-0000-0000-0000-0000000000f1"}')) then
    raise exception 'FAIL: ride invites switch ignored';
  end if;
end $$;
select as_user('00000000-0000-0000-0000-0000000000f1');
set role authenticated;
update notification_settings set ride_invites = true where user_id = auth.uid();
select join_ride('25252525-2525-2525-2525-252525252525');
reset role;
do $$ begin
  if exists (select 1 from push_batch_social('{"type":"invite","ride":"25252525-2525-2525-2525-252525252525","user":"00000000-0000-0000-0000-0000000000f1"}')) then
    raise exception 'FAIL: invite push sent after the rider already joined';
  end if;
end $$;

-- G10. Leaving and removing. A member leaves; only the owner removes others or deletes the group.
select as_user('00000000-0000-0000-0000-0000000000f1');
set role authenticated;
delete from riding_group_members where user_id = '00000000-0000-0000-0000-0000000000b1';
delete from riding_groups where id = '31313131-3131-3131-3131-313131313131';
reset role;
do $$ begin
  if (select count(*) from riding_group_members where group_id = '31313131-3131-3131-3131-313131313131') <> 2
     or not exists (select 1 from riding_groups where id = '31313131-3131-3131-3131-313131313131') then
    raise exception 'FAIL: a member removed someone else or deleted the group';
  end if;
end $$;
select as_user('00000000-0000-0000-0000-0000000000b1');
set role authenticated;
delete from riding_group_members where user_id = auth.uid();
do $$ begin
  if exists (select 1 from riding_groups) then raise exception 'FAIL: still saw the group after leaving'; end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-0000000000e1');
set role authenticated;
do $$ begin
  if reset_group_link('31313131-3131-3131-3131-313131313131') = 'CREWLINK01' then raise exception 'FAIL: link not reset'; end if;
end $$;
delete from riding_group_members where user_id = '00000000-0000-0000-0000-0000000000f1';
delete from riding_groups where id = '31313131-3131-3131-3131-313131313131';
reset role;
do $$ begin
  if exists (select 1 from riding_groups where id = '31313131-3131-3131-3131-313131313131') then
    raise exception 'FAIL: owner could not delete the group';
  end if;
end $$;
select as_user('00000000-0000-0000-0000-0000000000b1');
set role authenticated;
select expect_refused($q$select join_group('CREWLINK01')$q$, 'old group link still worked');
reset role;

select 'ALL RIDING GROUP, GROUP INVITE AND FOLLOW TESTS PASSED' as result;
