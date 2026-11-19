-- Places to Ride (migration 20261119100000_places_to_ride.sql): the place page in one call (details,
-- trails by level, reviews); riders review a place once, change it, delete it; photos only from
-- their own folder; hidden reviews, suspended riders and blocked riders don't show; the admin hides
-- reviews and edits a place's details. Runs after riding_spots_test.sql (its places d001.. are used).

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000f5a1', 'rev1-places@example.test', '{"full_name":"Rocky Reviewer"}'),
  ('00000000-0000-0000-0000-00000000f5a2', 'rev2-places@example.test', '{"full_name":"Dusty Second"}'),
  ('00000000-0000-0000-0000-00000000f5a3', 'rev3-places@example.test', '{"full_name":"Banned Bob"}');
update riding_spots set address = '7030 E FM 1431, Marble Falls, TX 78654', phone = '830-798-9820', hours = E'Mon–Thu 9 AM–5 PM'
where id = '00000000-0000-0000-0000-00000000d001';

-- Signed out: the page has the place, its details and its trails (Hidden Falls is drawn by Park Trails); no reviews yet.
select as_user(null);
set role anon;
do $$
declare j jsonb := riding_spot_page('00000000-0000-0000-0000-00000000d001');
begin
  if j -> 'spot' ->> 'phone' <> '830-798-9820' or j -> 'spot' ->> 'address' not like '7030 E FM 1431%' then raise exception 'FAIL: details %', j -> 'spot'; end if;
  if (j -> 'trails' ->> 'trails')::int < 50 or (j -> 'trails' ->> 'miles')::numeric < 10 or (j -> 'trails' ->> 'extreme')::int < 1 then raise exception 'FAIL: trails %', j -> 'trails'; end if;
  if (j -> 'trails' ->> 'trails')::int <> (j -> 'trails' ->> 'easy')::int + (j -> 'trails' ->> 'medium')::int + (j -> 'trails' ->> 'hard')::int
       + (j -> 'trails' ->> 'extreme')::int + (j -> 'trails' ->> 'unrated')::int + (j -> 'trails' ->> 'closed')::int then raise exception 'FAIL: levels do not add up %', j -> 'trails'; end if;
  if (j -> 'reviews' ->> 'count')::int <> 0 or j -> 'reviews' ->> 'average' is not null or j -> 'reviews' -> 'mine' <> 'null'::jsonb then raise exception 'FAIL: empty reviews %', j -> 'reviews'; end if;
  -- A place with no drawn trails has no trails block; a hidden place has no page.
  if riding_spot_page('00000000-0000-0000-0000-00000000d004') -> 'trails' <> 'null'::jsonb then raise exception 'FAIL: trails on BLM place'; end if;
  if riding_spot_page('00000000-0000-0000-0000-00000000d005') is not null then raise exception 'FAIL: hidden place has a page'; end if;
end $$;
select expect_error($q$select save_riding_spot_review('00000000-0000-0000-0000-00000000d001', 5)$q$, '%Sign in%', 'anon reviews');
select expect_error($q$select * from riding_spot_reviews$q$, '%permission denied%', 'anon reads the table');
reset role;

-- Rocky reviews Hidden Falls with a photo from his own folder, then changes it (still one review).
select as_user('00000000-0000-0000-0000-00000000f5a1');
set role authenticated;
do $$
declare a uuid; b uuid;
begin
  a := save_riding_spot_review('00000000-0000-0000-0000-00000000d001', 4, '  Carnage Canyon is no joke.  ', array['00000000-0000-0000-0000-00000000f5a1/a1.jpg']);
  b := save_riding_spot_review('00000000-0000-0000-0000-00000000d001', 5, 'Carnage Canyon is no joke. Bring a spotter.', array['00000000-0000-0000-0000-00000000f5a1/a1.jpg', '00000000-0000-0000-0000-00000000f5a1/a2.jpg']);
  if a <> b then raise exception 'FAIL: a second review was made'; end if;
