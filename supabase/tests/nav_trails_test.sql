-- Navigation Mode shared trails (migration 20261101600000_nav_trails.sql): who sees a trail, what
-- riders may change, accuracy and quality ratings, hiding a trail after bad ratings, the admin
-- Trails page and the "your trail is hidden" push. Runs after release_controls_test.sql
-- (run_local.sh), which leaves as_user, as_session and expect_error in place.
-- Each block raises an exception if a rule is broken.

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000b01', 'mapper@example.test', '{"full_name":"Mia Mapper"}'),
  ('00000000-0000-0000-0000-000000000b02', 'r2@example.test', '{"full_name":"Rider Two"}'),
  ('00000000-0000-0000-0000-000000000b03', 'r3@example.test', '{"full_name":"Rider Three"}'),
  ('00000000-0000-0000-0000-000000000b04', 'r4@example.test', '{"full_name":"Rider Four"}'),
  ('00000000-0000-0000-0000-000000000b05', 'r5@example.test', '{"full_name":"Rider Five"}'),
  ('00000000-0000-0000-0000-000000000b06', 'boss@example.test', '{"full_name":"Trail Boss"}');
insert into admin_users (user_id) values ('00000000-0000-0000-0000-000000000b06');
update profiles set display_name = 'MiaMaps' where id = '00000000-0000-0000-0000-000000000b01';
insert into push_tokens (user_id, token, platform) values ('00000000-0000-0000-0000-000000000b01', 'tok-mia-0123456789abcdef', 'ios');

-- Sharing needs Pro: Mia on Free can't share; with a Pro Trial she can.
delete from entitlement_grants where user_id = '00000000-0000-0000-0000-000000000b01';
select as_user('00000000-0000-0000-0000-000000000b01');
set role authenticated;
select expect_error($q$insert into shared_trails (owner_id, client_id, name, difficulty, vehicles, route, length_m)
  values (auth.uid(), 'free-1', 'Free Try', 'easy', array['atv'], '{"type":"LineString","coordinates":[[0,0],[1,1]]}', 100)$q$, '%pro_required:share_trails%', 'share on Free');
reset role;
insert into entitlement_grants (user_id, source, starts_at, ends_at) values ('00000000-0000-0000-0000-000000000b01', 'trial', now(), now() + interval '30 days');

-- Mia shares a trail. She can't sneak in a status or rating counts.
select as_user('00000000-0000-0000-0000-000000000b01');
set role authenticated;
insert into shared_trails (id, owner_id, client_id, name, difficulty, vehicles, surface, route, length_m, status, rating_count, bad_count)
values ('bbbbbbbb-0000-4000-8000-000000000001', auth.uid(), 'local-1', '  Hidden Canyon Loop ', 'moderate', array['sxs_utv', 'atv'], 'rock',
  '{"type":"LineString","coordinates":[[-109.55,38.57],[-109.54,38.58],[-109.53,38.585]]}', 2400, 'removed', 99, 99);
do $$
declare t shared_trails;
begin
  select * into t from shared_trails where id = 'bbbbbbbb-0000-4000-8000-000000000001';
  if t.status <> 'public' or t.rating_count <> 0 or t.bad_count <> 0 then raise exception 'FAIL: insert kept forged status/counts'; end if;
  if t.name <> 'Hidden Canyon Loop' then raise exception 'FAIL: name not trimmed'; end if;
  if t.min_lat <> 38.57 or t.max_lng <> -109.53 or t.start_lat <> 38.57 or t.start_lng <> -109.55 then raise exception 'FAIL: box/start'; end if;
end $$;
select expect_error($q$insert into shared_trails (owner_id, client_id, name, difficulty, vehicles, route, length_m)
  values (auth.uid(), 'x', 'Bad', 'easy', array['tank'], '{"type":"LineString","coordinates":[[0,0],[1,1]]}', 100)$q$, '%check%', 'unknown vehicle');
