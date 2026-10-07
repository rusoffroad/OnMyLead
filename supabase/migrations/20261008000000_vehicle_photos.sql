-- Garage: machine photos in Storage, and tighter rules on who sees a vehicle.

-- ---------------------------------------------------------------------------
-- A ride member's vehicle must belong to that member.
-- Without this, join_ride (p_vehicle) or a ride manager editing a member row could
-- point a membership at someone else's vehicle id, which would expose that vehicle
-- through the ride lineup policy.
-- ---------------------------------------------------------------------------
create or replace function check_member_vehicle()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.vehicle_id is not null and not exists (
    select 1 from vehicles where id = new.vehicle_id and owner_id = new.user_id
  ) then
    raise exception 'that vehicle is not in this rider''s garage';
  end if;
  return new;
end;
$$;

drop trigger if exists ride_members_vehicle_owner on ride_members;
create trigger ride_members_vehicle_owner before insert or update of vehicle_id, user_id on ride_members
  for each row execute function check_member_vehicle();

-- Belt and braces: the lineup only shows a vehicle on a membership owned by its owner.
-- Build items (vehicle_items) stay owner-only; riders see the machine, not the receipts.
drop policy if exists vehicles_ride_lineup on vehicles;
create policy vehicles_ride_lineup on vehicles for select to authenticated using (
  exists (
    select 1 from ride_members m
    where m.vehicle_id = vehicles.id and m.user_id = vehicles.owner_id
      and m.status = 'joined' and is_ride_member(m.ride_id, auth.uid())
  )
);

-- ---------------------------------------------------------------------------
-- Storage bucket for machine photos.
-- Public read (a photo of a machine, at an unguessable path). Writes only into the
-- uploader's own folder: vehicle-photos/<auth.uid()>/<file>. No listing policy for
-- other people's folders. Skipped when the storage schema is absent (plain Postgres).
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'storage schema not found; skipping vehicle-photos bucket';
    return;
  end if;

  insert into storage.buckets (id, name, public)
  values ('vehicle-photos', 'vehicle-photos', true)
  on conflict (id) do update set public = true;

  -- Size and type limits where this Storage version supports them.
  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit') then
    execute $q$update storage.buckets set file_size_limit = 10485760 where id = 'vehicle-photos'$q$;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    execute $q$update storage.buckets
               set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
               where id = 'vehicle-photos'$q$;
  end if;

  execute 'drop policy if exists vehicle_photos_owner_read on storage.objects';
  execute 'drop policy if exists vehicle_photos_owner_insert on storage.objects';
  execute 'drop policy if exists vehicle_photos_owner_update on storage.objects';
  execute 'drop policy if exists vehicle_photos_owner_delete on storage.objects';

  -- Owners can read (and so list or overwrite) their own folder. Everyone else uses the public URL.
  execute $p$create policy vehicle_photos_owner_read on storage.objects for select to authenticated
    using (bucket_id = 'vehicle-photos' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy vehicle_photos_owner_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'vehicle-photos' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy vehicle_photos_owner_update on storage.objects for update to authenticated
    using (bucket_id = 'vehicle-photos' and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = 'vehicle-photos' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy vehicle_photos_owner_delete on storage.objects for delete to authenticated
    using (bucket_id = 'vehicle-photos' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
end $$;
