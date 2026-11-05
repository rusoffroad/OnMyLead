-- Group photos (2.1, build 10): whoever made a riding group (its owner) can upload, change or remove a
-- photo for it. The photo shows on the group page, in group lists, and on the group's invite link
-- (onmylead.com/g/<code>), in the app and on the website.
--
-- Privacy: riding_groups rows stay readable only by the owner and members, so the photo's path
-- reaches signed-in riders in the group. The invite link already shows anyone who has it the
-- group's name, who runs it and how many ride in it (group_preview); group_preview_v2 adds the
-- photo, since the photo is how a friend recognises the crew they were invited to. The image sits
-- in a public-read bucket (it caches and loads on weak signal without signed URLs) at an
-- unguessable path inside the owner's folder: <owner id>/<group id>-<random token>-<time>.jpg.
-- The bucket allows no listing of other people's folders.
--
-- Moderation: like profile pictures, an admin signed in with two-factor can take a group photo
-- down with a reason (Audit Log), from the rider's page in the Admin Dashboard.
--
-- Backward compatible: a new nullable column, a new bucket and new functions. group_preview is
-- left exactly as it was for builds already in riders' hands; riding_groups is read with select *,
-- so older builds just ignore the new column.

alter table riding_groups add column if not exists photo_path text;

-- Only a file in the owner's own folder of the group-photos bucket: <owner id>/<file name>.
-- Storing the path (not a URL) means nobody can point a group's photo at another site.
alter table riding_groups drop constraint if exists riding_groups_photo_path_own_folder;
alter table riding_groups add constraint riding_groups_photo_path_own_folder check (
  photo_path is null
  or (char_length(photo_path) <= 160 and photo_path ~ ('^' || owner_id::text || '/[A-Za-z0-9._-]{1,120}$'))
);

-- Only the owner can set the photo. The update policy already limits updates to the owner; this
-- also stops a future policy or function from letting a member change it.
create or replace function riding_groups_photo_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if new.photo_path is distinct from old.photo_path
     and current_user in ('authenticated', 'anon')
     and old.owner_id is distinct from auth.uid() then
    raise exception 'only the group''s owner can change its photo';
  end if;
  return new;
end;
$$;
drop trigger if exists riding_groups_photo_guard on riding_groups;
create trigger riding_groups_photo_guard before update of photo_path on riding_groups
  for each row execute function riding_groups_photo_guard();

-- ---------------------------------------------------------------------------
-- The invite link's preview, now with the group's photo. Same rows and rules as group_preview.
-- ---------------------------------------------------------------------------
create or replace function group_preview_v2(p_code text)
returns table (id uuid, name text, owner_name text, riders int, is_member boolean, photo_path text)
language sql stable security definer set search_path = public as $$
  select g.id, g.name,
         coalesce(nullif(btrim(p.display_name), ''), 'A rider'),
         1 + (select count(*)::int from riding_group_members m where m.group_id = g.id),
         auth.uid() is not null and is_group_member(g.id, auth.uid()),
         g.photo_path
  from riding_groups g
  left join profiles p on p.id = g.owner_id
  where g.invite_code = upper(btrim(p_code));
$$;
grant execute on function group_preview_v2(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin: the groups a rider runs (with their photos), and taking a photo down.
-- ---------------------------------------------------------------------------
create or replace function admin_user_groups(p_user uuid)
returns table (id uuid, name text, photo_path text, riders int, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  return query
    select g.id, g.name, g.photo_path,
           1 + (select count(*)::int from riding_group_members m where m.group_id = g.id),
           g.created_at
    from riding_groups g
    where g.owner_id = p_user
    order by g.created_at;
end;
$$;
revoke execute on function admin_user_groups(uuid) from public, anon;
grant execute on function admin_user_groups(uuid) to authenticated;

-- Returns the storage path so the dashboard can delete the file (the admin storage policy allows it).
create or replace function admin_remove_group_photo(p_group uuid, p_reason text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_path text;
  v_owner uuid;
begin
  perform require_admin();
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'a reason is required'; end if;
  select photo_path, owner_id into v_path, v_owner from riding_groups where id = p_group for update;
  if not found then raise exception 'group not found'; end if;
  if v_path is null then raise exception 'this group has no photo'; end if;
  update riding_groups set photo_path = null where id = p_group;
  perform log_admin_action('group_photo.remove', 'group', p_group::text,
    jsonb_build_object('photo_path', v_path, 'owner_id', v_owner), jsonb_build_object('reason', btrim(p_reason)));
  return v_path;
end;
$$;
revoke execute on function admin_remove_group_photo(uuid, text) from public, anon;
grant execute on function admin_remove_group_photo(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage bucket for group photos: group-photos/<auth.uid()>/<file>.
-- Public read (unguessable path), writes only into the uploader's own folder, no listing of
-- other people's folders. An admin signed in with two-factor can delete any file (photo
-- removal). Deleting an account removes the owner's folder (delete-account, _shared/rider-files).
-- Skipped when the storage schema is absent (plain Postgres in CI).
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'storage schema not found; skipping group-photos bucket';
    return;
  end if;

  insert into storage.buckets (id, name, public)
  values ('group-photos', 'group-photos', true)
  on conflict (id) do update set public = true;

  -- The app uploads a 1280 x 720 JPEG of about 100-300 KB; 2 MB leaves room without inviting abuse.
  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit') then
    execute $q$update storage.buckets set file_size_limit = 2097152 where id = 'group-photos'$q$;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    execute $q$update storage.buckets
               set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
               where id = 'group-photos'$q$;
  end if;

  execute 'drop policy if exists group_photos_owner_read on storage.objects';
  execute 'drop policy if exists group_photos_owner_insert on storage.objects';
  execute 'drop policy if exists group_photos_owner_update on storage.objects';
  execute 'drop policy if exists group_photos_owner_delete on storage.objects';
  execute 'drop policy if exists group_photos_admin_read on storage.objects';
  execute 'drop policy if exists group_photos_admin_delete on storage.objects';

  execute $p$create policy group_photos_owner_read on storage.objects for select to authenticated
    using (bucket_id = 'group-photos' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy group_photos_owner_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'group-photos' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy group_photos_owner_update on storage.objects for update to authenticated
    using (bucket_id = 'group-photos' and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = 'group-photos' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy group_photos_owner_delete on storage.objects for delete to authenticated
    using (bucket_id = 'group-photos' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy group_photos_admin_read on storage.objects for select to authenticated
    using (bucket_id = 'group-photos' and is_admin(auth.uid()) and coalesce(auth.jwt() ->> 'aal', '') = 'aal2')$p$;
  execute $p$create policy group_photos_admin_delete on storage.objects for delete to authenticated
    using (bucket_id = 'group-photos' and is_admin(auth.uid()) and coalesce(auth.jwt() ->> 'aal', '') = 'aal2')$p$;
end $$;