select expect_error($q$insert into shared_trails (owner_id, client_id, name, difficulty, vehicles, route, length_m)
  values (auth.uid(), 'y', 'Bad', 'easy', array['atv'], '{"type":"Point","coordinates":[0,0]}', 100)$q$, '%LineString%', 'not a line');
select expect_error($q$insert into shared_trails (owner_id, client_id, name, difficulty, vehicles, route, length_m)
  values (auth.uid(), 'z', 'Bad', 'easy', array['atv'], '{"type":"LineString","coordinates":[[0,0],[500,1]]}', 100)$q$, '%lng, lat%', 'bad point');
select expect_error($q$insert into shared_trails (owner_id, client_id, name, difficulty, vehicles, route, length_m, photos)
  values (auth.uid(), 'w', 'Bad', 'easy', array['atv'], '{"type":"LineString","coordinates":[[0,0],[1,1]]}', 100, array['http://x'])$q$, '%https%', 'http photo');
select expect_error($q$insert into shared_trails (owner_id, client_id, name, difficulty, vehicles, route, length_m)
  values ('00000000-0000-0000-0000-000000000b02', 'v', 'Spoof', 'easy', array['atv'], '{"type":"LineString","coordinates":[[0,0],[1,1]]}', 100)$q$, '%row-level security%', 'share as someone else');
-- Editing details works; status can't be changed by the mapper.
update shared_trails set description = 'Tight in places', status = 'removed' where id = 'bbbbbbbb-0000-4000-8000-000000000001';
select expect_error($q$select rate_trail('bbbbbbbb-0000-4000-8000-000000000001', 5)$q$, '%you mapped%', 'rate own trail');
reset role;
do $$ begin
  if (select status from shared_trails where id = 'bbbbbbbb-0000-4000-8000-000000000001') <> 'public' then raise exception 'FAIL: owner changed status'; end if;
  if (select description from shared_trails where id = 'bbbbbbbb-0000-4000-8000-000000000001') <> 'Tight in places' then raise exception 'FAIL: owner edit lost'; end if;
end $$;

-- Another rider sees it in the area, rated by nobody yet, and can't edit or delete it.
select as_user('00000000-0000-0000-0000-000000000b02');
set role authenticated;
do $$
declare a jsonb := trails_in_area(38.5, -109.6, 38.6, -109.5);
begin
  if jsonb_array_length(a) <> 1 then raise exception 'FAIL: area list %', a; end if;
  if a -> 0 ->> 'mapper' <> 'MiaMaps' or (a -> 0 ->> 'mine')::boolean or a -> 0 ->> 'client_id' is not null then raise exception 'FAIL: mapper fields %', a -> 0; end if;
  if a -> 0 ? 'owner_id' then raise exception 'FAIL: owner id leaked'; end if;
  if jsonb_array_length(trails_in_area(40, -100, 41, -99)) <> 0 then raise exception 'FAIL: far box'; end if;
  update shared_trails set name = 'Mine Now' where id = 'bbbbbbbb-0000-4000-8000-000000000001';
  delete from shared_trails where id = 'bbbbbbbb-0000-4000-8000-000000000001';
end $$;
select expect_error($q$select rate_trail('bbbbbbbb-0000-4000-8000-000000000001', 6)$q$, '%1 to 5%', 'score out of range');
select expect_error($q$select rate_trail('bbbbbbbb-0000-4000-8000-000000000001', 3, null, 0)$q$, '%quality%', 'quality out of range');
select expect_error($q$select rate_trail('bbbbbbbb-0000-4000-8000-000000000001', null, 'hi', null)$q$, '%accuracy or the quality%', 'empty rating');
select expect_error($q$insert into trail_ratings (trail_id, user_id, score) values ('bbbbbbbb-0000-4000-8000-000000000001', auth.uid(), 1)$q$, '%', 'rating without the function');
-- Rider Two says it's accurate and a great ride.
do $$
declare r jsonb := rate_trail('bbbbbbbb-0000-4000-8000-000000000001', 5, 'Spot on', 5);
begin
  if r ->> 'status' <> 'public' or (r ->> 'rating_count')::int <> 1 then raise exception 'FAIL: first rating %', r; end if;
  if (trail_detail('bbbbbbbb-0000-4000-8000-000000000001') ->> 'my_quality')::int <> 5 then raise exception 'FAIL: my quality'; end if;
