-- Leader Trackline (migration 20261104210000_leader_trackline.sql): rides start with the line on,
-- and only the ride's leader (or an organizer) can turn it off or back on. Riders on the ride and
-- outsiders are refused. Runs after privacy_test.sql (run_local.sh): as_user and expect_refused
-- come from there.
--
-- Riders (new here):
--   Tia  0d91  organizer
--   Lee  0d92  on the ride, given the Leader role
--   Ray  0d93  on the ride
--   Out  0d94  not on the ride
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000d91', '{"full_name":"Tia Organizer"}'),
  ('00000000-0000-0000-0000-000000000d92', '{"full_name":"Lee Leader"}'),
  ('00000000-0000-0000-0000-000000000d93', '{"full_name":"Ray Rider"}'),
  ('00000000-0000-0000-0000-000000000d94', '{"full_name":"Out Sider"}');

select as_user('00000000-0000-0000-0000-000000000d91');
set role authenticated;
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility)
values ('0d9d9d9d-0d9d-0d9d-0d9d-0d9d9d9d9d9d', auth.uid(), 'Trackline Ride', now() + interval '1 day', 38.5, -109.5, 'public');
reset role;
select as_user('00000000-0000-0000-0000-000000000d92');
set role authenticated;
select join_ride('0d9d9d9d-0d9d-0d9d-0d9d-0d9d9d9d9d9d');
reset role;
select as_user('00000000-0000-0000-0000-000000000d93');
set role authenticated;
select join_ride('0d9d9d9d-0d9d-0d9d-0d9d-0d9d9d9d9d9d');
reset role;

-- T1. A new ride has the trackline on.
do $$ begin
  if not (select leader_trackline from rides where id = '0d9d9d9d-0d9d-0d9d-0d9d-0d9d9d9d9d9d') then
    raise exception 'FAIL: a new ride should start with the trackline on';
  end if;
end $$;

-- T2. With nobody holding the Leader role, the organizer leads and can turn it off.
select as_user('00000000-0000-0000-0000-000000000d91');
set role authenticated;
select set_leader_trackline('0d9d9d9d-0d9d-0d9d-0d9d-0d9d9d9d9d9d', false);
reset role;
do $$ begin
  if (select leader_trackline from rides where id = '0d9d9d9d-0d9d-0d9d-0d9d-0d9d9d9d9d9d') then
    raise exception 'FAIL: the organizer could not turn the trackline off';
  end if;
end $$;

-- T3. A rider on the ride can't change it, and nor can someone not on the ride.
select as_user('00000000-0000-0000-0000-000000000d93');
set role authenticated;
select expect_refused($$select set_leader_trackline('0d9d9d9d-0d9d-0d9d-0d9d-0d9d9d9d9d9d', true)$$, 'a rider turned the trackline on');
reset role;
select as_user('00000000-0000-0000-0000-000000000d94');
set role authenticated;
select expect_refused($$select set_leader_trackline('0d9d9d9d-0d9d-0d9d-0d9d-0d9d9d9d9d9d', true)$$, 'an outsider turned the trackline on');
-- And nobody can write the column directly past the function: riders can't update the ride row.
update rides set leader_trackline = true where id = '0d9d9d9d-0d9d-0d9d-0d9d-0d9d9d9d9d9d';
reset role;
do $$ begin
  if (select leader_trackline from rides where id = '0d9d9d9d-0d9d-0d9d-0d9d-0d9d9d9d9d9d') then
    raise exception 'FAIL: a rider or outsider changed the trackline';
  end if;
end $$;

-- T4. Lee is given the Leader role: Lee can turn it back on. Riders can still read the choice.
update ride_members set role = 'leader'
where ride_id = '0d9d9d9d-0d9d-0d9d-0d9d-0d9d9d9d9d9d' and user_id = '00000000-0000-0000-0000-000000000d92';
select as_user('00000000-0000-0000-0000-000000000d92');
set role authenticated;
select set_leader_trackline('0d9d9d9d-0d9d-0d9d-0d9d-0d9d9d9d9d9d', true);
reset role;
select as_user('00000000-0000-0000-0000-000000000d93');
set role authenticated;
do $$ begin
  if not (select leader_trackline from rides where id = '0d9d9d9d-0d9d-0d9d-0d9d-0d9d9d9d9d9d') then
    raise exception 'FAIL: the leader could not turn the trackline back on (or a rider cannot read it)';
  end if;
end $$;
reset role;

-- T5. No answer is refused rather than guessed.
select as_user('00000000-0000-0000-0000-000000000d92');
set role authenticated;
select expect_refused($$select set_leader_trackline('0d9d9d9d-0d9d-0d9d-0d9d-0d9d9d9d9d9d', null)$$, 'a null trackline choice was taken');
reset role;

select 'leader trackline tests passed' as result;
