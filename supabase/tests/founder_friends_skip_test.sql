-- Founder friends leave out skipped accounts (migration 20261118500000_founder_friends_skip_review.sql):
-- the App Review account is never made the founder's friend, its founder friendships are removed,
-- and a friendship asked for the normal way stays. Runs after founder_friends_test.sql.
--
-- Riders (new here):
--   Rae  0a09  a reviewer account on founder_friend_skip
--   Sal  0a10  a second skipped account whose friendship with Fay was asked for the normal way
revoke execute on function founder_friends_drop_skipped() from anon, authenticated;
revoke all on founder_friend_skip from anon, authenticated;

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000a09', '{"full_name":"Rae Reviewer"}'),
  ('00000000-0000-0000-0000-000000000a10', '{"full_name":"Sal Skipped"}');

-- FS1. Fay is the founder again; Rae and Sal were friended (as on Supabase before the fix).
do $$ begin
  insert into rider_badges (user_id, badge, level) values ('00000000-0000-0000-0000-000000000a01', 'founder', 1);
  if not riders_are_friends('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a09') then
    raise exception 'FAIL: setup, Rae should be a founder friend before the skip';
  end if;
  -- Sal's friendship is a real one.
  update friendships set founder = false
  where user_lo = least('00000000-0000-0000-0000-000000000a01'::uuid, '00000000-0000-0000-0000-000000000a10'::uuid)
    and user_hi = greatest('00000000-0000-0000-0000-000000000a01'::uuid, '00000000-0000-0000-0000-000000000a10'::uuid);
end $$;

-- FS2. Skipping removes the founder friendship only, and it never comes back.
do $$ begin
  insert into founder_friend_skip (user_id, note) values
    ('00000000-0000-0000-0000-000000000a09', 'test reviewer'), ('00000000-0000-0000-0000-000000000a10', 'test');
  if founder_friends_drop_skipped() <> 1 then raise exception 'FAIL: should drop exactly Rae''s founder friendship'; end if;
  if riders_are_friends('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a09') then
    raise exception 'FAIL: Rae still the founder''s friend';
  end if;
  if not riders_are_friends('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a10') then
    raise exception 'FAIL: Sal''s real friendship was removed';
  end if;
  if not riders_are_friends('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a02') then
    raise exception 'FAIL: Rob''s founder friendship should stay';
  end if;
  perform founder_friend_everyone('00000000-0000-0000-0000-000000000a01');
  if riders_are_friends('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a09') then
    raise exception 'FAIL: Rae came back when everyone was added again';
  end if;
end $$;

-- FS3. A second founder doesn't friend Rae either.
do $$ begin
  insert into rider_badges (user_id, badge, level) values ('00000000-0000-0000-0000-000000000a02', 'founder', 1);
  if riders_are_friends('00000000-0000-0000-0000-000000000a02', '00000000-0000-0000-0000-000000000a09') then
    raise exception 'FAIL: a new founder friended Rae';
  end if;
  delete from rider_badges where user_id = '00000000-0000-0000-0000-000000000a02' and badge = 'founder';
end $$;

-- FS4. Riders can't read or change the skip list, or call the cleanup.
select as_user('00000000-0000-0000-0000-000000000a09');
set role authenticated;
select expect_refused($q$select 1 from founder_friend_skip$q$, 'rider reading founder skip list');
select expect_refused($q$delete from founder_friend_skip$q$, 'rider deleting from founder skip list');
select expect_refused($q$select founder_friends_drop_skipped()$q$, 'rider calling founder_friends_drop_skipped');
reset role;

select set_config('request.jwt.claims', '', false), set_config('request.jwt.claim.sub', '', false);
