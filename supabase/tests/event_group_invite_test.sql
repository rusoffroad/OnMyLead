-- Invite a riding group to an event (20261110100000_event_group_invite.sql). Runs after
-- privacy_test.sql (as_user, expect_refused), pro_test.sql (expect_error) and events_test.sql.
-- Each block raises an exception if a rule is broken.

-- People: Hana (Pro, hosts the event and owns the group), Ian, Jo and Kit (in Hana's group),
-- Lee (Kit blocked Hana), Max (not in the group, not a host).
update app_settings set value = 'false' where key = 'auto_trial';
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000f1a01', '{"full_name":"Hana Host"}'),
  ('00000000-0000-0000-0000-0000000f1a02', '{"full_name":"Ian Invitee"}'),
  ('00000000-0000-0000-0000-0000000f1a03', '{"full_name":"Jo Going"}'),
  ('00000000-0000-0000-0000-0000000f1a04', '{"full_name":"Kit Cohost"}'),
  ('00000000-0000-0000-0000-0000000f1a05', '{"full_name":"Lee Blocker"}'),
  ('00000000-0000-0000-0000-0000000f1a06', '{"full_name":"Max Outsider"}');
insert into entitlement_grants (user_id, source, ends_at, note)
values ('00000000-0000-0000-0000-0000000f1a01', 'comp', now() + interval '1 year', 'event group invite test');
insert into blocked_riders (blocker_id, blocked_id) values ('00000000-0000-0000-0000-0000000f1a05', '00000000-0000-0000-0000-0000000f1a01');
insert into riding_groups (id, owner_id, name) values ('4e4e4e4e-4e4e-4e4e-4e4e-4e4e4e4e4e4e', '00000000-0000-0000-0000-0000000f1a01', 'Hill Crew');
insert into riding_group_members (group_id, user_id) values
  ('4e4e4e4e-4e4e-4e4e-4e4e-4e4e4e4e4e4e', '00000000-0000-0000-0000-0000000f1a02'),
  ('4e4e4e4e-4e4e-4e4e-4e4e-4e4e4e4e4e4e', '00000000-0000-0000-0000-0000000f1a03'),
  ('4e4e4e4e-4e4e-4e4e-4e4e-4e4e4e4e4e4e', '00000000-0000-0000-0000-0000000f1a04'),
  ('4e4e4e4e-4e4e-4e4e-4e4e-4e4e4e4e4e4e', '00000000-0000-0000-0000-0000000f1a05');
insert into push_tokens (user_id, token, platform) values
  ('00000000-0000-0000-0000-0000000f1a02', 'ian-event-invite-token-000000000000000000000000000', 'ios'),
  ('00000000-0000-0000-0000-0000000f1a03', 'jo-event-invite-token-0000000000000000000000000000', 'android');

create temp table egi_ids (k text primary key, id uuid);
grant all on egi_ids to authenticated, anon;

-- Hana creates the event and makes Kit a co-host; Jo already said Going.
select as_user('00000000-0000-0000-0000-0000000f1a01');
set role authenticated;
insert into egi_ids select 'ev', (save_event(null, '{"title":"Hill Country Rally","starts_at":"2030-04-04T15:00:00Z","location_name":"Fair Park"}') ->> 'id')::uuid;
select add_event_host((select id from egi_ids where k = 'ev'), '00000000-0000-0000-0000-0000000f1a04');
reset role;
select as_user('00000000-0000-0000-0000-0000000f1a03');
set role authenticated;
select rsvp_event((select id from egi_ids where k = 'ev'), 'going');
reset role;

-- GI1. Only hosts can invite, only with a group they're in.
select as_user('00000000-0000-0000-0000-0000000f1a06');
set role authenticated;
select expect_error($q$select invite_group_to_event((select id from egi_ids where k = 'ev'), '4e4e4e4e-4e4e-4e4e-4e4e-4e4e4e4e4e4e')$q$,
  'only the event''s hosts%', 'a rider who is not a host invited a group');
reset role;
select as_user(null);
set role anon;
select expect_refused($q$select invite_group_to_event((select id from egi_ids where k = 'ev'), '4e4e4e4e-4e4e-4e4e-4e4e-4e4e4e4e4e4e')$q$,
  'a signed-out visitor invited a group');
reset role;

-- GI2. Hana invites the group: only Ian is new (Jo said Going, Kit hosts, Lee blocked Hana).
select as_user('00000000-0000-0000-0000-0000000f1a01');
set role authenticated;
do $$
declare n int;
begin
  n := invite_group_to_event((select id from egi_ids where k = 'ev'), '4e4e4e4e-4e4e-4e4e-4e4e-4e4e4e4e4e4e');
  if n <> 1 then raise exception 'FAIL: expected 1 invited, got %', n; end if;
  -- A second tap invites nobody new and sends nothing again.
  n := invite_group_to_event((select id from egi_ids where k = 'ev'), '4e4e4e4e-4e4e-4e4e-4e4e-4e4e4e4e4e4e');
  if n <> 0 then raise exception 'FAIL: second invite counted % again', n; end if;
  -- Riders can't read the invites table directly.
  if (select count(*) from rider_event_invites) <> 0 then raise exception 'FAIL: rider_event_invites readable by riders'; end if;
end $$;
reset role;

do $$
declare v_ev uuid := (select id from egi_ids where k = 'ev');
begin
  if (select array_agg(user_id order by user_id) from rider_event_invites where event_id = v_ev)
     <> array['00000000-0000-0000-0000-0000000f1a02'::uuid] then
    raise exception 'FAIL: wrong riders invited';
  end if;
  -- Ian's inbox has the invite, opening the event; Jo (already Going) got nothing.
  if not exists (
    select 1 from rider_notifications
    where user_id = '00000000-0000-0000-0000-0000000f1a02' and kind = 'event_invite'
      and title = 'Hana Host invited you to Hill Country Rally'
      and data ->> 'eventId' = v_ev::text and data ->> 'eventCode' = (select share_code from rider_events where id = v_ev)
  ) then
    raise exception 'FAIL: Ian has no event invite in his inbox';
  end if;
  if (select count(*) from rider_notifications where kind = 'event_invite') <> 1 then
    raise exception 'FAIL: event invite notifications sent more than once';
  end if;
  -- Once Ian answers, a late push for the old invite sends nothing.
  insert into rider_event_rsvps (event_id, user_id, status) values (v_ev, '00000000-0000-0000-0000-0000000f1a02', 'interested');
  if exists (select 1 from push_batch_social(jsonb_build_object('type', 'invite', 'event', v_ev, 'user', '00000000-0000-0000-0000-0000000f1a02'))) then
    raise exception 'FAIL: push for an answered invite';
  end if;
end $$;

-- GI3. A co-host in the group can invite too (Lee blocked Hana, not Kit, so Lee is invited now);
-- a cancelled event can't be invited to.
select as_user('00000000-0000-0000-0000-0000000f1a04');
set role authenticated;
do $$
declare n int;
begin
  n := invite_group_to_event((select id from egi_ids where k = 'ev'), '4e4e4e4e-4e4e-4e4e-4e4e-4e4e4e4e4e4e');
  if n <> 1 then raise exception 'FAIL: co-host invite expected 1, got %', n; end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-0000000f1a01');
set role authenticated;
select set_event_cancelled((select id from egi_ids where k = 'ev'), true);
select expect_error($q$select invite_group_to_event((select id from egi_ids where k = 'ev'), '4e4e4e4e-4e4e-4e4e-4e4e-4e4e4e4e4e4e')$q$,
  'this event was cancelled%', 'invited a group to a cancelled event');
reset role;

-- GI4. Ride invites still work as before through the replaced push_batch_social.
do $$
begin
  if exists (select 1 from push_batch_social('{"type":"invite","ride":"00000000-0000-0000-0000-000000000000","user":"00000000-0000-0000-0000-0000000f1a02"}')) then
    raise exception 'FAIL: ride invite push for a missing ride';
  end if;
end $$;

select 'EVENT GROUP INVITE TEST PASSED';
