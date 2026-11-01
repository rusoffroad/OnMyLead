-- Release controls (migration 20261101300000_release_controls.sql): the app_versions setting
-- riders' apps read, its checks, and the Audit Log entries for store rollout actions. Runs after
-- the files that set up as_session (run_local.sh). Each block raises an exception if a rule is broken.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000fa1', 'owner-r@example.test'),
  ('00000000-0000-0000-0000-000000000fa2', 'rider-r@example.test');
insert into admin_users (user_id) values ('00000000-0000-0000-0000-000000000fa1');

-- Anyone (signed out too) reads the controls, empty until the owner sets them.
set role anon;
do $$ begin
  if public_app_settings() -> 'app_versions' <> '{}'::jsonb then raise exception 'FAIL: app_versions not empty: %', public_app_settings(); end if;
  if not (public_app_settings() ? 'flags' and public_app_settings() ? 'announcement') then raise exception 'FAIL: older keys gone'; end if;
end $$;
reset role;

-- A rider can't change them, and neither can an admin without the authenticator code.
select as_session('00000000-0000-0000-0000-000000000fa2', 'aal2');
set role authenticated;
do $$ begin
  begin
    perform admin_set_setting('app_versions', '{"ios":{"minimum":"9.0"}}');
    raise exception 'FAIL: rider changed app_versions';
  exception when insufficient_privilege then null;
  end;
  begin
    perform admin_log_release('release.play_halt', 'production', null, null);
    raise exception 'FAIL: rider wrote a release log';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select as_session('00000000-0000-0000-0000-000000000fa1', 'aal1');
set role authenticated;
do $$ begin
  begin
    perform admin_set_setting('app_versions', '{"ios":{"minimum":"9.0"}}');
    raise exception 'FAIL: admin without two-factor changed app_versions';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- The owner sets them; bad values are refused in plain words.
select as_session('00000000-0000-0000-0000-000000000fa1', 'aal2');
set role authenticated;
do $$
declare
  bad jsonb;
begin
  perform admin_set_setting('app_versions', '{"ios":{"minimum":"1.0.2","latest":"1.0.4"},"android":{"latest":"1.0.4"},"notice":{"versions":["1.0.3"],"text":"Chat is broken in 1.0.3. A fix is on the way.","until":"2026-11-10T00:00:00Z"}}');
  if public_app_settings() #>> '{app_versions,ios,minimum}' <> '1.0.2' then raise exception 'FAIL: minimum not saved'; end if;
  if public_app_settings() #>> '{app_versions,notice,versions,0}' <> '1.0.3' then raise exception 'FAIL: notice not saved'; end if;

  foreach bad in array array[
    '[]', '{"web":{}}', '{"ios":{"minimum":"soon"}}', '{"ios":{"minimum":"1.0.3.1"}}', '{"ios":{"oldest":"1.0"}}',
    '{"ios":{"minimum":"1.0.10","latest":"1.0.9"}}', '{"notice":{"versions":[],"text":"x"}}',
    '{"notice":{"versions":["1.0.3"],"text":""}}', '{"notice":{"versions":["1.0.3"],"text":"x","until":"never"}}'
  ]::jsonb[] loop
    begin
      perform admin_set_setting('app_versions', bad);
      raise exception 'FAIL: accepted %', bad;
    exception when raise_exception then
      if sqlerrm like 'FAIL:%' then raise; end if;
    end;
  end loop;

  -- 1.0.10 is newer than 1.0.9, and 1.1 is the same as 1.1.0.
  perform admin_set_setting('app_versions', '{"android":{"minimum":"1.0.9","latest":"1.0.10"}}');
  perform admin_set_setting('app_versions', '{"android":{"minimum":"1.1","latest":"1.1.0"}}');
  -- Clearing everything.
  perform admin_set_setting('app_versions', '{}');
  -- The older settings still save.
  perform admin_set_setting('maintenance', 'null');

  perform admin_log_release('release.play_halt', 'production', '{"status":"inProgress"}', null);
  perform admin_log_release('release.play_halt.done', 'production', null, '{"status":"halted"}');
  perform admin_log_release('release.asc_pause.failed', '1.0.3', null, '{"error":"x"}');
  begin
    perform admin_log_release('release.delete_app', 'production', null, null);
    raise exception 'FAIL: unknown release action logged';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
end $$;
reset role;

do $$ begin
  if (select count(*) from admin_audit_log where action = 'setting.update' and target_id = 'app_versions') <> 4 then
    raise exception 'FAIL: app_versions changes not in the audit log';
  end if;
  if (select count(*) from admin_audit_log where target_type = 'store_release') <> 3 then
    raise exception 'FAIL: release actions not in the audit log';
  end if;
  if (select value from app_settings where key = 'app_versions') <> '{}'::jsonb then raise exception 'FAIL: not cleared'; end if;
end $$;
