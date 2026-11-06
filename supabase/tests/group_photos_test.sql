-- Group photos (20261105080000_group_photos.sql). Runs after profile_photos_test.sql, which runs
-- after admin_test.sql (as_admin_session, the admin Chris …ad01). Each block raises an exception
-- if a rule is broken.

-- As in production, riders can't call pro_required itself (privacy_test grants every function for
-- the suite). The photo guard runs as the rider, so it must go through require_my_feature.
revoke execute on function pro_required(uuid, text) from anon, authenticated;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000b7a01', '{"full_name":"Olive Owner"}'),
  ('00000000-0000-0000-0000-0000000b7a02', '{"full_name":"Max Member"}'),
  ('00000000-0000-0000-0000-0000000b7a03', '{"full_name":"Sol Stranger"}');

-- Olive's group, with Max in it (set up directly; making groups is tested in groups_test.sql).
alter table riding_groups disable trigger riding_groups_pro;
insert into riding_groups (id, owner_id, name, invite_code)
values ('b7a0b7a0-b7a0-4b7a-8b7a-b7a0b7a0b7a0', '00000000-0000-0000-0000-0000000b7a01', 'Photo Crew', 'PHOTOCREW1');
alter table riding_groups enable trigger riding_groups_pro;
insert into riding_group_members (group_id, user_id, added_by)
values ('b7a0b7a0-b7a0-4b7a-8b7a-b7a0b7a0b7a0', '00000000-0000-0000-0000-0000000b7a02', '00000000-0000-0000-0000-0000000b7a01');

-- GP1. Olive sets a photo in her own folder; Max (a member) sees it.
select as_user('00000000-0000-0000-0000-0000000b7a01');
set role authenticated;
update riding_groups set photo_path = '00000000-0000-0000-0000-0000000b7a01/b7a0b7a0-b7a0-4b7a-8b7a-b7a0b7a0b7a0-abc-1.jpg'
where id = 'b7a0b7a0-b7a0-4b7a-8b7a-b7a0b7a0b7a0';
reset role;
select as_user('00000000-0000-0000-0000-0000000b7a02');
set role authenticated;
do $$ begin
  if (select photo_path from riding_groups where id = 'b7a0b7a0-b7a0-4b7a-8b7a-b7a0b7a0b7a0')
     is distinct from '00000000-0000-0000-0000-0000000b7a01/b7a0b7a0-b7a0-4b7a-8b7a-b7a0b7a0b7a0-abc-1.jpg' then
    raise exception 'FAIL: a member could not see the group photo';
  end if;
end $$;
-- GP2. Max can't change or remove it (RLS: the update touches nothing).
update riding_groups set photo_path = null where id = 'b7a0b7a0-b7a0-4b7a-8b7a-b7a0b7a0b7a0';
reset role;
do $$ begin
  if (select photo_path from riding_groups where id = 'b7a0b7a0-b7a0-4b7a-8b7a-b7a0b7a0b7a0') is null then
    raise exception 'FAIL: a member removed the group photo';
  end if;
end $$;

-- GP3. A stranger sees no group row, but the invite link shows the photo (signed in or out).
select as_user('00000000-0000-0000-0000-0000000b7a03');
set role authenticated;
do $$ begin
  if exists (select 1 from riding_groups where id = 'b7a0b7a0-b7a0-4b7a-8b7a-b7a0b7a0b7a0') then
    raise exception 'FAIL: a stranger read the group';
  end if;
  if (select photo_path from group_preview_v2('photocrew1')) is distinct from
     '00000000-0000-0000-0000-0000000b7a01/b7a0b7a0-b7a0-4b7a-8b7a-b7a0b7a0b7a0-abc-1.jpg' then
    raise exception 'FAIL: the invite link did not show the photo';
  end if;
  if (select is_member from group_preview_v2('PHOTOCREW1')) then raise exception 'FAIL: stranger shown as a member'; end if;
end $$;
reset role;
select as_user(null);
set role anon;
do $$ begin
  if (select riders from group_preview_v2('PHOTOCREW1')) <> 2 then raise exception 'FAIL: signed-out preview count'; end if;
  if (select photo_path from group_preview_v2('PHOTOCREW1')) is null then raise exception 'FAIL: signed-out preview photo'; end if;
  if (select count(*) from group_preview_v2('NOPE')) <> 0 then raise exception 'FAIL: preview for a wrong code'; end if;
end $$;
-- The old preview is unchanged for builds already in riders' hands.
do $$ begin
  if (select name from group_preview('PHOTOCREW1')) <> 'Photo Crew' then raise exception 'FAIL: old group_preview broke'; end if;
end $$;
select expect_refused($q$select * from admin_user_groups('00000000-0000-0000-0000-0000000b7a01')$q$, 'signed-out visitor listed a rider''s groups');
reset role;

