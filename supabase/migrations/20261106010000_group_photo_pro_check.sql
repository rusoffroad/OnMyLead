-- Group photos are Pro from 2.1 (20261105090000_pro_bluetooth_dot_photos.sql), but only the app
-- checked it: a Free owner could still set photo_path straight through the API. The owner-only
-- photo guard now also asks for the group_photos feature when a rider adds or changes a photo
-- (pro_required, the same check the other Pro features use). Taking a photo down stays free, and
-- Admin > Settings moving group_photos back to Free lifts the check. Backward compatible: same
-- trigger, same name; builds before 2.1 never set a photo.

create or replace function riding_groups_photo_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if new.photo_path is distinct from old.photo_path
     and current_user in ('authenticated', 'anon')
     and old.owner_id is distinct from auth.uid() then
    raise exception 'only the group''s owner can change its photo';
  end if;
  if new.photo_path is distinct from old.photo_path
     and new.photo_path is not null
     and current_user in ('authenticated', 'anon') then
    perform pro_required(auth.uid(), 'group_photos');
  end if;
  return new;
end;
$$;