end $$;
reset role;
do $$ begin
  if (select name from shared_trails where id = 'bbbbbbbb-0000-4000-8000-000000000001') <> 'Hidden Canyon Loop' then raise exception 'FAIL: rider renamed trail'; end if;
end $$;

-- Riders Three and Four rate it inaccurate: 2 bad of 3 is not enough (3 needed by default).
select as_user('00000000-0000-0000-0000-000000000b03');
set role authenticated;
select rate_trail('bbbbbbbb-0000-4000-8000-000000000001', 1, 'Line is in the wrong canyon');
select as_user('00000000-0000-0000-0000-000000000b04');
select rate_trail('bbbbbbbb-0000-4000-8000-000000000001', 2);
-- Rider Four changes their mind: rating again replaces the old one.
select rate_trail('bbbbbbbb-0000-4000-8000-000000000001', 1, null, 2);
reset role;
do $$
declare t shared_trails;
begin
  select * into t from shared_trails where id = 'bbbbbbbb-0000-4000-8000-000000000001';
  if t.status <> 'public' or t.rating_count <> 3 or t.bad_count <> 2 or t.good_count <> 1 then raise exception 'FAIL: counts after 3 ratings %', row_to_json(t); end if;
  if t.quality_count <> 2 or t.quality_sum <> 7 then raise exception 'FAIL: quality counts'; end if;
end $$;

-- Rider Five's bad rating is the third: hidden from everyone but Mia, and a push goes to her.
select as_user('00000000-0000-0000-0000-000000000b05');
set role authenticated;
-- A quality-only rating counts for quality, not toward hiding.
do $$
declare r jsonb := rate_trail('bbbbbbbb-0000-4000-8000-000000000001', null, null, 4);
begin
  if r ->> 'status' <> 'public' or (r ->> 'rating_count')::int <> 3 then raise exception 'FAIL: quality-only rating %', r; end if;
end $$;
do $$
declare r jsonb := rate_trail('bbbbbbbb-0000-4000-8000-000000000001', 1);
begin
  if r ->> 'status' <> 'hidden' then raise exception 'FAIL: not hidden after 3 bad %', r; end if;
  if jsonb_array_length(trails_in_area(38.5, -109.6, 38.6, -109.5)) <> 0 then raise exception 'FAIL: hidden trail still listed'; end if;
  if trail_detail('bbbbbbbb-0000-4000-8000-000000000001') is not null then raise exception 'FAIL: hidden trail detail readable'; end if;
  if exists (select 1 from shared_trails) then raise exception 'FAIL: hidden trail readable'; end if;
end $$;
select expect_error($q$select rate_trail('bbbbbbbb-0000-4000-8000-000000000001', 5)$q$, '%not public%', 'rate a hidden trail');
reset role;

do $$ begin
  if (select quality from trail_ratings where user_id = '00000000-0000-0000-0000-000000000b05') <> 4 then raise exception 'FAIL: accuracy rating dropped the quality'; end if;
end $$;

-- Mia still has it, sees why, sees the ratings' notes, and can mark the notice seen.
select as_user('00000000-0000-0000-0000-000000000b01');
set role authenticated;
do $$
declare m jsonb := my_shared_trails();
begin
  if m -> 0 ->> 'status' <> 'hidden' or m -> 0 ->> 'hidden_reason' <> 'ratings' or (m -> 0 ->> 'hidden_seen')::boolean then raise exception 'FAIL: mine %', m; end if;
  if (select count(*) from trail_ratings where trail_id = 'bbbbbbbb-0000-4000-8000-000000000001') <> 4 then raise exception 'FAIL: mapper reads ratings'; end if;
  if jsonb_array_length(trails_in_area(38.5, -109.6, 38.6, -109.5)) <> 1 then raise exception 'FAIL: mapper lost own hidden trail on map'; end if;
  update shared_trails set hidden_seen_at = now() where id = 'bbbbbbbb-0000-4000-8000-000000000001';
  if not (my_shared_trails() -> 0 ->> 'hidden_seen')::boolean then raise exception 'FAIL: notice not marked seen'; end if;
