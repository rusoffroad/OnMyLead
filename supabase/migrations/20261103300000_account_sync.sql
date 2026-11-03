-- Sync across devices (2.1). Chris 2026-11-03: "sync everything with cloud somehow so its cross
-- device with the same account signed in".
--
--   * rider_settings: one private row per account holding the settings that follow the rider
--     (app/src/core/synced-settings.ts lists them): map style, Follow Me, directions app, theme and
--     so on. Each setting carries the time it was changed; sync_rider_settings() keeps the newer
--     change, setting by setting, so two devices never undo each other's other choices.
--   * rider_trail_backups: a private copy of each of the rider's own Map Mode trails (recorded,
--     drawn and saved), so they show on every device they sign in on. Deleted trails stay as a
--     tombstone row (data null) so the delete reaches the other devices.
--   * trail-backups bucket: the photos of those trails, PRIVATE, each rider only in their own folder.
--
-- Privacy: only the rider reads or writes their rows and photos (row-level security, no public or
-- friend access, nothing in any view). A backed-up trail is never public; Share with Everyone
-- (shared_trails) is unchanged and remains the only way a trail is published. Live location,
-- Track Line breadcrumbs and recordings in progress are not synced at all.
--
-- Additive only: two new tables, two new functions and a new bucket. Older app builds never call
-- them and keep working. Rows go with the account (on delete cascade). Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. Settings.
-- ---------------------------------------------------------------------------
create table if not exists rider_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  updated_at timestamptz not null default now()
);

alter table rider_settings enable row level security;
drop policy if exists "rider reads own settings" on rider_settings;
create policy "rider reads own settings" on rider_settings for select to authenticated using (user_id = auth.uid());
-- Writes only through sync_rider_settings(), which validates and merges.
revoke all on rider_settings from anon, authenticated;
grant select on rider_settings to authenticated;