end $$;
select expect_error($q$select save_riding_spot_review('00000000-0000-0000-0000-00000000d001', 6)$q$, '%1 to 5%', 'six stars');
select expect_error($q$select save_riding_spot_review('00000000-0000-0000-0000-00000000d001', 5, null, array['00000000-0000-0000-0000-00000000f5a2/x.jpg'])$q$, '%bad photo%', 'someone else''s photo');
select expect_error($q$select save_riding_spot_review('00000000-0000-0000-0000-00000000d001', 5, null, array['00000000-0000-0000-0000-00000000f5a1/../x.jpg'])$q$, '%bad photo%', 'path trick');
select expect_error($q$select save_riding_spot_review('00000000-0000-0000-0000-00000000d001', 5, null, array['a','b','c','d','e'])$q$, '%4 photos%', 'five photos');
select expect_error($q$select save_riding_spot_review('00000000-0000-0000-0000-00000000d005', 5)$q$, '%no such place%', 'hidden place');
select expect_error($q$select save_riding_spot_review('00000000-0000-0000-0000-00000000d001', 5, repeat('x', 1001))$q$, '%1,000%', 'long review');
select expect_error($q$insert into riding_spot_reviews (spot_id, user_id, stars) values ('00000000-0000-0000-0000-00000000d001', auth.uid(), 5)$q$, '%row-level security%', 'raw insert');
select expect_error($q$select admin_riding_spot_reviews()$q$, '%admin only%', 'rider lists admin reviews');
reset role;

-- Dusty gives 2 stars; Banned Bob gives 1 and is then suspended.
select as_user('00000000-0000-0000-0000-00000000f5a2');
set role authenticated;
select save_riding_spot_review('00000000-0000-0000-0000-00000000d001', 2, 'Too rocky for my stock rig.');
reset role;
select as_user('00000000-0000-0000-0000-00000000f5a3');
set role authenticated;
select save_riding_spot_review('00000000-0000-0000-0000-00000000d001', 1, 'spam spam');
reset role;
update auth.users set banned_until = now() + interval '30 days' where id = '00000000-0000-0000-0000-00000000f5a3';

