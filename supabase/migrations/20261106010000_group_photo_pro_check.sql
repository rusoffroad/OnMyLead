-- Group photos are Pro from 2.1 (20261105090000_pro_bluetooth_dot_photos.sql), but only the app
-- checked it: a Free owner could still set photo_path straight through the API. The owner-only
-- photo guard now also asks for the group_photos feature when a rider adds or changes a photo
-- (pro_required, the same check the other Pro features use), and it now runs when a group is
-- made with a photo already set, too. Taking a photo down stays free, and Admin > Settings moving
-- group_photos back to Free lifts the check. Backward compatible: same function and trigger name;
-- builds before 2.1 never set a photo.

create or replace function riding_groups_photo_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE'
     and new.photo_path is distinct from old.photo_path
     and current_user in ('authenticated', 'anon')
     and old.owner_id is distinct from auth.uid() then
    raise exception 'only the group''s owner can change its photo';
  end if;
  if (tg_op = 'INSERT' or new.photo_path is distinct from old.photo_path)
     and new.photo_path is not null
     and current_user in ('authenticated', 'anon') then
    perform pro_required(auth.uid(), 'group_photos');
  end if;
  return new;
end;
$$;
drop trigger if exists riding_groups_photo_guard on riding_groups;
create trigger riding_groups_photo_guard before insert or update of photo_path on riding_groups
  for each row execute function riding_groups_photo_guard();

-- Uploading into the group-photos bucket needs the same feature (has_feature: Pro, or Free when
-- Admin moves group_photos back to Free), so Free accounts can't use it as image hosting.
-- Replacing a file already there needs it too. Reading and deleting stay as they were.
do $$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'storage schema not found; skipping group-photos upload policy';
    return;
  end if;
  execute 'drop policy if exists group_photos_owner_insert on storage.objects';
  execute $p$create policy group_photos_owner_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'group-photos' and (storage.foldername(name))[1] = auth.uid()::text
                and has_feature(auth.uid(), 'group_photos'))$p$;
  execute 'drop policy if exists group_photos_owner_update on storage.objects';
  execute $p$create policy group_photos_owner_update on storage.objects for update to authenticated
    using (bucket_id = 'group-photos' and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = 'group-photos' and (storage.foldername(name))[1] = auth.uid()::text
                and has_feature(auth.uid(), 'group_photos'))$p$;
end $$;