-- Send this device's changes ({"key": {"v": "value" | null, "at": ms}}), get the account's whole
-- map back. Pass '{}' just to read. A change is kept only when it is newer than the one there
-- (same time: the larger value, so every device agrees). A time ahead of the server's clock by
-- more than a minute is capped, so a phone with a wrong clock can't lock a setting forever.
create or replace function sync_rider_settings(p_changes jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  cur jsonb;
  k text;
  e jsonb;
  v jsonb;
  at bigint;
  old jsonb;
  cap bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint + 60000;
  changed boolean := false;
begin
  if me is null then
    raise exception 'Sign in to sync your settings.' using errcode = '42501';
  end if;
  if p_changes is null then p_changes := '{}'::jsonb; end if;
  if jsonb_typeof(p_changes) <> 'object' then
    raise exception 'Settings must be an object.' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_object_keys(p_changes)) > 200 then
    raise exception 'Too many settings at once.' using errcode = '22023';
  end if;

  insert into rider_settings (user_id) values (me) on conflict (user_id) do nothing;
  select settings into cur from rider_settings where user_id = me for update;

  for k, e in select * from jsonb_each(p_changes) loop
    if length(k) = 0 or length(k) > 64 or k !~ '^[A-Za-z0-9._:-]+$' then continue; end if;
    if jsonb_typeof(e) is distinct from 'object' or jsonb_typeof(e -> 'at') is distinct from 'number' then continue; end if;
    v := e -> 'v';
    if v is null or jsonb_typeof(v) not in ('string', 'null') then continue; end if;
    if jsonb_typeof(v) = 'string' and length(v #>> '{}') > 20000 then continue; end if;
    at := least(greatest(floor((e ->> 'at')::numeric), 0), cap)::bigint;
    old := cur -> k;
    if old is not null and (
         (old ->> 'at')::bigint > at
         or ((old ->> 'at')::bigint = at and coalesce(old ->> 'v', '') >= coalesce(v #>> '{}', ''))
       ) then
      continue;
    end if;
    if old is null and (select count(*) from jsonb_object_keys(cur)) >= 200 then continue; end if;
    cur := cur || jsonb_build_object(k, jsonb_build_object('v', v, 'at', at));
    changed := true;
  end loop;

  if changed then
    update rider_settings set settings = cur, updated_at = now() where user_id = me;
  end if;
  return cur;
end;
$$;

revoke all on function sync_rider_settings(jsonb) from public, anon;
grant execute on function sync_rider_settings(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Trail backups.
-- ---------------------------------------------------------------------------
create table if not exists rider_trail_backups (
  user_id uuid not null references auth.users (id) on delete cascade,
  trail_id text not null check (length(trail_id) between 1 and 64),
  data jsonb check (data is null or (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 2000000)),
  deleted boolean not null default false,
  updated_at timestamptz not null,
  synced_at timestamptz not null default now(),
  primary key (user_id, trail_id),
  check (deleted = (data is null))
);

alter table rider_trail_backups enable row level security;
drop policy if exists "rider reads own trail backups" on rider_trail_backups;
create policy "rider reads own trail backups" on rider_trail_backups for select to authenticated using (user_id = auth.uid());
revoke all on rider_trail_backups from anon, authenticated;
grant select on rider_trail_backups to authenticated;

-- Save one trail (p_data) or mark it deleted (p_data null). Kept only when newer than the copy
-- there, so a slow device can't put back an older trail. Returns true when it was kept.
create or replace function backup_trail(p_trail_id text, p_data jsonb, p_updated_at timestamptz)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  at timestamptz := least(p_updated_at, clock_timestamp() + interval '1 minute');
  n int;
begin
  if me is null then
    raise exception 'Sign in to back up your trails.' using errcode = '42501';
  end if;
  if p_trail_id is null or length(p_trail_id) not between 1 and 64 or at is null then
    raise exception 'Bad trail.' using errcode = '22023';
  end if;
  if p_data is not null and (jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 2000000) then
    raise exception 'This trail is too big to back up.' using errcode = '22023';
  end if;
  if (select count(*) from rider_trail_backups where user_id = me and not deleted) >= 2000
     and not exists (select 1 from rider_trail_backups where user_id = me and trail_id = p_trail_id) then
    raise exception 'Trail backup is full (2,000 trails).' using errcode = '54000';
  end if;

  insert into rider_trail_backups as b (user_id, trail_id, data, deleted, updated_at)
  values (me, p_trail_id, p_data, p_data is null, at)
  on conflict (user_id, trail_id) do update
    set data = excluded.data, deleted = excluded.deleted, updated_at = excluded.updated_at, synced_at = now()
    where b.updated_at < excluded.updated_at;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke all on function backup_trail(text, jsonb, timestamptz) from public, anon;
grant execute on function backup_trail(text, jsonb, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Trail backup photos: a PRIVATE bucket; each rider reads and writes only their own folder
-- (trail-backups/<auth.uid()>/...). Skipped on plain Postgres (tests).
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'storage schema not found; skipping trail-backups bucket';
    return;
  end if;

  insert into storage.buckets (id, name, public)
  values ('trail-backups', 'trail-backups', false)
  on conflict (id) do update set public = false;

  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit') then
    execute $q$update storage.buckets set file_size_limit = 10485760 where id = 'trail-backups'$q$;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    execute $q$update storage.buckets
               set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
               where id = 'trail-backups'$q$;
  end if;

  execute 'drop policy if exists trail_backups_owner_read on storage.objects';
  execute 'drop policy if exists trail_backups_owner_insert on storage.objects';
  execute 'drop policy if exists trail_backups_owner_update on storage.objects';
  execute 'drop policy if exists trail_backups_owner_delete on storage.objects';
  execute $p$create policy trail_backups_owner_read on storage.objects for select to authenticated
    using (bucket_id = 'trail-backups' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy trail_backups_owner_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'trail-backups' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy trail_backups_owner_update on storage.objects for update to authenticated
    using (bucket_id = 'trail-backups' and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = 'trail-backups' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy trail_backups_owner_delete on storage.objects for delete to authenticated
    using (bucket_id = 'trail-backups' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
end $$;
