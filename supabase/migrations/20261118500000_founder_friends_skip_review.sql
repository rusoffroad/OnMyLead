-- Founder friends leave out the App Review account (Chris, 2026-11-18: "remove app preview test
-- account ... from my feed"). The App Review demo account (appreview@rusoffroad.com, the login
-- Apple's and Google's reviewers use, store/app-store/listing.md) became the founder's friend in
-- 20261118100000_founder_friends.sql, so its test rides filled the founder's Social feed.
--
-- founder_friend_skip lists accounts that are never made a founder's friend automatically (by
-- any founder, now or later). The App Review account goes on it, and the founder friendships it
-- already has are removed. Nothing else about the account changes: it still signs in, keeps Pro,
-- its rides and posts, and reviewers see the app exactly as before. A friendship someone asked
-- for the normal way (founder = false) is never touched.
--
-- Additive only: one table, one new function, and founder_friend_add keeps its signature.
-- No app build needed: the feed is built from friendships on the server.

create table if not exists founder_friend_skip (
  user_id uuid primary key references profiles (id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);
alter table founder_friend_skip enable row level security;
revoke all on founder_friend_skip from anon, authenticated;

insert into founder_friend_skip (user_id, note)
select p.id, 'App Review demo account'
from auth.users u join profiles p on p.id = u.id
where lower(u.email) = 'appreview@rusoffroad.com'
on conflict (user_id) do nothing;

-- Same as 20261118100000_founder_friends.sql, and a skipped account is never added.
create or replace function founder_friend_add(p_founder uuid, p_rider uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_row friendships;
begin
  if p_founder is null or p_rider is null or p_founder = p_rider then return false; end if;
  if exists (select 1 from founder_friend_skip where user_id in (p_founder, p_rider)) then return false; end if;
  if riders_blocked(p_founder, p_rider) then return false; end if;
  if exists (select 1 from founder_friend_optouts where founder_id = p_founder and rider_id = p_rider) then return false; end if;
  select * into v_row from friendships
  where user_lo = least(p_founder, p_rider) and user_hi = greatest(p_founder, p_rider) for update;
  if found then
    if v_row.status = 'accepted' then return false; end if;
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

-- Remove the founder friendships that skipped accounts already have. Returns how many went.
create or replace function founder_friends_drop_skipped()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  delete from friendships f
  where f.founder and exists (select 1 from founder_friend_skip s where s.user_id in (f.user_lo, f.user_hi));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function founder_friends_drop_skipped() from public, anon, authenticated;

select founder_friends_drop_skipped();
