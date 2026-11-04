-- Badge leaderboard (migration 20261104050000_badge_leaderboard.sql): ranking, country and state
-- filters, the Show Me switch and its default, blocks, suspended accounts, and nobody reading
-- another rider's area. Runs after privacy_test.sql (as_user, expect_refused) and the badge tests.
-- Earlier tests leave badges on other riders, so every check here looks only at Iceland (IS),
-- which no other test uses.
--
-- Riders (new here):
--   Ari   0d01  IS / AA  Gold Trail Boss, Silver Crew Rider           = 5 levels
--   Bea   0d02  IS / AA  Gold Trail Boss, Silver Crew Rider, later    = 5 levels (ties Ari, reached later)
--   Cal   0d03  IS / BB  Gold Trail Boss, Gold Crew Rider             = 6 levels
--   Dot   0d04  IS / BB  Bronze Crew Rider + Brand Ambassador         = 1 level (the honor doesn't count)
--   Eve   0d05  IS / AA  shares activity with Nobody, never chose     = off the board
--   Fin   0d06  IS       no badges                                    = off the board
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000d01', 'ari@example.com'),
  ('00000000-0000-0000-0000-000000000d02', 'bea@example.com'),
  ('00000000-0000-0000-0000-000000000d03', 'cal@example.com'),
  ('00000000-0000-0000-0000-000000000d04', 'dot@example.com'),
  ('00000000-0000-0000-0000-000000000d05', 'eve@example.com'),
  ('00000000-0000-0000-0000-000000000d06', 'fin@example.com');
insert into profiles (id, display_name) values
  ('00000000-0000-0000-0000-000000000d01', 'Ari'),
  ('00000000-0000-0000-0000-000000000d02', 'Bea'),
  ('00000000-0000-0000-0000-000000000d03', 'Cal'),
  ('00000000-0000-0000-0000-000000000d04', 'Dot'),
  ('00000000-0000-0000-0000-000000000d05', 'Eve'),
  ('00000000-0000-0000-0000-000000000d06', 'Fin')
on conflict (id) do update set display_name = excluded.display_name;
insert into rider_badges (user_id, badge, level, earned_at) values
  ('00000000-0000-0000-0000-000000000d01', 'trail_boss', 1, '2026-01-01'), ('00000000-0000-0000-0000-000000000d01', 'trail_boss', 2, '2026-01-02'),
  ('00000000-0000-0000-0000-000000000d01', 'trail_boss', 3, '2026-01-03'), ('00000000-0000-0000-0000-000000000d01', 'crew_rider', 1, '2026-01-01'),
  ('00000000-0000-0000-0000-000000000d01', 'crew_rider', 2, '2026-01-04'),
  ('00000000-0000-0000-0000-000000000d02', 'trail_boss', 1, '2026-02-01'), ('00000000-0000-0000-0000-000000000d02', 'trail_boss', 2, '2026-02-02'),
  ('00000000-0000-0000-0000-000000000d02', 'trail_boss', 3, '2026-02-03'), ('00000000-0000-0000-0000-000000000d02', 'crew_rider', 1, '2026-02-01'),
  ('00000000-0000-0000-0000-000000000d02', 'crew_rider', 2, '2026-02-04'),
  ('00000000-0000-0000-0000-000000000d03', 'trail_boss', 1, '2026-03-01'), ('00000000-0000-0000-0000-000000000d03', 'trail_boss', 2, '2026-03-01'),
  ('00000000-0000-0000-0000-000000000d03', 'trail_boss', 3, '2026-03-01'), ('00000000-0000-0000-0000-000000000d03', 'crew_rider', 1, '2026-03-01'),
  ('00000000-0000-0000-0000-000000000d03', 'crew_rider', 2, '2026-03-01'), ('00000000-0000-0000-0000-000000000d03', 'crew_rider', 3, '2026-03-01'),
  ('00000000-0000-0000-0000-000000000d04', 'crew_rider', 1, '2026-01-01'), ('00000000-0000-0000-0000-000000000d04', 'ambassador', 1, '2026-01-01'),
  ('00000000-0000-0000-0000-000000000d05', 'trail_boss', 1, '2026-01-01');
insert into rider_feed_settings (user_id, share_with) values ('00000000-0000-0000-0000-000000000d05', 'nobody');

create function lb(p_country text, p_state text) returns jsonb language sql as $$ select badge_leaderboard(p_country, p_state, 50) $$;
create function lb_names(v jsonb) returns text language sql immutable as $$
  select coalesce(string_agg(r ->> 'name', ',' order by (r ->> 'place')::int), '') from jsonb_array_elements(v -> 'rows') r
$$;

-- L1. Signed out: nothing. Nobody writes the table directly. (The internals are revoked in the
-- migration; privacy_test.sql grants every function for its own checks, so they are not tested here.)
select as_user(null);
set role anon;
select expect_refused($q$select badge_leaderboard()$q$, 'anon read the leaderboard');
select expect_refused($q$select badge_leaderboard_areas()$q$, 'anon read the areas');
select expect_refused($q$select set_leaderboard_settings('US', 'TX', true)$q$, 'anon saved an area');
select expect_refused($q$select * from rider_home_areas$q$, 'anon read areas');
reset role;
select as_user('00000000-0000-0000-0000-000000000d01');
set role authenticated;
select expect_refused($q$insert into rider_home_areas (user_id, country) values (auth.uid(), 'US')$q$, 'rider wrote the table directly');
reset role;

-- L2. Everyone picks an area (Eve and Fin too). Bad codes are refused.
do $$
declare
  v jsonb;
  r record;
begin
  for r in select * from (values
    ('00000000-0000-0000-0000-000000000d01', 'is', 'aa'), ('00000000-0000-0000-0000-000000000d02', 'IS', 'AA'),
    ('00000000-0000-0000-0000-000000000d03', 'IS', 'BB'), ('00000000-0000-0000-0000-000000000d04', 'IS', 'BB'),
    ('00000000-0000-0000-0000-000000000d05', 'IS', 'AA'), ('00000000-0000-0000-0000-000000000d06', 'IS', null)) x(id, c, s)
  loop
    perform as_user(r.id::uuid);
    v := set_leaderboard_settings(r.c, r.s, null);
  end loop;
  perform as_user('00000000-0000-0000-0000-000000000d01');
  v := my_leaderboard_settings();
  if v ->> 'country' <> 'IS' or v ->> 'state' <> 'AA' or (v ->> 'shown')::boolean is not true or (v ->> 'chosen')::boolean then
    raise exception 'FAIL: Ari settings %', v;
  end if;
  perform as_user('00000000-0000-0000-0000-000000000d05');
  v := my_leaderboard_settings();
  if (v ->> 'shown')::boolean or (v ->> 'chosen')::boolean then raise exception 'FAIL: Eve should default to hidden %', v; end if;
  begin
    perform set_leaderboard_settings('USA', null, null);
    raise exception 'FAIL: three-letter country';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    perform set_leaderboard_settings(null, 'TX', null);
    raise exception 'FAIL: state without a country';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    perform set_leaderboard_settings('US', 'TEXAS', null);
    raise exception 'FAIL: state name instead of code';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;

-- L3. The ranking: levels, then Gold, then whoever got there first. Honors don't count;
-- Nobody-sharers and riders without badges aren't listed.
do $$
declare v jsonb;
begin
  perform as_user('00000000-0000-0000-0000-000000000d06');
  v := lb('IS', null);
  if lb_names(v) <> 'Cal,Ari,Bea,Dot' then raise exception 'FAIL: Iceland order %', lb_names(v); end if;
  if (v ->> 'total')::int <> 4 then raise exception 'FAIL: total %', v ->> 'total'; end if;
  if v -> 'me' <> 'null'::jsonb then raise exception 'FAIL: Fin has no badges but has a place %', v -> 'me'; end if;
  if (v #>> '{rows,0,levels}')::int <> 6 or (v #>> '{rows,0,gold}')::int <> 2 then raise exception 'FAIL: Cal counts %', v -> 'rows' -> 0; end if;
  if (v #>> '{rows,3,levels}')::int <> 1 then raise exception 'FAIL: the honor counted for Dot %', v -> 'rows' -> 3; end if;
  if not (v -> 'rows' -> 3 -> 'badges') @> '[{"badge":"ambassador","level":1}]' then raise exception 'FAIL: Dot''s honor not listed for the patch'; end if;
  -- State filter.
  if lb_names(lb('IS', 'AA')) <> 'Ari,Bea' then raise exception 'FAIL: AA %', lb_names(lb('IS', 'AA')); end if;
  if lb_names(lb('is', 'bb')) <> 'Cal,Dot' then raise exception 'FAIL: BB %', lb_names(lb('is', 'bb')); end if;
  begin
    perform lb(null, 'AA');
    raise exception 'FAIL: state filter without a country';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if;
  end;
  -- Areas: Iceland has 4 riders, AA 2, BB 2 (Eve hidden, Fin has no badges).
  v := (select a from jsonb_array_elements(badge_leaderboard_areas()) a where a ->> 'country' = 'IS');
  if (v ->> 'riders')::int <> 4 or jsonb_array_length(v -> 'states') <> 2 then raise exception 'FAIL: areas %', v; end if;
  -- Only these keys go out: no location, no email.
  if exists (select 1 from jsonb_object_keys(lb('IS', null) -> 'rows' -> 0) k
             where k not in ('place', 'user_id', 'name', 'levels', 'gold', 'silver', 'bronze', 'country', 'state', 'me', 'badges')) then
    raise exception 'FAIL: extra keys in a row';
  end if;
end $$;

-- L4. Your own place, even past the limit.
do $$
declare v jsonb;
begin
  perform as_user('00000000-0000-0000-0000-000000000d04');
  v := badge_leaderboard('IS', null, 2);
  if jsonb_array_length(v -> 'rows') <> 2 or (v #>> '{me,place}')::int <> 4 or (v #>> '{me,me}')::boolean is not true then
    raise exception 'FAIL: Dot''s own place %', v;
  end if;
end $$;

-- L5. Show Me off takes a rider off; on brings a Nobody-sharer back. The area can stay as it is.
do $$
declare v jsonb;
begin
  perform as_user('00000000-0000-0000-0000-000000000d01');
  v := set_leaderboard_settings(null, null, false, false);
  if v ->> 'country' <> 'IS' or (v ->> 'shown')::boolean or not (v ->> 'chosen')::boolean then raise exception 'FAIL: switch off %', v; end if;
  if lb_names(lb('IS', null)) <> 'Cal,Bea,Dot' then raise exception 'FAIL: Ari still listed %', lb_names(lb('IS', null)); end if;
  if lb('IS', null) -> 'me' <> 'null'::jsonb then raise exception 'FAIL: hidden Ari still has a place'; end if;
  perform set_leaderboard_settings(null, null, true, false);
  perform as_user('00000000-0000-0000-0000-000000000d05');
  perform set_leaderboard_settings(null, null, true, false);
  if lb_names(lb('IS', 'AA')) <> 'Ari,Bea,Eve' then raise exception 'FAIL: Eve opted in %', lb_names(lb('IS', 'AA')); end if;
  -- Saving the area again keeps the choice.
  perform set_leaderboard_settings('IS', 'AA', null);
  if not (my_leaderboard_settings() ->> 'shown')::boolean then raise exception 'FAIL: area save reset the choice'; end if;
end $$;

-- L6. Blocks hide riders both ways; suspended accounts are left off.
insert into blocked_riders (blocker_id, blocked_id) values ('00000000-0000-0000-0000-000000000d02', '00000000-0000-0000-0000-000000000d03');
do $$ begin
  perform as_user('00000000-0000-0000-0000-000000000d02');
  if lb_names(lb('IS', null)) <> 'Ari,Bea,Dot,Eve' then raise exception 'FAIL: Bea sees Cal %', lb_names(lb('IS', null)); end if;
  perform as_user('00000000-0000-0000-0000-000000000d03');
  if lb_names(lb('IS', null)) <> 'Cal,Ari,Dot,Eve' then raise exception 'FAIL: Cal sees Bea %', lb_names(lb('IS', null)); end if;
end $$;
update auth.users set banned_until = now() + interval '1 day' where id = '00000000-0000-0000-0000-000000000d04';
do $$ begin
  perform as_user('00000000-0000-0000-0000-000000000d01');
  if lb_names(lb('IS', 'BB')) <> 'Cal' then raise exception 'FAIL: suspended Dot listed %', lb_names(lb('IS', 'BB')); end if;
end $$;
update auth.users set banned_until = null where id = '00000000-0000-0000-0000-000000000d04';

-- L7. Riders read only their own area row; deleting the profile removes it.
select as_user('00000000-0000-0000-0000-000000000d01');
set role authenticated;
do $$ begin
  if (select count(*) from rider_home_areas) <> 1 then raise exception 'FAIL: read other riders'' areas'; end if;
end $$;
reset role;
delete from profiles where id = '00000000-0000-0000-0000-000000000d06';
do $$ begin
  if exists (select 1 from rider_home_areas where user_id = '00000000-0000-0000-0000-000000000d06') then raise exception 'FAIL: area kept after delete'; end if;
end $$;

drop function lb(text, text);
drop function lb_names(jsonb);