end $$;
reset role;
do $$
declare p record;
begin
  select * into p from push_batch_account(jsonb_build_object('type', 'trail_hidden', 'user', '00000000-0000-0000-0000-000000000b01',
    'trail', 'bbbbbbbb-0000-4000-8000-000000000001', 'name', 'Hidden Canyon Loop', 'reason', 'ratings'));
  if p.token <> 'tok-mia-0123456789abcdef' or p.title <> 'Your Trail Is Hidden' or p.body not like '%Hidden Canyon Loop%' or p.data ->> 'url' <> '/nav/trails' then
    raise exception 'FAIL: hidden push %', row_to_json(p);
  end if;
  -- Trial reminders still work the same way.
  if not exists (select 1 from push_batch_account(jsonb_build_object('type', 'trial', 'user', '00000000-0000-0000-0000-000000000b01', 'stage', '3d'))) then
    raise exception 'FAIL: trial push broke';
  end if;
  if exists (select 1 from push_batch_account(jsonb_build_object('type', 'other', 'user', '00000000-0000-0000-0000-000000000b01'))) then
    raise exception 'FAIL: unknown account event pushed';
  end if;
end $$;

-- Riders can't use the admin functions; the admin needs two-factor.
select as_user('00000000-0000-0000-0000-000000000b02');
set role authenticated;
select expect_error($q$select admin_trails()$q$, '%admin%', 'rider lists trails');
select expect_error($q$select admin_set_trail_status('bbbbbbbb-0000-4000-8000-000000000001', 'public')$q$, '%admin%', 'rider restores trail');
select expect_error($q$select admin_set_trail_rules(5, 0.5)$q$, '%admin%', 'rider sets rules');
reset role;
select as_session('00000000-0000-0000-0000-000000000b06', 'aal1');
set role authenticated;
select expect_error($q$select admin_trails()$q$, '%two-factor%', 'admin trails without aal2');
reset role;

