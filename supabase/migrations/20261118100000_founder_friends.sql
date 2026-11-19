-- Founder friends (Chris, 2026-11-18): "As the founder of the app, make me friends with everyone
-- on the app. Let my posts show up on their feeds and theirs on mine."
--
-- Whoever holds the OnMyLead Founder honor (rider_badges.badge = 'founder', given from Admin,
-- migration 20261103900000_founder_badge.sql) is friends with every rider: every rider there is
-- now, and every rider who signs up later. These are ordinary accepted rows in friendships with
-- founder = true, so the Home Feed, Social, profiles and Friends treat them like any friendship,
-- and every app build already in riders' hands shows them with no update.
--
-- What it does not change:
-- - Location. A founder friendship never counts as "riders you know" for Out Riding:
--   out_riding_visible now asks riders_know_each_other_nearby, which leaves founder friendships
--   out. So the founder sees a rider Out Riding only under the same rules as before (ridden
--   together, same riding group, a friendship they asked for, or both chose Everyone). Being
--   friends still never shares a location anywhere else.
-- - Riders' choices. A rider's "Who Sees Your Activity" still decides whether the founder sees
--   their activity (Nobody stays nobody), and the founder's own setting decides his.
-- - Removing and blocking. A rider who removes the founder as a friend, or blocks him (or whom he
--   removes or blocks), goes on founder_friend_optouts and is never added back, even after an
--   unblock. They can still send a friend request the normal way if they change their mind.
-- - No pushes or inbox items: nobody is told about a founder friendship being added.
--
-- Additive only: one column with a default, one table, new functions and triggers, and
-- out_riding_visible / remove_friend / friendships_on_block keep their signatures.

alter table friendships add column if not exists founder boolean not null default false;

-- Riders who are never made the founder's friend again (they or he removed or blocked).
create table if not exists founder_friend_optouts (
  founder_id uuid not null references profiles (id) on delete cascade,
  rider_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (founder_id, rider_id)
);
alter table founder_friend_optouts enable row level security;
revoke all on founder_friend_optouts from anon, authenticated;

create or replace function is_founder(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from rider_badges where user_id = p_user and badge = 'founder');
$$;
revoke execute on function is_founder(uuid) from public, anon, authenticated;

