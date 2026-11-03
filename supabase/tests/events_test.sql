-- Events (20261102950000_events.sql). Runs last in run_local.sh, after privacy_test.sql (as_user,
-- expect_refused), pro_test.sql (expect_error), admin_test.sql (admin ad01, as_admin_session) and
-- abuse_reports_test.sql. Each block raises an exception if a rule is broken.

-- People: Eve (Pro, the owner), Cody (Free, co-host), Rita (Free rider), Mo (Free, ride manager),
-- Zed (blocked by Eve).
update app_settings set value = 'false' where key = 'auto_trial';
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000e0e01', '{"full_name":"Eve Host"}'),
  ('00000000-0000-0000-0000-0000000e0e02', '{"full_name":"Cody Cohost"}'),
  ('00000000-0000-0000-0000-0000000e0e03', '{"full_name":"Rita Rider"}'),
  ('00000000-0000-0000-0000-0000000e0e04', '{"full_name":"Mo Manager"}'),
  ('00000000-0000-0000-0000-0000000e0e05', '{"full_name":"Zed Blocked"}');
insert into entitlement_grants (user_id, source, ends_at, note)
values ('00000000-0000-0000-0000-0000000e0e01', 'comp', now() + interval '1 year', 'events test');
insert into blocked_riders (blocker_id, blocked_id) values ('00000000-0000-0000-0000-0000000e0e01', '00000000-0000-0000-0000-0000000e0e05');