-- The admin lists it, puts it back, and only new bad ratings count toward hiding it again.
select as_session('00000000-0000-0000-0000-000000000b06', 'aal2');
set role authenticated;
do $$
declare a jsonb := admin_trails('hidden');
begin
  if (a ->> 'total')::int <> 1 or (a #>> '{counts,hidden}')::int <> 1 then raise exception 'FAIL: admin list %', a; end if;
  if a -> 'rows' -> 0 ->> 'owner_email' <> 'mapper@example.test' then raise exception 'FAIL: owner email'; end if;
  if jsonb_array_length(a -> 'rows' -> 0 -> 'notes') <> 2 then raise exception 'FAIL: notes %', a -> 'rows' -> 0 -> 'notes'; end if;
  if (a #>> '{rules,min_bad}')::int <> 3 then raise exception 'FAIL: rules'; end if;
  if (admin_trails('all', 'canyon') ->> 'total')::int <> 1 or (admin_trails('all', 'nothing') ->> 'total')::int <> 0 then raise exception 'FAIL: search'; end if;
  perform admin_set_trail_status('bbbbbbbb-0000-4000-8000-000000000001', 'public');
  perform admin_set_trail_rules(2, 0.4);
end $$;
select expect_error($q$select admin_set_trail_rules(1, 0.5)$q$, '%2 to 50%', 'rule too low');
select expect_error($q$select admin_set_trail_status('bbbbbbbb-0000-4000-8000-000000000001', 'gone')$q$, '%status%', 'bad status');
reset role;
do $$ begin
  if (select status from shared_trails where id = 'bbbbbbbb-0000-4000-8000-000000000001') <> 'public' then raise exception 'FAIL: not restored'; end if;
  if (select count(*) from admin_audit_log where target_id = 'bbbbbbbb-0000-4000-8000-000000000001' and action = 'trail.public') <> 1 then raise exception 'FAIL: restore not logged'; end if;
  if (select min_bad from trail_rules) <> 2 then raise exception 'FAIL: rule not saved'; end if;
end $$;
-- Rider Two re-rates it bad: one new bad rating (needs 2 now) keeps it up.
select as_user('00000000-0000-0000-0000-000000000b02');
set role authenticated;
do $$ begin
  if rate_trail('bbbbbbbb-0000-4000-8000-000000000001', 1) ->> 'status' <> 'public' then raise exception 'FAIL: old ratings counted after restore'; end if;
end $$;
-- Rider Three rates it bad again: two new bad ratings since the restore hide it.
select as_user('00000000-0000-0000-0000-000000000b03');
do $$ begin
  if rate_trail('bbbbbbbb-0000-4000-8000-000000000001', 2) ->> 'status' <> 'hidden' then raise exception 'FAIL: not hidden again'; end if;
end $$;
reset role;

-- Stop Sharing: Mia deletes the public copy, and its ratings go with it.
select as_user('00000000-0000-0000-0000-000000000b01');
set role authenticated;
delete from shared_trails where id = 'bbbbbbbb-0000-4000-8000-000000000001';
reset role;
do $$ begin
  if exists (select 1 from shared_trails where id = 'bbbbbbbb-0000-4000-8000-000000000001') or exists (select 1 from trail_ratings where trail_id = 'bbbbbbbb-0000-4000-8000-000000000001') then
    raise exception 'FAIL: stop sharing left rows';
  end if;
end $$;
update trail_rules set min_bad = 3, bad_share = 0.5;
select as_user(null);
select set_config('request.jwt.claims', '', false);

-- Mia's Pro ends: she can still re-save (upsert) the trail she shared, but not share a new one.
select as_user('00000000-0000-0000-0000-000000000b01');
set role authenticated;
insert into shared_trails (owner_id, client_id, name, difficulty, vehicles, route, length_m)
values (auth.uid(), 'local-2', 'Second Trail', 'easy', array['atv'], '{"type":"LineString","coordinates":[[-109.55,38.57],[-109.54,38.58]]}', 1500);
reset role;
update entitlement_grants set starts_at = now() - interval '40 days', ends_at = now() - interval '1 day'
  where user_id = '00000000-0000-0000-0000-000000000b01';
select as_user('00000000-0000-0000-0000-000000000b01');
set role authenticated;
insert into shared_trails (owner_id, client_id, name, difficulty, vehicles, route, length_m)
values (auth.uid(), 'local-2', 'Second Trail', 'easy', array['sxs_utv'], '{"type":"LineString","coordinates":[[-109.55,38.57],[-109.54,38.58]]}', 1500)
on conflict (owner_id, client_id) do update set vehicles = excluded.vehicles;
select expect_error($q$insert into shared_trails (owner_id, client_id, name, difficulty, vehicles, route, length_m)
  values (auth.uid(), 'new-after-pro', 'New One', 'easy', array['atv'], '{"type":"LineString","coordinates":[[0,0],[1,1]]}', 100)$q$, '%pro_required:share_trails%', 'new share after Pro ends');
reset role;
do $$ begin
  if (select vehicles from shared_trails where owner_id = '00000000-0000-0000-0000-000000000b01' and client_id = 'local-2') <> array['sxs_utv'] then
    raise exception 'FAIL: re-save after Pro ended';
  end if;
  if (select min_plan from feature_plans where feature = 'trail_rides') <> 'pro' then raise exception 'FAIL: trail_rides not Pro'; end if;
end $$;

-- A group ride on a trail (route source 'trail') needs Pro, like a GPX import (pro_test.sql's Free rider).
select as_user('00000000-0000-0000-0000-0000000001b1');
set role authenticated;
select expect_error($q$update ride_private_details set route_geojson = '{"type":"Feature","properties":{"source":"trail"}}'
  where ride_id = '31000000-0000-0000-0000-000000000004'$q$, '%pro_required:trail_rides%', 'free rider saved a trail route');
reset role;