-- Make p_founder and p_rider friends, unless that's not allowed. Returns true when a row was
-- added or a waiting request was accepted.
create or replace function founder_friend_add(p_founder uuid, p_rider uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_row friendships;
begin
  if p_founder is null or p_rider is null or p_founder = p_rider then return false; end if;
  if riders_blocked(p_founder, p_rider) then return false; end if;
  if exists (select 1 from founder_friend_optouts where founder_id = p_founder and rider_id = p_rider) then return false; end if;
  select * into v_row from friendships
  where user_lo = least(p_founder, p_rider) and user_hi = greatest(p_founder, p_rider) for update;
  if found then
    if v_row.status = 'accepted' then return false; end if;
    -- A request was waiting either way: it's a friendship now.
    update friendships set status = 'accepted', accepted_at = now(), founder = true
    where user_lo = v_row.user_lo and user_hi = v_row.user_hi;
    return true;
  end if;
  insert into friendships (user_lo, user_hi, requested_by, status, accepted_at, founder)
  values (least(p_founder, p_rider), greatest(p_founder, p_rider), p_founder, 'accepted', now(), true)
  on conflict (user_lo, user_hi) do nothing;
  return found;
end;
$$;
revoke execute on function founder_friend_add(uuid, uuid) from public, anon, authenticated;

-- Every rider, for one founder. Returns how many friendships were added.
create or replace function founder_friend_everyone(p_founder uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_n int := 0;
  v_id uuid;
begin
  if not is_founder(p_founder) then return 0; end if;
  for v_id in select id from profiles where id <> p_founder loop
    if founder_friend_add(p_founder, v_id) then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end;
$$;
revoke execute on function founder_friend_everyone(uuid) from public, anon, authenticated;

-- A new rider: friends with every founder.
create or replace function founder_friends_on_signup()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_founder uuid;
begin
  for v_founder in select distinct user_id from rider_badges where badge = 'founder' loop
    perform founder_friend_add(v_founder, new.id);
  end loop;
  return null;
end;
$$;
drop trigger if exists profiles_founder_friends on profiles;
create trigger profiles_founder_friends after insert on profiles
  for each row execute function founder_friends_on_signup();

-- Given the Founder honor: friends with everyone. Taken back: the friendships it made go
-- (friendships riders asked for stay).
create or replace function founder_friends_on_badge()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.badge = 'founder' then perform founder_friend_everyone(new.user_id); end if;
    return null;
  end if;
  if old.badge = 'founder' and not is_founder(old.user_id) then
    delete from friendships f
    where f.founder and old.user_id in (f.user_lo, f.user_hi)
      and not is_founder(case when f.user_lo = old.user_id then f.user_hi else f.user_lo end);
  end if;
  return null;
end;
$$;
drop trigger if exists rider_badges_founder_friends on rider_badges;
create trigger rider_badges_founder_friends after insert or delete on rider_badges
  for each row execute function founder_friends_on_badge();

-- Remember that a founder and a rider parted ways (either one removed or blocked the other).
create or replace function founder_friend_optout(p_a uuid, p_b uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if is_founder(p_a) and not is_founder(p_b) then
    insert into founder_friend_optouts (founder_id, rider_id) values (p_a, p_b) on conflict do nothing;
  elsif is_founder(p_b) and not is_founder(p_a) then
    insert into founder_friend_optouts (founder_id, rider_id) values (p_b, p_a) on conflict do nothing;
  end if;
end;
$$;
revoke execute on function founder_friend_optout(uuid, uuid) from public, anon, authenticated;

-- Remove a friend, or cancel a request I sent (or decline one I got). The other rider isn't told.
-- (Same as 20261101800000_friends.sql, and removing the founder, or him removing you, sticks.)
create or replace function remove_friend(p_other uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'sign in first'; end if;
  delete from friendships where user_lo = least(v_me, p_other) and user_hi = greatest(v_me, p_other);
  if found then perform founder_friend_optout(v_me, p_other); end if;
  return found;
end;
$$;

-- Blocking removes the friendship and any request, both ways, and a founder never comes back.
create or replace function friendships_on_block()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from friendships
  where user_lo = least(new.blocker_id, new.blocked_id) and user_hi = greatest(new.blocker_id, new.blocked_id);
  perform founder_friend_optout(new.blocker_id, new.blocked_id);
  return null;
end;
$$;

-- Riders who know each other for Out Riding: as riders_know_each_other, but a founder
-- friendship doesn't count (only friendships a rider asked for or accepted).
create or replace function riders_know_each_other_nearby(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
           select 1 from friendships
           where user_lo = least(p_a, p_b) and user_hi = greatest(p_a, p_b) and status = 'accepted' and not founder
         )
      or ridden_together(p_a, p_b)
      or exists (
        select 1 from riding_groups g
        where (g.owner_id = p_a or exists (select 1 from riding_group_members m where m.group_id = g.id and m.user_id = p_a))
          and (g.owner_id = p_b or exists (select 1 from riding_group_members m where m.group_id = g.id and m.user_id = p_b))
      );
$$;
revoke execute on function riders_know_each_other_nearby(uuid, uuid) from public, anon, authenticated;

-- Can p_viewer see p_rider in Out Riding right now? (Same as 20261101700000_out_riding.sql, with
-- riders_know_each_other_nearby, so a founder friendship never shows anyone's area.)
create or replace function out_riding_visible(p_viewer uuid, p_rider uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_viewer is not null and p_rider is not null and p_viewer <> p_rider and exists (
    select 1 from out_riding v join out_riding o on o.user_id = p_rider
    where v.user_id = p_viewer and out_riding_live(v) and out_riding_live(o)
      and miles_between(v.area_lat, v.area_lng, o.area_lat, o.area_lng) <= out_riding_max_miles()
      and not riders_blocked(p_viewer, p_rider)
      and ((o.audience = 'everyone' and v.audience = 'everyone') or riders_know_each_other_nearby(p_viewer, p_rider))
  );
$$;
revoke execute on function out_riding_visible(uuid, uuid) from public, anon, authenticated;

-- Everyone there is now, for whoever already holds the Founder honor.
select founder_friend_everyone(f.user_id) from (select distinct user_id from rider_badges where badge = 'founder') f;