-- Signed out: two reviews (not the suspended rider's), average 3.5, newest first, photos, no rider ids.
select as_user(null);
set role anon;
do $$
declare j jsonb := riding_spot_page('00000000-0000-0000-0000-00000000d001') -> 'reviews';
begin
  if (j ->> 'count')::int <> 2 or (j ->> 'average')::numeric <> 3.5 then raise exception 'FAIL: rating %', j; end if;
  if j -> 'list' -> 0 ->> 'name' <> 'Dusty Second' or j -> 'list' -> 1 ->> 'name' <> 'Rocky Reviewer' then raise exception 'FAIL: order %', j -> 'list'; end if;
  if j -> 'list' -> 1 ->> 'body' <> 'Carnage Canyon is no joke. Bring a spotter.' or (j -> 'list' -> 1 ->> 'stars')::int <> 5 then raise exception 'FAIL: edit %', j -> 'list' -> 1; end if;
  if jsonb_array_length(j -> 'photos') <> 2 then raise exception 'FAIL: photos %', j -> 'photos'; end if;
  if j -> 'list' -> 0 ->> 'user_id' is not null then raise exception 'FAIL: anon got a rider id'; end if;
end $$;
reset role;

-- Rocky sees his own review as his; after he blocks Dusty, Dusty's review is gone for him only.
select as_user('00000000-0000-0000-0000-00000000f5a1');
set role authenticated;
do $$
declare j jsonb := riding_spot_page('00000000-0000-0000-0000-00000000d001') -> 'reviews';
begin
  if (j -> 'mine' ->> 'stars')::int <> 5 or (j -> 'mine' ->> 'hidden')::boolean then raise exception 'FAIL: mine %', j -> 'mine'; end if;
  if not (j -> 'list' -> 1 ->> 'mine')::boolean or j -> 'list' -> 1 ->> 'user_id' <> '00000000-0000-0000-0000-00000000f5a1' then raise exception 'FAIL: mine flag %', j -> 'list'; end if;
end $$;
insert into blocked_riders (blocked_id) values ('00000000-0000-0000-0000-00000000f5a2');
do $$
declare j jsonb := riding_spot_page('00000000-0000-0000-0000-00000000d001') -> 'reviews';
begin
  if (j ->> 'count')::int <> 1 or (j ->> 'average')::numeric <> 5 then raise exception 'FAIL: block %', j; end if;
end $$;
delete from blocked_riders where blocked_id = '00000000-0000-0000-0000-00000000f5a2';
reset role;

-- The admin hides Rocky's review, and fills in a place's details.
select as_session('00000000-0000-0000-0000-000000000d72', 'aal2');
set role authenticated;
do $$
declare
  j jsonb := admin_riding_spot_reviews('all');
  v uuid;
begin
  if (j ->> 'total')::int <> 3 or (j -> 'counts' ->> 'live')::int <> 3 then raise exception 'FAIL: admin reviews %', j; end if;
  select (x ->> 'id')::uuid into v from jsonb_array_elements(j -> 'rows') x where x ->> 'email' = 'rev1-places@example.test';
  if v is null then raise exception 'FAIL: admin row for Rocky'; end if;
  perform admin_set_riding_spot_review_status(v, 'hidden');
  if (admin_riding_spot_reviews('hidden') ->> 'total')::int <> 1 then raise exception 'FAIL: hidden filter'; end if;
  perform admin_save_riding_spot('00000000-0000-0000-0000-00000000d002', '{"phone":"325-555-0100","hours":"Sat–Sun 8 AM–6 PM","fees":"Day pass at the gate"}');
  j := admin_riding_spots('live', 'Katemcy');
  if j -> 'rows' -> 0 ->> 'phone' <> '325-555-0100' or j -> 'rows' -> 0 ->> 'details_source' <> 'OnMyLead' or (j -> 'rows' -> 0 ->> 'details_checked')::date <> current_date then
    raise exception 'FAIL: admin details %', j -> 'rows' -> 0;
  end if;
  if (admin_riding_spots('live', 'Hidden Falls') -> 'rows' -> 0 ->> 'reviews')::int <> 2 then raise exception 'FAIL: review count on the admin row'; end if;
end $$;
select expect_error($q$select admin_save_riding_spot('00000000-0000-0000-0000-00000000d002', '{"phone":"call me maybe"}')$q$, '%check constraint%', 'bad phone');
reset role;
do $$ begin
  if not exists (select 1 from admin_audit_log where action = 'riding_spot_review.hidden') then raise exception 'FAIL: review audit'; end if;
end $$;

-- Rocky's hidden review: gone for everyone else, he still sees it marked hidden, and editing it doesn't bring it back.
select as_user('00000000-0000-0000-0000-00000000f5a1');
set role authenticated;
select save_riding_spot_review('00000000-0000-0000-0000-00000000d001', 5, 'Edited after it was hidden.');
do $$
declare j jsonb := riding_spot_page('00000000-0000-0000-0000-00000000d001') -> 'reviews';
begin
  if (j ->> 'count')::int <> 1 or not (j -> 'mine' ->> 'hidden')::boolean then raise exception 'FAIL: hidden review %', j; end if;
  if jsonb_array_length(j -> 'photos') <> 0 then raise exception 'FAIL: hidden photos show'; end if;
end $$;
-- He deletes it and gets its photo paths back (none after the edit); deleting again is fine.
do $$
declare p text[];
begin
  perform save_riding_spot_review('00000000-0000-0000-0000-00000000d001', 5, null, array['00000000-0000-0000-0000-00000000f5a1/a1.jpg']);
  p := delete_my_riding_spot_review('00000000-0000-0000-0000-00000000d001');
  if p <> array['00000000-0000-0000-0000-00000000f5a1/a1.jpg'] then raise exception 'FAIL: delete returned %', p; end if;
  if delete_my_riding_spot_review('00000000-0000-0000-0000-00000000d001') <> '{}' then raise exception 'FAIL: second delete'; end if;
  if riding_spot_page('00000000-0000-0000-0000-00000000d001') -> 'reviews' -> 'mine' <> 'null'::jsonb then raise exception 'FAIL: still mine'; end if;
end $$;
reset role;

-- Favorite Places: Rocky saves two places (once each), sees them newest first with distances, unsaves one.
select as_user('00000000-0000-0000-0000-00000000f5a1');
set role authenticated;
do $$
declare ids uuid[];
begin
  if not set_riding_spot_favorite('00000000-0000-0000-0000-00000000d001', true) then raise exception 'FAIL: save'; end if;
  perform set_riding_spot_favorite('00000000-0000-0000-0000-00000000d001', true);
  perform set_riding_spot_favorite('00000000-0000-0000-0000-00000000d004', true);
  select array_agg(id order by id desc) into ids from my_favorite_riding_spots(30.57, -98.27);
  if ids is distinct from array['00000000-0000-0000-0000-00000000d004', '00000000-0000-0000-0000-00000000d001']::uuid[] then raise exception 'FAIL: favorites %', ids; end if;
  if (select distance_mi from my_favorite_riding_spots(30.57, -98.27) where id = '00000000-0000-0000-0000-00000000d001') not between 4 and 8 then raise exception 'FAIL: favorite distance'; end if;
  if not (riding_spot_page('00000000-0000-0000-0000-00000000d001') ->> 'favorite')::boolean then raise exception 'FAIL: page favorite'; end if;
  if set_riding_spot_favorite('00000000-0000-0000-0000-00000000d004', false) then raise exception 'FAIL: unsave'; end if;
  if (select count(*) from my_favorite_riding_spots()) <> 1 then raise exception 'FAIL: after unsave'; end if;
end $$;
select expect_error($q$select set_riding_spot_favorite('00000000-0000-0000-0000-00000000d005', true)$q$, '%no such place%', 'favorite a hidden place');
-- The table itself gives nothing away (row-level security, no policies): only the functions read it.
do $$ begin
  begin
    if exists (select 1 from riding_spot_favorites) then raise exception 'FAIL: favorites table readable'; end if;
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
-- Nobody else sees Rocky's favorites; signed out there are none and saving asks to sign in.
select as_user('00000000-0000-0000-0000-00000000f5a2');
set role authenticated;
do $$ begin
  if (select count(*) from my_favorite_riding_spots()) <> 0 then raise exception 'FAIL: saw someone else''s favorites'; end if;
  if (riding_spot_page('00000000-0000-0000-0000-00000000d001') ->> 'favorite')::boolean then raise exception 'FAIL: page favorite for someone else'; end if;
end $$;
reset role;
select as_user(null);
set role anon;
do $$ begin
  if (riding_spot_page('00000000-0000-0000-0000-00000000d001') ->> 'favorite')::boolean then raise exception 'FAIL: anon favorite'; end if;
end $$;
select expect_error($q$select set_riding_spot_favorite('00000000-0000-0000-0000-00000000d001', true)$q$, '%Sign in%', 'anon favorites');
reset role;

-- An older build's direct read of the table still works (it selects only the columns it knows).
select as_user(null);
set role anon;
do $$ begin
  if (select count(*) from (select id, source, name, kind, lat, lng, state, area_name, description, website, vehicle_types, license, attribution
                            from riding_spots where id = '00000000-0000-0000-0000-00000000d001') x) <> 1 then raise exception 'FAIL: old read'; end if;
  if (select hours from riding_spots where id = '00000000-0000-0000-0000-00000000d001') is null then raise exception 'FAIL: new columns unreadable'; end if;
end $$;
reset role;

select 'places to ride ok';
