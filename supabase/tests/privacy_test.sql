-- Run after the migration on a scratch database:
--   psql -v ON_ERROR_STOP=1 -f auth_stub.sql -f ../migrations/*.sql -f privacy_test.sql
-- Each block raises an exception if a privacy or joining rule is broken.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on rides, feature_plans to anon;
grant execute on all functions in schema public to anon, authenticated;

-- Fixture users (the trigger creates profiles).
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', '{"full_name":"Olivia Organizer"}'),
  ('00000000-0000-0000-0000-00000000000b', '{"full_name":"Ben Rider"}'),
  ('00000000-0000-0000-0000-00000000000c', '{"full_name":"Cara Rider"}'),
  ('00000000-0000-0000-0000-00000000000d', '{"full_name":"Dan Stranger"}');

create function as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p::text, ''), false);
$$;

-- Olivia creates a public ride for 2 vehicles.
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility, max_vehicles)
values ('11111111-1111-1111-1111-111111111111', auth.uid(), 'Moab Saturday', now() + interval '1 day', 38.57, -109.55, 'public', 2);
insert into ride_private_details (ride_id, meet_lat, meet_lng, meet_label)
values ('11111111-1111-1111-1111-111111111111', 38.5733, -109.5498, 'Gas station on Main St');
reset role;
do $$ begin
  if not exists (select 1 from ride_members where user_id = '00000000-0000-0000-0000-00000000000a' and role = 'organizer' and status = 'joined') then
    raise exception 'FAIL: organizer not added to their ride';
  end if;
end $$;

do $$ begin
  if (select display_name from profiles where id = '00000000-0000-0000-0000-00000000000b') <> 'Ben Rider' then
    raise exception 'FAIL: profile not created from sign-in metadata';
  end if;
end $$;

-- 1. A stranger can see the public ride page but not the exact meeting point.
select as_user('00000000-0000-0000-0000-00000000000d');
set role authenticated;
do $$ begin
  if (select count(*) from rides) <> 1 then raise exception 'FAIL: public ride not visible'; end if;
  if (select count(*) from ride_private_details) <> 0 then raise exception 'FAIL: stranger saw exact meeting point'; end if;
end $$;
reset role;

-- 2. Signed-out link preview works for public/unlisted rides.
select as_user(null);
set role anon;
do $$ begin
  if (select count(*) from rides) <> 1 then raise exception 'FAIL: signed-out preview blocked'; end if;
end $$;
reset role;

-- 3. Ben joins (fills the 2nd vehicle), Cara is waitlisted.
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
do $$ begin
  if join_ride('11111111-1111-1111-1111-111111111111') <> 'joined' then raise exception 'FAIL: Ben should join'; end if;
  if (select count(*) from ride_private_details) <> 1 then raise exception 'FAIL: joined rider cannot see meeting point'; end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
do $$ begin
  if join_ride('11111111-1111-1111-1111-111111111111') <> 'waitlisted' then raise exception 'FAIL: Cara should be waitlisted'; end if;
  if (select count(*) from ride_private_details) <> 0 then raise exception 'FAIL: waitlisted rider saw meeting point'; end if;
end $$;
reset role;

-- 3b. A waitlisted rider cannot promote themselves.
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
update ride_members set status = 'joined' where user_id = auth.uid();
reset role;
do $$ begin
  if (select status from ride_members where user_id = '00000000-0000-0000-0000-00000000000c') <> 'waitlisted' then
    raise exception 'FAIL: rider promoted themselves off the waitlist';
  end if;
end $$;

-- 4. Ride starts. Ben shares for 2 hours and posts a position.
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
select set_ride_status('11111111-1111-1111-1111-111111111111', 'live');
reset role;

select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
insert into location_shares (user_id, scope, ride_id, expires_at)
values (auth.uid(), 'ride', '11111111-1111-1111-1111-111111111111', now() + interval '2 hours');
insert into positions_latest (user_id, lat, lng, speed_mps, recorded_at)
values (auth.uid(), 38.6, -109.6, 8, now());
reset role;

-- Olivia (joined) sees Ben; Dan (stranger) and Cara (waitlisted) do not.
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$ begin
  if (select count(*) from positions_latest where user_id = '00000000-0000-0000-0000-00000000000b') <> 1 then
    raise exception 'FAIL: joined rider cannot see a sharing rider';
  end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-00000000000d');
set role authenticated;
do $$ begin
  if (select count(*) from positions_latest) <> 0 then raise exception 'FAIL: stranger saw a live position'; end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
do $$ begin
  if (select count(*) from positions_latest) <> 0 then raise exception 'FAIL: waitlisted rider saw a live position'; end if;
end $$;
reset role;

-- 5. Olivia is not sharing, so nobody else sees her even though she is on the ride.
insert into positions_latest (user_id, lat, lng, recorded_at)
values ('00000000-0000-0000-0000-00000000000a', 38.61, -109.61, now());
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
do $$ begin
  if (select count(*) from positions_latest where user_id = '00000000-0000-0000-0000-00000000000a') <> 0 then
    raise exception 'FAIL: saw a rider who never turned sharing on';
  end if;
end $$;
-- And Ben cannot write a position for someone else.
do $$ begin
  begin
    update positions_latest set lat = 0 where user_id = '00000000-0000-0000-0000-00000000000a';
    if found then raise exception 'FAIL: updated another rider''s position'; end if;
  end;
end $$;
reset role;

-- 6. Expired share: nobody sees Ben any more.
update location_shares set expires_at = now() - interval '1 minute'
where user_id = '00000000-0000-0000-0000-00000000000b';
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$ begin
  if (select count(*) from positions_latest where user_id = '00000000-0000-0000-0000-00000000000b') <> 0 then
    raise exception 'FAIL: expired share still visible';
  end if;
end $$;
reset role;

-- 7. Ben leaves: Cara is promoted off the waitlist.
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
select leave_ride('11111111-1111-1111-1111-111111111111');
reset role;
do $$ begin
  if (select status from ride_members where user_id = '00000000-0000-0000-0000-00000000000c') <> 'joined' then
    raise exception 'FAIL: waitlist not promoted';
  end if;
end $$;

-- 8. Personal share with a recipient and a family link; ends on revoke.
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
insert into location_shares (id, user_id, scope, expires_at, link_token)
values ('22222222-2222-2222-2222-222222222222', auth.uid(), 'personal', now() + interval '1 hour', 'family-token-123');
insert into location_share_recipients values ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-00000000000d');
insert into positions_latest (user_id, lat, lng, recorded_at) values (auth.uid(), 38.7, -109.7, now());
reset role;
select as_user('00000000-0000-0000-0000-00000000000d');
set role authenticated;
do $$ begin
  if (select count(*) from positions_latest where user_id = '00000000-0000-0000-0000-00000000000c') <> 1 then
    raise exception 'FAIL: personal share recipient cannot see location';
  end if;
end $$;
reset role;
select as_user(null);
set role anon;
do $$ begin
  if (select count(*) from get_shared_location('family-token-123')) <> 1 then raise exception 'FAIL: family link not working'; end if;
  if (select count(*) from get_shared_location('wrong-token')) <> 0 then raise exception 'FAIL: bad token returned data'; end if;
end $$;
reset role;
update location_shares set revoked_at = now() where id = '22222222-2222-2222-2222-222222222222';
select as_user(null);
set role anon;
do $$ begin
  if (select count(*) from get_shared_location('family-token-123')) <> 0 then raise exception 'FAIL: revoked family link still works'; end if;
end $$;
reset role;

-- 9. Ending the ride revokes every ride share.
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
insert into location_shares (user_id, scope, ride_id) values (auth.uid(), 'ride', '11111111-1111-1111-1111-111111111111');
reset role;
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
select set_ride_status('11111111-1111-1111-1111-111111111111', 'ended');
reset role;
do $$ begin
  if exists (select 1 from location_shares where scope = 'ride' and revoked_at is null) then
    raise exception 'FAIL: ride share survived ride end';
  end if;
end $$;

-- 10. Only organizers can start or end a ride.
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
do $$ begin
  begin
    perform set_ride_status('11111111-1111-1111-1111-111111111111', 'live');
    raise exception 'FAIL: rider changed ride status';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
reset role;

select 'ALL PRIVACY AND JOINING TESTS PASSED' as result;
