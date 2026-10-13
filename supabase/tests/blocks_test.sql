-- Block Rider: each rider sees and changes only their own blocks, and nobody can tell they were blocked.
-- Runs after privacy_test.sql (run_local.sh), which sets up as_user and expect_refused, and
-- grants every table to authenticated, so these checks lean on row level security alone.
-- Each block raises an exception if a privacy rule is broken.

-- K1. Ben blocks Olivia and Cara, and sees both blocks.
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
insert into blocked_riders (blocked_id) values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000c');
do $$ begin
  if (select count(*) from blocked_riders) <> 2 then raise exception 'FAIL: blocker can''t see their own blocks'; end if;
  if exists (select 1 from blocked_riders where blocker_id <> auth.uid()) then raise exception 'FAIL: block saved under someone else'; end if;
end $$;
reset role;

-- K2. Olivia and Cara can't see that Ben blocked them, or change or remove his blocks.
select as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$ begin
  if (select count(*) from blocked_riders) <> 0 then raise exception 'FAIL: blocked rider saw the block'; end if;
end $$;
delete from blocked_riders where blocker_id = '00000000-0000-0000-0000-00000000000b';
update blocked_riders set blocked_id = '00000000-0000-0000-0000-00000000000d';
reset role;
select as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
do $$ begin
  if (select count(*) from blocked_riders where blocked_id = auth.uid()) <> 0 then raise exception 'FAIL: blocked rider found the block'; end if;
end $$;
delete from blocked_riders;
reset role;
do $$ begin
  if (select count(*) from blocked_riders where blocker_id = '00000000-0000-0000-0000-00000000000b') <> 2 then
    raise exception 'FAIL: someone else removed or changed Ben''s blocks';
  end if;
end $$;

-- K3. Dan, a stranger, can't see them either, can't block in Ben's name, and can't block himself.
select as_user('00000000-0000-0000-0000-00000000000d');
set role authenticated;
do $$ begin
  if (select count(*) from blocked_riders) <> 0 then raise exception 'FAIL: stranger saw someone''s blocks'; end if;
end $$;
select expect_refused(
  $q$insert into blocked_riders (blocker_id, blocked_id) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000d')$q$,
  'blocked a rider in someone else''s name');
select expect_refused(
  $q$insert into blocked_riders (blocked_id) values ('00000000-0000-0000-0000-00000000000d')$q$,
  'blocked themselves');
-- Blocking the rider who blocked you is allowed and tells you nothing: it's a separate row.
insert into blocked_riders (blocked_id) values ('00000000-0000-0000-0000-00000000000b');
do $$ begin
  if (select count(*) from blocked_riders) <> 1 then raise exception 'FAIL: stranger saw more than their own block'; end if;
end $$;
delete from blocked_riders;
reset role;

-- K4. Signed-out visitors can't read or add blocks.
select as_user(null);
set role anon;
select expect_refused($q$select count(*) from blocked_riders$q$, 'anonymous read of blocks');
select expect_refused($q$insert into blocked_riders (blocker_id, blocked_id) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a')$q$, 'anonymous block');
reset role;

-- K5. Ben unblocks Cara; Olivia stays blocked until he unblocks her too.
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
delete from blocked_riders where blocked_id = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  if (select count(*) from blocked_riders) <> 1 then raise exception 'FAIL: unblock removed the wrong rows'; end if;
end $$;
delete from blocked_riders;
reset role;
do $$ begin
  if exists (select 1 from blocked_riders) then raise exception 'FAIL: blocks left behind'; end if;
end $$;

select 'ALL BLOCK TESTS PASSED' as result;