-- GP4. Olive can't point the photo at someone else's folder, another site, or a nested path.
select as_user('00000000-0000-0000-0000-0000000b7a01');
set role authenticated;
select expect_refused($q$update riding_groups set photo_path = '00000000-0000-0000-0000-0000000b7a02/x.jpg' where id = 'b7a0b7a0-b7a0-4b7a-8b7a-b7a0b7a0b7a0'$q$, 'group photo in someone else''s folder');
select expect_refused($q$update riding_groups set photo_path = 'https://evil.example/x.jpg' where id = 'b7a0b7a0-b7a0-4b7a-8b7a-b7a0b7a0b7a0'$q$, 'group photo pointed at another site');
select expect_refused($q$update riding_groups set photo_path = '00000000-0000-0000-0000-0000000b7a01/../x.jpg' where id = 'b7a0b7a0-b7a0-4b7a-8b7a-b7a0b7a0b7a0'$q$, 'group photo path escapes the folder');
reset role;

-- GP5. Olive removes it, then sets a new one.
select as_user('00000000-0000-0000-0000-0000000b7a01');
set role authenticated;
update riding_groups set photo_path = null where id = 'b7a0b7a0-b7a0-4b7a-8b7a-b7a0b7a0b7a0';
update riding_groups set photo_path = '00000000-0000-0000-0000-0000000b7a01/b7a0b7a0-b7a0-4b7a-8b7a-b7a0b7a0b7a0-def-2.webp'
where id = 'b7a0b7a0-b7a0-4b7a-8b7a-b7a0b7a0b7a0';
reset role;
do $$ begin
  if (select photo_path from riding_groups where id = 'b7a0b7a0-b7a0-4b7a-8b7a-b7a0b7a0b7a0')
     is distinct from '00000000-0000-0000-0000-0000000b7a01/b7a0b7a0-b7a0-4b7a-8b7a-b7a0b7a0b7a0-def-2.webp' then
    raise exception 'FAIL: owner could not change the photo';
  end if;
end $$;

-- GP6. Only an admin with two-factor lists a rider's groups and takes a photo down, with a reason, logged.
select as_user('00000000-0000-0000-0000-0000000b7a02');
set role authenticated;
select expect_refused($q$select * from admin_user_groups('00000000-0000-0000-0000-0000000b7a01')$q$, 'a rider listed another rider''s groups');
select expect_refused($q$select admin_remove_group_photo('b7a0b7a0-b7a0-4b7a-8b7a-b7a0b7a0b7a0', 'Not allowed')$q$, 'a rider removed a group photo');
reset role;
select as_admin_session('00000000-0000-0000-0000-00000000ad01', 'aal1');
set role authenticated;
select expect_refused($q$select admin_remove_group_photo('b7a0b7a0-b7a0-4b7a-8b7a-b7a0b7a0b7a0', 'No second factor')$q$, 'admin without two-factor removed a group photo');
reset role;
select as_admin_session('00000000-0000-0000-0000-00000000ad01', 'aal2');
set role authenticated;
select expect_refused($q$select admin_remove_group_photo('b7a0b7a0-b7a0-4b7a-8b7a-b7a0b7a0b7a0', '')$q$, 'group photo removed without a reason');
do $$
declare
  v text;
  g record;
begin
  select * into g from admin_user_groups('00000000-0000-0000-0000-0000000b7a01');
  if g.name <> 'Photo Crew' or g.riders <> 2 or g.photo_path is null then
    raise exception 'FAIL: admin list of a rider''s groups: %', row_to_json(g);
  end if;
  v := admin_remove_group_photo('b7a0b7a0-b7a0-4b7a-8b7a-b7a0b7a0b7a0', 'Offensive photo');
  if v <> '00000000-0000-0000-0000-0000000b7a01/b7a0b7a0-b7a0-4b7a-8b7a-b7a0b7a0b7a0-def-2.webp' then
    raise exception 'FAIL: removal returned % instead of the file path', v;
  end if;
  if not (admin_audit() -> 'rows') @> '[{"action":"group_photo.remove","target_id":"b7a0b7a0-b7a0-4b7a-8b7a-b7a0b7a0b7a0"}]' then
    raise exception 'FAIL: group photo removal not in the audit log';
  end if;
end $$;
select expect_refused($q$select admin_remove_group_photo('b7a0b7a0-b7a0-4b7a-8b7a-b7a0b7a0b7a0', 'Again please')$q$, 'removed a group photo that was already gone');
reset role;

delete from riding_groups where id = 'b7a0b7a0-b7a0-4b7a-8b7a-b7a0b7a0b7a0';

select 'GROUP PHOTO TESTS PASSED';