create temp table ev_ids (k text primary key, id uuid, code text);
grant all on ev_ids to authenticated, anon;
-- Photo ids by file name, read past row level security (the test's own lookup).
create function ev_photo(p_like text) returns uuid language sql security definer as $$
  select id from rider_event_photos where path like p_like limit 1;
$$;
grant execute on function ev_photo(text) to authenticated;

-- E1. Free riders can't create an event; Pro can. Bad dates are refused.
select as_user('00000000-0000-0000-0000-0000000e0e02');
set role authenticated;
select expect_error($q$select save_event(null, '{"title":"Free Rally","starts_at":"2030-05-01T15:00:00Z","location_name":"Moab"}')$q$,
  'pro_required:create_events%', 'a Free rider created an event');
reset role;
select as_user('00000000-0000-0000-0000-0000000e0e01');
set role authenticated;
select expect_refused($q$select save_event(null, '{"title":"Too Long","starts_at":"2030-05-01T15:00:00Z","ends_at":"2030-07-01T15:00:00Z","location_name":"Moab"}')$q$,
  'event longer than 31 days');
select expect_refused($q$select save_event(null, '{"title":"Backwards","starts_at":"2030-05-03T15:00:00Z","ends_at":"2030-05-01T15:00:00Z","location_name":"Moab"}')$q$,
  'event ending before it starts');
select expect_refused($q$select save_event(null, '{"title":"Gone","starts_at":"2020-05-01T15:00:00Z","location_name":"Moab"}')$q$,
  'event in the past');
insert into ev_ids select 'rally', (j ->> 'id')::uuid, j ->> 'share_code' from (
  select save_event(null, '{"title":"Moab Spring Rally","details":"Three days of riding","starts_at":"2030-05-01T15:00:00Z",
    "ends_at":"2030-05-03T23:00:00Z","location_name":"Old Spanish Trail Arena","location_address":"3641 S Hwy 191, Moab, UT",
    "lat":38.5468123,"lng":-109.5498765,"state":"ut","website_url":"moabrally.example.com","visibility":"public"}') j) x;
insert into ev_ids select 'secret', (j ->> 'id')::uuid, j ->> 'share_code' from (
  select save_event(null, '{"title":"Club Night","starts_at":"2030-06-01T01:00:00Z","location_name":"The Shop","visibility":"unlisted"}') j) x;
reset role;
do $$
declare e rider_events;
begin
  select * into e from rider_events where id = (select id from ev_ids where k = 'rally');
  if e.area_lat <> 38.547 or e.area_lng <> -109.550 then raise exception 'FAIL: place not rounded (% %)', e.area_lat, e.area_lng; end if;
  if e.area_state <> 'UT' then raise exception 'FAIL: state not upper-cased'; end if;
  if e.website_url <> 'https://moabrally.example.com' then raise exception 'FAIL: website not normalised (%)', e.website_url; end if;
  if e.share_code !~ '^[0-9A-F]{8}$' then raise exception 'FAIL: share code %', e.share_code; end if;
end $$;

-- E2. Nobody reads the tables directly (not even the owner); the functions are the only door.
select as_user('00000000-0000-0000-0000-0000000e0e01');
set role authenticated;
do $$ begin
  if (select count(*) from rider_events) <> 0 then raise exception 'FAIL: rider_events readable directly'; end if;
end $$;
select expect_refused($q$insert into rider_events (owner_id, title, starts_at, ends_at, location_name) values (auth.uid(), 'Sneaky', now(), now(), 'x')$q$,
  'direct insert into rider_events');
reset role;
select as_user(null);
set role anon;
select expect_refused($q$select count(*) from rider_events$q$, 'anonymous read of rider_events');
-- Signed out: the public list and the page work, with no names.
do $$
declare d jsonb; l jsonb;
begin
  l := events_list('upcoming');
  if not exists (select 1 from jsonb_array_elements(l) x where x ->> 'title' = 'Moab Spring Rally') then raise exception 'FAIL: public event not listed'; end if;
  if exists (select 1 from jsonb_array_elements(l) x where x ->> 'title' = 'Club Night') then raise exception 'FAIL: unlisted event listed'; end if;
  d := event_detail((select code from ev_ids where k = 'secret'));
  if d ->> 'title' <> 'Club Night' then raise exception 'FAIL: unlisted event not opened by its link'; end if;
  d := event_detail((select code from ev_ids where k = 'rally'));
  if d -> 'owner' <> 'null'::jsonb then raise exception 'FAIL: owner name shown signed out'; end if;
  if (d ->> 'am_host')::boolean then raise exception 'FAIL: visitor is a host'; end if;
end $$;
select expect_refused($q$select rsvp_event((select id from ev_ids where k = 'rally'), 'going')$q$, 'anonymous RSVP');
select expect_refused($q$select save_event(null, '{"title":"Anon","starts_at":"2030-05-01T15:00:00Z","location_name":"x"}')$q$, 'anonymous create');
reset role;

-- E3. Distance filter.
do $$ begin
  if jsonb_array_length(events_list('upcoming', 38.57, -109.55, 50)) < 1 then raise exception 'FAIL: nearby event missing'; end if;
  if exists (select 1 from jsonb_array_elements(events_list('upcoming', 30.27, -97.74, 100)) x where x ->> 'title' = 'Moab Spring Rally') then
    raise exception 'FAIL: far event inside the radius';
  end if;
end $$;

-- E4. Co-hosts: only the owner adds them, not blocked riders, and a co-host can edit but not delete.
select as_user('00000000-0000-0000-0000-0000000e0e03');
set role authenticated;
select expect_refused($q$select add_event_host((select id from ev_ids where k = 'rally'), '00000000-0000-0000-0000-0000000e0e03')$q$, 'stranger added a host');
select expect_refused($q$select save_event((select id from ev_ids where k = 'rally'), '{"title":"Hijacked","starts_at":"2030-05-01T15:00:00Z","location_name":"x"}')$q$, 'stranger edited the event');
reset role;
select as_user('00000000-0000-0000-0000-0000000e0e01');
set role authenticated;
select add_event_host((select id from ev_ids where k = 'rally'), '00000000-0000-0000-0000-0000000e0e02');
select expect_refused($q$select add_event_host((select id from ev_ids where k = 'rally'), '00000000-0000-0000-0000-0000000e0e05')$q$, 'blocked rider added as co-host');
reset role;
select as_user('00000000-0000-0000-0000-0000000e0e02');
set role authenticated;
select save_event((select id from ev_ids where k = 'rally'), '{"title":"Moab Spring Rally 2030","details":"Three days","starts_at":"2030-05-01T15:00:00Z",
  "ends_at":"2030-05-03T23:00:00Z","location_name":"Old Spanish Trail Arena","lat":38.5468,"lng":-109.5499,"state":"UT","visibility":"public"}');
select expect_refused($q$select delete_event((select id from ev_ids where k = 'rally'))$q$, 'co-host deleted the event');
select expect_refused($q$select add_event_host((select id from ev_ids where k = 'rally'), '00000000-0000-0000-0000-0000000e0e03')$q$, 'co-host added a host');
do $$ begin
  if not (event_detail((select code from ev_ids where k = 'rally')) ->> 'am_host')::boolean then raise exception 'FAIL: co-host not a host'; end if;
end $$;
reset role;

-- E5. Agenda: hosts add items during the event; times outside it are refused.
select as_user('00000000-0000-0000-0000-0000000e0e02');
set role authenticated;
select save_event_agenda_item((select id from ev_ids where k = 'rally'), null,
  '{"kind":"poker_run","title":"Poker Run","starts_at":"2030-05-02T15:00:00Z","place":"Arena gate","details":"Five stops"}');
insert into ev_ids select 'concert', save_event_agenda_item((select id from ev_ids where k = 'rally'), null,
  '{"kind":"concert","title":"Friday Night Concert","starts_at":"2030-05-02T02:00:00Z","ends_at":"2030-05-02T05:00:00Z"}'), null;
select expect_refused($q$select save_event_agenda_item((select id from ev_ids where k = 'rally'), null, '{"kind":"raffle","title":"Late","starts_at":"2030-06-20T15:00:00Z"}')$q$,
  'agenda item weeks after the event');
select expect_refused($q$select save_event_agenda_item((select id from ev_ids where k = 'rally'), null, '{"kind":"karaoke","title":"Bad kind","starts_at":"2030-05-02T15:00:00Z"}')$q$,
  'unknown agenda kind');
reset role;
select as_user('00000000-0000-0000-0000-0000000e0e03');
set role authenticated;
select expect_refused($q$select save_event_agenda_item((select id from ev_ids where k = 'rally'), null, '{"title":"Spam","starts_at":"2030-05-02T15:00:00Z"}')$q$,
  'stranger added to the agenda');
select expect_refused($q$select delete_event_agenda_item((select id from ev_ids where k = 'concert'))$q$, 'stranger deleted an agenda item');
do $$
declare a jsonb := event_detail((select code from ev_ids where k = 'rally')) -> 'agenda';
begin
  if jsonb_array_length(a) <> 2 then raise exception 'FAIL: agenda has % items', jsonb_array_length(a); end if;
  -- Ordered by time: the concert (Friday night) comes before the poker run.
  if a -> 0 ->> 'title' <> 'Friday Night Concert' then raise exception 'FAIL: agenda out of order'; end if;
end $$;
reset role;

-- E6. Photos: hosts only, own folder only, at most 12.
select as_user('00000000-0000-0000-0000-0000000e0e01');
set role authenticated;
do $$
declare v uuid := (select id from ev_ids where k = 'rally'); i int;
begin
  for i in 1..12 loop perform add_event_photo(v, v::text || '/photo' || i || '.jpg'); end loop;
end $$;
select expect_refused($q$select add_event_photo((select id from ev_ids where k = 'rally'), (select id from ev_ids where k = 'rally')::text || '/thirteen.jpg')$q$,
  'thirteenth photo');
select expect_refused($q$select add_event_photo((select id from ev_ids where k = 'secret'), (select id from ev_ids where k = 'rally')::text || '/other.jpg')$q$,
  'photo path in another event''s folder');
select remove_event_photo(ev_photo('%/photo12.jpg'));
select set_event_cover(ev_photo('%/photo5.jpg'));
do $$ begin
  if event_detail((select code from ev_ids where k = 'rally')) -> 'photos' -> 0 ->> 'path' not like '%/photo5.jpg' then
    raise exception 'FAIL: cover not first';
  end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-0000000e0e03');
set role authenticated;
select expect_refused($q$select add_event_photo((select id from ev_ids where k = 'rally'), (select id from ev_ids where k = 'rally')::text || '/x.jpg')$q$, 'stranger added a photo');
select expect_refused($q$select remove_event_photo(ev_photo('%/photo2.jpg'))$q$, 'stranger removed a photo');
do $$ begin
  if can_edit_event_folder((select id from ev_ids where k = 'rally')::text) then raise exception 'FAIL: stranger may upload'; end if;
  if can_edit_event_folder('not-a-uuid') then raise exception 'FAIL: junk folder accepted'; end if;
end $$;
reset role;

-- E7. Group rides: a host links a ride they organize; a stranger's ride can't be linked; one event per ride.
select as_user('00000000-0000-0000-0000-0000000e0e01');
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility)
values ('00000000-0000-0000-0000-0000000e0a01', '00000000-0000-0000-0000-0000000e0e01', 'Day 1 Hells Revenge', '2030-05-01T16:00:00Z', 38.58, -109.52, 'public'),
       ('00000000-0000-0000-0000-0000000e0a02', '00000000-0000-0000-0000-0000000e0e01', 'Day 2 Private Run', '2030-05-02T16:00:00Z', 38.58, -109.52, 'private');
-- (A trigger puts the organizer on their ride.)
select as_user('00000000-0000-0000-0000-0000000e0e03');
insert into rides (id, organizer_id, name, meet_at, meet_area_lat, meet_area_lng, visibility)
values ('00000000-0000-0000-0000-0000000e0a03', '00000000-0000-0000-0000-0000000e0e03', 'Rita''s Ride', '2030-05-01T16:00:00Z', 38.58, -109.52, 'public');
select as_user('00000000-0000-0000-0000-0000000e0e01');
set role authenticated;
select link_event_ride((select id from ev_ids where k = 'rally'), '00000000-0000-0000-0000-0000000e0a01', 'Day 1: Easy Group');
select link_event_ride((select id from ev_ids where k = 'rally'), '00000000-0000-0000-0000-0000000e0a02', null);
select expect_refused($q$select link_event_ride((select id from ev_ids where k = 'rally'), '00000000-0000-0000-0000-0000000e0a03', null)$q$, 'linked a ride the host doesn''t organize');
select expect_refused($q$select link_event_ride((select id from ev_ids where k = 'secret'), '00000000-0000-0000-0000-0000000e0a01', null)$q$, 'one ride in two events');
do $$ begin
  if event_for_ride('00000000-0000-0000-0000-0000000e0a01') ->> 'title' <> 'Moab Spring Rally 2030' then raise exception 'FAIL: event_for_ride'; end if;
  if jsonb_array_length(event_linkable_rides((select id from ev_ids where k = 'secret'))) <> 0 then raise exception 'FAIL: linked rides still offered'; end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-0000000e0e02');
set role authenticated;
-- The co-host doesn't organize Eve's rides, so can't link Rita's or pick managers for Eve's.
select expect_refused($q$select set_event_ride_manager((select id from ev_ids where k = 'rally'), '00000000-0000-0000-0000-0000000e0a01', '00000000-0000-0000-0000-0000000e0e04')$q$,
  'co-host who doesn''t organize the ride picked its manager');
reset role;

-- E8. A private ride's code only reaches its riders and the hosts.
select as_user('00000000-0000-0000-0000-0000000e0e03');
set role authenticated;
do $$
declare r jsonb;
begin
  select x into r from jsonb_array_elements(event_detail((select code from ev_ids where k = 'rally')) -> 'rides') x where x ->> 'name' = 'Day 2 Private Run';
  if r is null then raise exception 'FAIL: private ride not listed'; end if;
  if r ->> 'invite_code' is not null then raise exception 'FAIL: private ride code leaked'; end if;
  select x into r from jsonb_array_elements(event_detail((select code from ev_ids where k = 'rally')) -> 'rides') x where x ->> 'name' = 'Day 1 Hells Revenge';
  if r ->> 'invite_code' is null then raise exception 'FAIL: public ride code missing'; end if;
  if r ->> 'label' <> 'Day 1: Easy Group' then raise exception 'FAIL: ride label'; end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-0000000e0e02');
set role authenticated;
do $$ begin
  if not exists (select 1 from jsonb_array_elements(event_detail((select code from ev_ids where k = 'rally')) -> 'rides') x
                 where x ->> 'name' = 'Day 2 Private Run' and x ->> 'invite_code' is not null) then
    raise exception 'FAIL: co-host can''t see the private ride code';
  end if;
end $$;
reset role;

-- E9. Ride Managers: Mo isn't on the ride, so he's invited as Co-Organizer and becomes a manager
-- when he joins. Switching to Rita (already joined) makes her Co-Organizer right away and puts
-- Mo back to Rider. Blocked riders can't be picked.
select as_user('00000000-0000-0000-0000-0000000e0e01');
set role authenticated;
do $$
declare v text;
begin
  v := set_event_ride_manager((select id from ev_ids where k = 'rally'), '00000000-0000-0000-0000-0000000e0a01', '00000000-0000-0000-0000-0000000e0e04');
  if v <> 'invited' then raise exception 'FAIL: manager result %', v; end if;
end $$;
select expect_refused($q$select set_event_ride_manager((select id from ev_ids where k = 'rally'), '00000000-0000-0000-0000-0000000e0a01', '00000000-0000-0000-0000-0000000e0e05')$q$,
  'blocked rider picked as manager');
reset role;
do $$ begin
  if not exists (select 1 from ride_members where ride_id = '00000000-0000-0000-0000-0000000e0a01'
                 and user_id = '00000000-0000-0000-0000-0000000e0e04' and status = 'invited' and role = 'co_organizer') then
    raise exception 'FAIL: manager not invited as co-organizer';
  end if;
  if is_ride_manager('00000000-0000-0000-0000-0000000e0a01', '00000000-0000-0000-0000-0000000e0e04') then
    raise exception 'FAIL: manager has powers before saying yes';
  end if;
end $$;
select as_user('00000000-0000-0000-0000-0000000e0e04');
set role authenticated;
select join_ride('00000000-0000-0000-0000-0000000e0a01');
reset role;
do $$ begin
  if not is_ride_manager('00000000-0000-0000-0000-0000000e0a01', '00000000-0000-0000-0000-0000000e0e04') then
    raise exception 'FAIL: manager isn''t a co-organizer after joining';
  end if;
end $$;
select as_user('00000000-0000-0000-0000-0000000e0e03');
set role authenticated;
select join_ride('00000000-0000-0000-0000-0000000e0a01');
reset role;
select as_user('00000000-0000-0000-0000-0000000e0e01');
set role authenticated;
do $$
declare v text;
begin
  v := set_event_ride_manager((select id from ev_ids where k = 'rally'), '00000000-0000-0000-0000-0000000e0a01', '00000000-0000-0000-0000-0000000e0e03');
  if v <> 'manager' then raise exception 'FAIL: joined rider result %', v; end if;
end $$;
reset role;
do $$ begin
  if (select role from ride_members where ride_id = '00000000-0000-0000-0000-0000000e0a01' and user_id = '00000000-0000-0000-0000-0000000e0e04') <> 'rider' then
    raise exception 'FAIL: old manager kept co-organizer';
  end if;
  if not is_ride_manager('00000000-0000-0000-0000-0000000e0a01', '00000000-0000-0000-0000-0000000e0e03') then
    raise exception 'FAIL: new manager not a co-organizer';
  end if;
end $$;
select as_user('00000000-0000-0000-0000-0000000e0e01');
set role authenticated;
select set_event_ride_manager((select id from ev_ids where k = 'rally'), '00000000-0000-0000-0000-0000000e0a01', null);
reset role;
do $$ begin
  if (select role from ride_members where ride_id = '00000000-0000-0000-0000-0000000e0a01' and user_id = '00000000-0000-0000-0000-0000000e0e03') <> 'rider' then
    raise exception 'FAIL: clearing the manager kept co-organizer';
  end if;
  if (select role from ride_members where ride_id = '00000000-0000-0000-0000-0000000e0a01' and user_id = '00000000-0000-0000-0000-0000000e0e01') <> 'organizer' then
    raise exception 'FAIL: organizer lost their role';
  end if;
end $$;

-- E10. Going / Interested, names only for signed-in riders, blocked riders hidden from the owner.
select as_user('00000000-0000-0000-0000-0000000e0e03');
set role authenticated;
select rsvp_event((select id from ev_ids where k = 'rally'), 'going');
select rsvp_event((select id from ev_ids where k = 'rally'), 'interested');
select rsvp_event((select id from ev_ids where k = 'rally'), 'going');
select expect_refused($q$select rsvp_event((select id from ev_ids where k = 'rally'), 'maybe')$q$, 'unknown RSVP');
reset role;
select as_user('00000000-0000-0000-0000-0000000e0e05');
set role authenticated;
select rsvp_event((select id from ev_ids where k = 'rally'), 'going');
reset role;
select as_user('00000000-0000-0000-0000-0000000e0e01');
set role authenticated;
do $$
declare d jsonb := event_detail((select code from ev_ids where k = 'rally'));
begin
  if (d -> 'rsvp' ->> 'going')::int <> 2 then raise exception 'FAIL: going count %', d -> 'rsvp' ->> 'going'; end if;
  if jsonb_array_length(d -> 'going_riders') <> 1 then raise exception 'FAIL: blocked rider shown to the owner'; end if;
  if d -> 'going_riders' -> 0 ->> 'name' <> 'Rita Rider' then raise exception 'FAIL: going name'; end if;
  if not exists (select 1 from jsonb_array_elements(events_list('mine')) x where x ->> 'title' = 'Club Night') then
    raise exception 'FAIL: owner''s unlisted event missing from Yours';
  end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-0000000e0e03');
set role authenticated;
do $$ begin
  if not exists (select 1 from jsonb_array_elements(events_list('mine')) x where x ->> 'title' like 'Moab%' and x ->> 'mine' = 'going') then
    raise exception 'FAIL: RSVP missing from Yours';
  end if;
end $$;
select rsvp_event((select id from ev_ids where k = 'rally'), null);
reset role;
select as_user('00000000-0000-0000-0000-0000000e0e05');
set role authenticated;
do $$ begin
  -- Zed is blocked by Eve, so Eve's events stay out of his list.
  if exists (select 1 from jsonb_array_elements(events_list('upcoming')) x where x ->> 'title' like 'Moab%') then
    raise exception 'FAIL: blocked rider sees the blocker''s events';
  end if;
end $$;
reset role;

-- E11. Reporting an event reports its owner; the server fills that in.
select as_user('00000000-0000-0000-0000-0000000e0e03');
set role authenticated;
insert into reports (kind, reported_user_id, event_id, reason, details)
values ('rider', '00000000-0000-0000-0000-0000000e0e04', (select id from ev_ids where k = 'rally'), 'Spam or Scam', 'Fake event');
reset role;
do $$
declare r reports;
begin
  select * into r from reports where event_id = (select id from ev_ids where k = 'rally');
  if r.reported_user_id <> '00000000-0000-0000-0000-0000000e0e01' then raise exception 'FAIL: report not pointed at the owner'; end if;
  if r.source <> 'event' then raise exception 'FAIL: report source %', r.source; end if;
  if r.details not like 'Event: Moab Spring Rally 2030%Fake event' then raise exception 'FAIL: report details %', r.details; end if;
end $$;
select as_user('00000000-0000-0000-0000-0000000e0e01');
set role authenticated;
select expect_refused($q$insert into reports (kind, reported_user_id, event_id, reason) values ('rider', '00000000-0000-0000-0000-0000000e0e03', (select id from ev_ids where k = 'rally'), 'Spam')$q$,
  'owner reported their own event');
reset role;

-- E12. Admin: list, hide, photo takedown. Riders can't.
select as_user('00000000-0000-0000-0000-0000000e0e03');
set role authenticated;
select expect_refused($q$select admin_events()$q$, 'rider listed admin events');
select expect_refused($q$select admin_set_event_hidden((select id from ev_ids where k = 'rally'), true, 'spam')$q$, 'rider hid an event');
reset role;
select as_admin_session('00000000-0000-0000-0000-00000000ad01', 'aal2');
set role authenticated;
do $$
declare l jsonb := admin_events('reported');
begin
  if (l ->> 'total')::int < 1 or (l -> 'rows' -> 0 ->> 'open_reports')::int < 1 then raise exception 'FAIL: reported event not listed'; end if;
end $$;
select admin_set_event_hidden((select id from ev_ids where k = 'rally'), true, 'Reported as spam');
select admin_remove_event_photo(ev_photo('%/photo1.jpg'), 'Not allowed');
select expect_refused($q$select admin_set_event_hidden((select id from ev_ids where k = 'secret'), true, '')$q$, 'hide without a reason');
reset role;
select as_user('00000000-0000-0000-0000-0000000e0e03');
set role authenticated;
select expect_refused($q$select event_detail((select code from ev_ids where k = 'rally'))$q$, 'rider opened a hidden event');
do $$ begin
  if exists (select 1 from jsonb_array_elements(events_list('upcoming')) x where x ->> 'title' like 'Moab%') then raise exception 'FAIL: hidden event listed'; end if;
end $$;
reset role;
select as_user('00000000-0000-0000-0000-0000000e0e01');
set role authenticated;
do $$
declare d jsonb := event_detail((select code from ev_ids where k = 'rally'));
begin
  if not (d ->> 'hidden')::boolean or d ->> 'hidden_reason' <> 'Reported as spam' then raise exception 'FAIL: owner can''t see why it was hidden'; end if;
  if jsonb_array_length(d -> 'photos') <> 10 then raise exception 'FAIL: photo takedown (% photos)', jsonb_array_length(d -> 'photos'); end if;
end $$;
reset role;
do $$ begin
  if not exists (select 1 from admin_audit_log where action = 'event.hide') then raise exception 'FAIL: hide not audited'; end if;
end $$;

-- E13. Cancel, then delete. Linked rides survive the event.
select as_user('00000000-0000-0000-0000-0000000e0e01');
set role authenticated;
select set_event_cancelled((select id from ev_ids where k = 'secret'), true);
reset role;
select as_user('00000000-0000-0000-0000-0000000e0e03');
set role authenticated;
select expect_refused($q$select rsvp_event((select id from ev_ids where k = 'secret'), 'going')$q$, 'RSVP to a cancelled event');
reset role;
select as_user('00000000-0000-0000-0000-0000000e0e01');
set role authenticated;
do $$
declare v text[];
begin
  v := delete_event((select id from ev_ids where k = 'rally'));
  if coalesce(array_length(v, 1), 0) <> 10 then raise exception 'FAIL: delete returned % photo paths', array_length(v, 1); end if;
end $$;
reset role;
do $$ begin
  if not exists (select 1 from rides where id = '00000000-0000-0000-0000-0000000e0a01') then raise exception 'FAIL: deleting the event deleted its ride'; end if;
  if exists (select 1 from rider_event_rides where ride_id = '00000000-0000-0000-0000-0000000e0a01') then raise exception 'FAIL: link left behind'; end if;
  if exists (select 1 from reports where event_id is not null and event_id = (select id from ev_ids where k = 'rally')) then raise exception 'FAIL: report kept a dangling event'; end if;
end $$;

-- E14. Admin > Settings can switch Events to Free.
select as_admin_session('00000000-0000-0000-0000-00000000ad01', 'aal2');
set role authenticated;
select admin_set_feature_plan('create_events', 'free', null);
reset role;
select as_user('00000000-0000-0000-0000-0000000e0e02');
set role authenticated;
select save_event(null, '{"title":"Free Meetup","starts_at":"2030-05-01T15:00:00Z","location_name":"Park"}');
reset role;
update feature_plans set min_plan = 'pro' where feature = 'create_events';

select 'ALL EVENT TESTS PASSED';
