-- Social profiles on rider info.
-- A rider who signs in with Apple, Google or Facebook can show that account (which service, the
-- name and photo on it) to the riders they ride with, so others can see who they are.
--
-- Privacy, in line with the rest of the app:
--   * Off until the rider turns it on (Show My Google Profile on the You tab).
--   * Only riders who share a ride or a riding group with them can see it, never strangers browsing
--     public rides, and never anyone either of them has blocked.
--   * The row is filled from auth.identities by the server, so nobody can claim an account they
--     didn't sign in with. Riders can only switch it on or off.
--   * Deleted with the account (cascade).
--
-- Additive only: one new table and three functions.

create table rider_social_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  provider text not null check (provider in ('apple', 'google', 'facebook')),
  name text check (char_length(name) <= 80),
  photo_url text check (photo_url ~ '^https://' and char_length(photo_url) <= 1000),
  shown boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table rider_social_profiles enable row level security;

-- May the signed-in rider see this rider's social profile? Riders they have been on a ride with
-- (both joined) or share a riding group with, unless either has blocked the other.
create or replace function can_see_social_profile(p_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_owner = auth.uid()
    or (
      auth.uid() is not null
      and not exists (
        select 1 from blocked_riders
        where (blocker_id = auth.uid() and blocked_id = p_owner) or (blocker_id = p_owner and blocked_id = auth.uid())
      )
      and (
        exists (
          select 1 from ride_members a
          join ride_members b on b.ride_id = a.ride_id
          where a.user_id = auth.uid() and b.user_id = p_owner and a.status = 'joined' and b.status = 'joined'
        )
        or exists (
          select 1 from (
            select id as group_id from riding_groups where owner_id = auth.uid()
            union select group_id from riding_group_members where user_id = auth.uid()
          ) mine
          join (
            select id as group_id from riding_groups where owner_id = p_owner
            union select group_id from riding_group_members where user_id = p_owner
          ) theirs using (group_id)
        )
      )
    );
$$;
revoke execute on function can_see_social_profile(uuid) from public, anon;
grant execute on function can_see_social_profile(uuid) to authenticated;

create policy rider_social_profiles_read on rider_social_profiles for select to authenticated
  using (user_id = auth.uid() or (shown and can_see_social_profile(user_id)));
-- No insert/update/delete policies: rows change only through the two functions below.

revoke all on rider_social_profiles from anon, authenticated;
grant select on rider_social_profiles to authenticated;

-- Copies the rider's most recent Apple, Google or Facebook sign-in into their row, keeping their
-- choice to show it. Removes the row when they have none. The app calls it after signing in.
create or replace function sync_social_profile()
returns rider_social_profiles language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  i record;
  r rider_social_profiles;
begin
  if me is null then raise exception 'Sign in first'; end if;
  select provider, identity_data into i
  from auth.identities
  where user_id = me and provider in ('apple', 'google', 'facebook')
  order by last_sign_in_at desc nulls last, created_at desc nulls last
  limit 1;
  if not found then
    delete from rider_social_profiles where user_id = me;
    return null;
  end if;
  insert into rider_social_profiles (user_id, provider, name, photo_url)
  values (
    me,
    i.provider,
    left(nullif(trim(coalesce(i.identity_data ->> 'full_name', i.identity_data ->> 'name', '')), ''), 80),
    case when coalesce(i.identity_data ->> 'avatar_url', i.identity_data ->> 'picture', '') ~ '^https://'
      then left(coalesce(i.identity_data ->> 'avatar_url', i.identity_data ->> 'picture'), 1000) end
  )
  on conflict (user_id) do update
    set provider = excluded.provider, name = excluded.name, photo_url = excluded.photo_url, updated_at = now()
  returning * into r;
  return r;
end;
$$;

-- Show or hide it. Syncs first, so turning it on always shows the account they signed in with.
create or replace function set_social_profile_shown(p_shown boolean)
returns rider_social_profiles language plpgsql security definer set search_path = public as $$
declare
  r rider_social_profiles;
begin
  r := sync_social_profile();
  if r is null then raise exception 'Sign in with Apple, Google or Facebook first'; end if;
  update rider_social_profiles set shown = coalesce(p_shown, false), updated_at = now()
  where user_id = auth.uid()
  returning * into r;
  return r;
end;
$$;

revoke execute on function sync_social_profile() from public, anon;
revoke execute on function set_social_profile_shown(boolean) from public, anon;
grant execute on function sync_social_profile() to authenticated;
grant execute on function set_social_profile_shown(boolean) to authenticated;
