-- Profile pictures (1.0.3): a rider can upload, change or remove a photo that shows in place of
-- their initial wherever other riders see them (Going lists, chat, Messages, Friends, Out Riding).
--
-- Privacy: the photo follows the existing profile visibility. profiles rows are readable by
-- signed-in riders only (profiles_read), exactly like the ride name, so nothing here reaches
-- signed-out visitors through the API. The image itself sits in a public bucket at an
-- unguessable path, like vehicle and trail photos.
--
-- Backward compatible: a new nullable column and a new bucket. The old profiles.photo_url (filled
-- from social sign-in metadata at sign-up and never shown) is left alone, so a Google picture is
-- still never shown unless the rider opts in to Show My Google Profile.

alter table profiles add column if not exists avatar_path text;

-- Only a file in the rider's own folder of the rider-avatars bucket: <user id>/<file name>.
-- Storing the path (not a URL) means nobody can point their photo at another site.
alter table profiles drop constraint if exists profiles_avatar_path_own_folder;
alter table profiles add constraint profiles_avatar_path_own_folder check (
  avatar_path is null
  or (char_length(avatar_path) <= 120 and avatar_path ~ ('^' || id::text || '/[A-Za-z0-9._-]{1,80}$'))
);

-- ---------------------------------------------------------------------------
-- Admin: remove an inappropriate photo. Returns the storage path so the dashboard can delete the
-- file (Storage files are removed through the Storage API, which the admin delete policy allows).
-- ---------------------------------------------------------------------------
create or replace function admin_remove_profile_photo(p_user uuid, p_reason text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_path text;
begin
  perform require_admin();
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'a reason is required'; end if;
  select avatar_path into v_path from profiles where id = p_user for update;
  if not found then raise exception 'user not found'; end if;
  if v_path is null then raise exception 'this rider has no profile photo'; end if;
  update profiles set avatar_path = null where id = p_user;
  perform log_admin_action('profile_photo.remove', 'user', p_user::text,
    jsonb_build_object('avatar_path', v_path), jsonb_build_object('reason', btrim(p_reason)));
  return v_path;
end;
$$;
revoke execute on function admin_remove_profile_photo(uuid, text) from public, anon;
grant execute on function admin_remove_profile_photo(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage bucket for profile pictures: rider-avatars/<auth.uid()>/<file>.
-- Public read (unguessable path), writes only into the uploader's own folder, no listing of
-- other people's folders. An admin signed in with two-factor can delete any file (photo
-- removal). Skipped when the storage schema is absent (plain Postgres in CI).
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'storage schema not found; skipping rider-avatars bucket';
    return;
  end if;

  insert into storage.buckets (id, name, public)
  values ('rider-avatars', 'rider-avatars', true)
  on conflict (id) do update set public = true;

  -- The app uploads a 512 x 512 JPEG of about 50-150 KB; 2 MB leaves room without inviting abuse.
  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit') then
    execute $q$update storage.buckets set file_size_limit = 2097152 where id = 'rider-avatars'$q$;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    execute $q$update storage.buckets
               set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
               where id = 'rider-avatars'$q$;
  end if;

  execute 'drop policy if exists rider_avatars_owner_read on storage.objects';
  execute 'drop policy if exists rider_avatars_owner_insert on storage.objects';
  execute 'drop policy if exists rider_avatars_owner_update on storage.objects';
  execute 'drop policy if exists rider_avatars_owner_delete on storage.objects';
  execute 'drop policy if exists rider_avatars_admin_delete on storage.objects';

  execute $p$create policy rider_avatars_owner_read on storage.objects for select to authenticated
    using (bucket_id = 'rider-avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy rider_avatars_owner_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'rider-avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy rider_avatars_owner_update on storage.objects for update to authenticated
    using (bucket_id = 'rider-avatars' and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = 'rider-avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy rider_avatars_owner_delete on storage.objects for delete to authenticated
    using (bucket_id = 'rider-avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  -- Deleting needs to see the row, so admins get a select and a delete on this bucket only.
  execute 'drop policy if exists rider_avatars_admin_read on storage.objects';
  execute $p$create policy rider_avatars_admin_read on storage.objects for select to authenticated
    using (bucket_id = 'rider-avatars' and is_admin(auth.uid()) and coalesce(auth.jwt() ->> 'aal', '') = 'aal2')$p$;
  execute $p$create policy rider_avatars_admin_delete on storage.objects for delete to authenticated
    using (bucket_id = 'rider-avatars' and is_admin(auth.uid()) and coalesce(auth.jwt() ->> 'aal', '') = 'aal2')$p$;
end $$;
