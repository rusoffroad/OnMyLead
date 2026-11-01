-- Release controls: what the owner can do from onmylead.com/admin/releases when an app update
-- turns out to be broken.
--
-- Neither the App Store nor Google Play lets an app go back to an older version, so this adds:
--   1. `app_versions`, a new app setting every 1.0.3+ app reads with the others
--      (public_app_settings): a minimum and latest version per store, and a notice shown only on
--      chosen versions. The app's rules are in app/src/core/app-versions.ts.
--   2. admin_log_release(), the Audit Log entry the store-releases edge function writes with the
--      admin's own session before (and after) it halts, resumes or finishes a store rollout.
--
-- Backward compatible: one new settings row, public_app_settings() gains a key that older app
-- builds ignore, admin_set_setting() accepts one more key, and one new function.

-- ---------------------------------------------------------------------------
-- 1. Minimum and latest versions, and the version notice.
-- ---------------------------------------------------------------------------
insert into app_settings (key, value) values ('app_versions', '{}') on conflict (key) do nothing;

-- "1.0.3" -> {1,0,3}; "1.1" -> {1,1,0}. Null when it isn't a version.
create or replace function version_parts(p_version text)
returns int[] language sql immutable set search_path = public as $$
  select case when p_version ~ '^\d{1,4}(\.\d{1,4}){0,2}$'
    then (string_to_array(p_version || repeat('.0', 2 - (length(p_version) - length(replace(p_version, '.', '')))), '.'))::int[]
  end;
$$;

-- Raises a plain-words error when the Releases page sends something the app can't use.
create or replace function check_app_versions(p_value jsonb)
returns void language plpgsql immutable set search_path = public as $$
declare
  v_platform text;
  v_part jsonb;
  v_key text;
  v_notice jsonb;
begin
  if jsonb_typeof(p_value) <> 'object' then raise exception 'app_versions must be an object'; end if;
  for v_key in select jsonb_object_keys(p_value) loop
    if v_key not in ('ios', 'android', 'notice') then raise exception 'app_versions: unknown key %', v_key; end if;
  end loop;
  foreach v_platform in array array['ios', 'android'] loop
    v_part := p_value -> v_platform;
    continue when v_part is null or jsonb_typeof(v_part) = 'null';
    if jsonb_typeof(v_part) <> 'object' then raise exception 'app_versions.%: must be an object', v_platform; end if;
    for v_key in select jsonb_object_keys(v_part) loop
      if v_key not in ('minimum', 'latest') then raise exception 'app_versions.%: unknown key %', v_platform, v_key; end if;
      if jsonb_typeof(v_part -> v_key) <> 'string' or version_parts(v_part ->> v_key) is null then
        raise exception 'app_versions.%.%: must be a version like 1.0.3', v_platform, v_key;
      end if;
    end loop;
    if v_part ? 'minimum' and v_part ? 'latest'
       and version_parts(v_part ->> 'minimum') > version_parts(v_part ->> 'latest') then
      raise exception 'app_versions.%: the minimum version can''t be newer than the latest version', v_platform;
    end if;
  end loop;
  v_notice := p_value -> 'notice';
  if v_notice is not null and jsonb_typeof(v_notice) <> 'null' then
    if jsonb_typeof(v_notice) <> 'object'
       or jsonb_typeof(v_notice -> 'text') is distinct from 'string'
       or length(btrim(v_notice ->> 'text')) not between 1 and 500 then
      raise exception 'app_versions.notice: needs a message of 1 to 500 characters';
    end if;
    if jsonb_typeof(v_notice -> 'versions') is distinct from 'array'
       or jsonb_array_length(v_notice -> 'versions') not between 1 and 20
       or exists (select 1 from jsonb_array_elements(v_notice -> 'versions') e
                  where jsonb_typeof(e) <> 'string' or version_parts(e #>> '{}') is null) then
      raise exception 'app_versions.notice: list 1 to 20 versions like 1.0.3';
    end if;
    if v_notice ? 'until' and (jsonb_typeof(v_notice -> 'until') <> 'string' or (v_notice ->> 'until') !~ '^\d{4}-\d{2}-\d{2}') then
      raise exception 'app_versions.notice: until must be a date';
    end if;
  end if;
end;
$$;

-- What the app may read: the banner texts, the flags and now the release controls.
create or replace function public_app_settings()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'announcement', setting('announcement'),
    'maintenance', setting('maintenance'),
    'flags', setting('flags'),
    'app_versions', coalesce(setting('app_versions'), '{}'::jsonb));
$$;
grant execute on function public_app_settings() to anon, authenticated;

-- Same as migration 20261018000000, plus app_versions.
create or replace function admin_set_setting(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb;
begin
  perform require_admin();
  case p_key
    when 'trial_days' then
      if jsonb_typeof(p_value) <> 'number' or (p_value)::text::numeric not between 1 and 365
         or (p_value)::text::numeric <> trunc((p_value)::text::numeric) then
        raise exception 'trial_days must be a whole number from 1 to 365';
      end if;
    when 'auto_trial' then
      if jsonb_typeof(p_value) <> 'boolean' then raise exception 'auto_trial must be true or false'; end if;
    when 'announcement', 'maintenance' then
      if jsonb_typeof(p_value) not in ('null', 'object')
         or (jsonb_typeof(p_value) = 'object' and (jsonb_typeof(p_value -> 'text') <> 'string' or length(p_value ->> 'text') not between 1 and 500)) then
        raise exception '% must be null or {"text": "...", "until": "..."}', p_key;
      end if;
    when 'flags' then
      if jsonb_typeof(p_value) <> 'object'
         or exists (select 1 from jsonb_each(p_value) e where jsonb_typeof(e.value) <> 'boolean') then
        raise exception 'flags must be an object of true/false values';
      end if;
    when 'app_versions' then
      perform check_app_versions(p_value);
    else
      raise exception 'unknown setting %', p_key;
  end case;
  select value into v_before from app_settings where key = p_key;
  insert into app_settings (key, value, updated_at, updated_by) values (p_key, p_value, now(), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  perform log_admin_action('setting.update', 'setting', p_key, v_before, p_value);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Store rollout actions, logged by the store-releases edge function as the admin.
-- ---------------------------------------------------------------------------
-- Every change is logged before the store is asked (no entry, no change), then again with the
-- store's answer (`.done` or `.failed`), so the Audit Log shows what was tried and what happened.
create or replace function admin_log_release(p_action text, p_target_id text, p_before jsonb, p_after jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_base text := regexp_replace(p_action, '\.(done|failed)$', '');
begin
  perform require_admin();
  if v_base not in (
    'release.play_halt', 'release.play_resume', 'release.play_rollout', 'release.play_complete',
    'release.asc_pause', 'release.asc_resume', 'release.asc_complete', 'release.asc_phased_on'
  ) then
    raise exception 'unknown action %', p_action;
  end if;
  if p_target_id is null or length(p_target_id) not between 1 and 200 then raise exception 'target required'; end if;
  perform log_admin_action(p_action, 'store_release', p_target_id, p_before, p_after);
end;
$$;

revoke all on function version_parts(text), check_app_versions(jsonb) from public, anon, authenticated;
revoke all on function admin_log_release(text, text, jsonb, jsonb) from public, anon;
grant execute on function admin_log_release(text, text, jsonb, jsonb) to authenticated;
revoke execute on function admin_set_setting(text, jsonb) from public, anon;
grant execute on function admin_set_setting(text, jsonb) to authenticated;
