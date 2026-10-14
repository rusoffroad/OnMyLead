-- Help Center edits (20261024000000_help_center.sql). Runs after admin_test.sql, which sets up
-- as_admin_session() and the admin accounts. Each block raises an exception if a rule is broken.

-- H1. Riders, visitors and admins without the authenticator code can't use the admin functions.
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
select expect_refused($q$select admin_help_save('create-a-ride', 'Hacked')$q$, 'rider saved a help edit');
select expect_refused($q$select admin_help_edits()$q$, 'rider listed help edits');
do $$ begin
  if (select count(*) from help_article_edits) <> 0 then raise exception 'FAIL: rider read the edits table'; end if;
end $$;
reset role;
set role anon;
select expect_refused($q$select admin_help_save('create-a-ride', 'Hacked')$q$, 'visitor saved a help edit');
reset role;
select as_admin_session('00000000-0000-0000-0000-00000000ad01', 'aal1');
set role authenticated;
select expect_refused($q$select admin_help_save('create-a-ride', 'No code')$q$, 'admin without the code saved a help edit');
reset role;

-- H2. The admin saves an edit (live), then a second one replaces it; one live version per article.
select as_admin_session('00000000-0000-0000-0000-00000000ad01', 'aal2');
set role authenticated;
do $$
declare a uuid; b uuid; d uuid;
begin
  a := admin_help_save('create-a-ride', 'First edit', 'Create a Ride', null, 'abc', 'typo');
  b := admin_help_save('create-a-ride', 'Second edit', null, null, 'abc', null);
  d := admin_help_save('create-a-ride', 'Draft only', null, null, 'abc', null, 'edit', false);
  if (select count(*) from help_live_edits('create-a-ride')) <> 1 then raise exception 'FAIL: not exactly one live edit'; end if;
  if (select body from help_live_edits('create-a-ride')) <> 'Second edit' then raise exception 'FAIL: newest published edit is not live'; end if;
  if jsonb_array_length(admin_help_edits('create-a-ride')) <> 3 then raise exception 'FAIL: versions not kept'; end if;
  -- Restore the first version.
  perform admin_help_set_live(a);
  if (select id from help_live_edits('create-a-ride')) <> a then raise exception 'FAIL: restore did not go live'; end if;
  -- Back to the automatic version.
  perform admin_help_use_automatic('create-a-ride');
  if exists (select 1 from help_live_edits('create-a-ride')) then raise exception 'FAIL: automatic version not restored'; end if;
  perform admin_help_set_live(b);
  -- An audit run is kept.
  perform admin_help_log_audit('{"issues": []}', 0, 2);
  if jsonb_array_length(admin_help_audits()) <> 1 then raise exception 'FAIL: audit run not kept'; end if;
end $$;
select expect_refused($q$select admin_help_save('Bad Slug!', 'x')$q$, 'bad slug saved');
select expect_refused($q$select admin_help_save('create-a-ride', '   ')$q$, 'empty body saved');
reset role;

-- H3. Signed-out visitors see the live edit and nothing else (no drafts, no notes, no authors).
set role anon;
do $$ begin
  if (select count(*) from help_live_edits()) <> 1 then raise exception 'FAIL: visitor did not see exactly the live edit'; end if;
  if (select body from help_live_edits('create-a-ride')) <> 'Second edit' then raise exception 'FAIL: visitor saw the wrong version'; end if;
end $$;
select expect_refused($q$select * from help_article_edits$q$, 'visitor read the edits table');
select expect_refused($q$select * from help_audit_runs$q$, 'visitor read audit runs');
reset role;

-- H4. Every change is in the audit log.
do $$ begin
  if (select count(*) from admin_audit_log where action like 'help.%') < 6 then raise exception 'FAIL: help actions not logged'; end if;
end $$;
