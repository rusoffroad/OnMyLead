-- "Presented by" events (migration 20261104130000_event_presenter.sql): only the admin sets a
-- presenter, every reader shows it, clearing works, and hosts and riders are refused. Runs after
-- events_test.sql (run_local.sh), reusing Eve (e0e01, Pro) and the admin ad01 from admin_test.sql.
select as_user('00000000-0000-0000-0000-0000000e0e01');
set role authenticated;
create temp table pr_ids (id uuid, code text);
grant all on pr_ids to authenticated, anon;
insert into pr_ids select (j ->> 'id')::uuid, j ->> 'share_code' from (
  select save_event(null, '{"title":"RUS Offroad Fall Rally","starts_at":"2030-10-10T15:00:00Z","ends_at":"2030-10-12T22:00:00Z","location_name":"Moab, UT"}') j) s;
-- P1. The host can't set a presenter (no such field on save_event; the admin function refuses).
select expect_refused($q$select admin_set_event_presenter((select id from pr_ids), 'Me')$q$, 'a host set a presenter');
reset role;

-- P2. The admin sets RUS Offroad; the page, the list and the dashboard show it; the audit log has it.
select as_admin_session('00000000-0000-0000-0000-00000000ad01', 'aal2');
set role authenticated;
select expect_refused($q$select admin_set_event_presenter((select id from pr_ids), 'X')$q$, 'a one-letter presenter');
select admin_set_event_presenter((select id from pr_ids), '  RUS Offroad ');
do $$ begin
  if (event_detail((select code from pr_ids)) ->> 'presented_by') is distinct from 'RUS Offroad' then raise exception 'FAIL: event_detail lacks presented_by'; end if;
  if (select count(*) from jsonb_array_elements(events_list('upcoming')) x where x ->> 'presented_by' = 'RUS Offroad') <> 1 then
    raise exception 'FAIL: events_list lacks presented_by';
  end if;
  if (select count(*) from jsonb_array_elements(admin_events('presented') -> 'rows') x where x ->> 'presented_by' = 'RUS Offroad') <> 1 then
    raise exception 'FAIL: admin_events presented filter';
  end if;
end $$;
reset role;
-- The table itself, read past row level security.
do $$ begin
  if (select presented_by from rider_events where id = (select id from pr_ids)) is distinct from 'RUS Offroad' then
    raise exception 'FAIL: presenter not saved (trimmed)';
  end if;
  if (select presented_at from rider_events where id = (select id from pr_ids)) is null then raise exception 'FAIL: presented_at not set'; end if;
  if not exists (select 1 from admin_audit_log where action = 'event.presenter.set' and target_id = (select id from pr_ids)::text) then
    raise exception 'FAIL: no audit entry';
  end if;
end $$;
-- P3. Clearing it.
select as_admin_session('00000000-0000-0000-0000-00000000ad01', 'aal2');
set role authenticated;
select admin_set_event_presenter((select id from pr_ids), '');
do $$ begin
  if (event_detail((select code from pr_ids)) -> 'presented_by') <> 'null'::jsonb then raise exception 'FAIL: event_detail still shows a presenter'; end if;
end $$;
reset role;
do $$ begin
  if (select presented_by is not null or presented_at is not null from rider_events where id = (select id from pr_ids)) then
    raise exception 'FAIL: presenter not cleared';
  end if;
end $$;

-- P4. Signed out, the page still reads (with the presenter null here).
set role anon;
do $$ begin
  if (event_detail((select code from pr_ids)) ->> 'title') <> 'RUS Offroad Fall Rally' then raise exception 'FAIL: anon cannot read the event'; end if;
end $$;
reset role;

select 'event_presenter_test passed' as result;
