-- Ride names (nicknames). Every rider picks the name other riders see on the group map, the
-- rider list and in ride chat; they edit it from their profile. The name lives in
-- profiles.display_name, which signed-in riders can read. This migration:
--   1. tidies names the same way the app does (one space between words, at most 24 characters),
--      so a long name from a social sign-in can't break sign-up or the map;
--   2. moves the emergency contact out of profiles into an owner-only table, because every
--      signed-in rider can read profiles rows.

-- 1. Tidy names on every insert and update.
create or replace function tidy_display_name()
returns trigger language plpgsql set search_path = public as $$
begin
  new.display_name := rtrim(left(btrim(regexp_replace(coalesce(new.display_name, ''), '\s+', ' ', 'g')), 24));
  return new;
end;
$$;
create trigger profiles_tidy_display_name before insert or update of display_name on profiles
  for each row execute function tidy_display_name();

update profiles set display_name = display_name
where display_name <> rtrim(left(btrim(regexp_replace(display_name, '\s+', ' ', 'g')), 24));

alter table profiles add constraint profiles_display_name_length check (char_length(display_name) <= 24);

-- 2. Emergency contact: only the rider themself can read or change it.
create table profile_private (
  user_id uuid primary key references profiles (id) on delete cascade,
  emergency_contact_name text,
  emergency_contact_phone text,
  updated_at timestamptz not null default now()
);
alter table profile_private enable row level security;
create policy profile_private_owner on profile_private for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on profile_private to authenticated;

insert into profile_private (user_id, emergency_contact_name, emergency_contact_phone)
select id, emergency_contact_name, emergency_contact_phone from profiles
where emergency_contact_name is not null or emergency_contact_phone is not null;

alter table profiles drop column emergency_contact_name, drop column emergency_contact_phone;
