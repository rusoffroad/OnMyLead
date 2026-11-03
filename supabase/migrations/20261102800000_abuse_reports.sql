-- Report a rider for abuse or harassment (2.0).
--
-- Builds on Report Ride / Report Rider (20261018200000_reports.sql) and the Admin Dashboard's
-- Reports page (20261018300000_admin_dashboard.sql):
--   * reports.source and reports.group_id say where the report was sent from (direct messages, a
--     riding group chat, a ride, Out Riding, You > Report a Rider). Older app builds send neither and
--     keep working; their reports just have no source.
--   * When a rider is reported, the messages between the two riders are COPIED into
--     report_messages: their direct messages, and what either of them wrote in the last 30 days in a
--     riding group chat or ride chat they share. It is a copy so the reported rider can't hide what
--     they wrote by leaving a group or deleting a ride. Only the Admin Dashboard reads it
--     (admin_report), and every time it is opened that is written to the audit log. Riders never
--     read it, not even the reporter. Nothing else about direct messages changes: the owner still
--     can't read a conversation nobody reported.
--   * Every new report emails the owner: the trigger queues {"type":"report","id":...} to the
--     notify-ride-message function (the same path as pushes), which reads report_email() and sends
--     it to REPORTS_TO (or CONTACT_TO). The email has no message text, only a link to the dashboard.
--   * Timed suspensions and permanent bans are Auth bans set by the admin-api function (no table
--     here): Auth refuses to sign in or renew a session for a banned account until the ban ends.

-- ---------------------------------------------------------------------------
-- Where a report came from
-- ---------------------------------------------------------------------------
alter table reports add column if not exists source text
  check (source is null or source in ('dm', 'group_chat', 'ride_chat', 'ride', 'roster', 'out_riding', 'you'));
alter table reports add column if not exists group_id uuid references riding_groups (id) on delete set null;
grant insert (source, group_id) on reports to authenticated;

-- ---------------------------------------------------------------------------
-- The copied conversation
-- ---------------------------------------------------------------------------
create table if not exists report_messages (
  id bigint generated always as identity primary key,
  report_id uuid not null references reports (id) on delete cascade,
  source text not null check (source in ('dm', 'group_chat', 'ride_chat')),
  -- The conversation, group or ride it came from, and its name when copied.
  source_id uuid,
  source_name text,
  sender_id uuid references profiles (id) on delete set null,
  sender_name text,
  body text not null,
  sent_at timestamptz not null
);
create index if not exists report_messages_report_idx on report_messages (report_id, source, sent_at);
alter table report_messages enable row level security;
-- No policies and no grants: only security definer functions below read or write it.
revoke all on report_messages from public, anon, authenticated;

-- How much is copied: the latest 200 direct messages, and per shared group or ride the latest 60
-- messages from either rider in the last 30 days, from at most 5 groups and 5 rides.
create or replace function report_copy_conversation(p_report uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  r reports;
  v_lo uuid; v_hi uuid;
  v_count int := 0; n int;
begin
  select * into r from reports where id = p_report;
  if r.id is null or r.kind <> 'rider' or r.reporter_id is null or r.reported_user_id is null then
    return 0;
  end if;
  -- Copied once, when the report is saved.
  if exists (select 1 from report_messages where report_id = p_report) then return 0; end if;
  v_lo := least(r.reporter_id, r.reported_user_id);
  v_hi := greatest(r.reporter_id, r.reported_user_id);

  -- Direct messages (all of them, oldest first in the dashboard; only the latest 200 are kept).
  insert into report_messages (report_id, source, source_id, source_name, sender_id, sender_name, body, sent_at)
  select p_report, 'dm', m.thread_id, 'Direct Messages', m.sender_id, p.display_name, m.body, m.sent_at
  from (
    select dm.* from direct_messages dm join dm_threads t on t.id = dm.thread_id
    where t.user_lo = v_lo and t.user_hi = v_hi
    order by dm.created_at desc limit 200
  ) m left join profiles p on p.id = m.sender_id;
  get diagnostics n = row_count; v_count := v_count + n;

  -- Riding group chats both riders are in (the reported group first).
  insert into report_messages (report_id, source, source_id, source_name, sender_id, sender_name, body, sent_at)
  select p_report, 'group_chat', g.id, g.name, m.user_id, p.display_name, m.body, m.sent_at
  from (
    select rg.id, rg.name from riding_groups rg
    -- is_group_member counts the owner, who has no riding_group_members row.
    where is_group_member(rg.id, r.reporter_id) and is_group_member(rg.id, r.reported_user_id)
    order by (rg.id = r.group_id) desc nulls last, rg.created_at desc limit 5
  ) g
  cross join lateral (
    select gm.* from group_messages gm
    where gm.group_id = g.id and gm.user_id in (r.reporter_id, r.reported_user_id)
      and gm.created_at > now() - interval '30 days'
    order by gm.created_at desc limit 60
  ) m left join profiles p on p.id = m.user_id;
  get diagnostics n = row_count; v_count := v_count + n;

  -- Ride chats both riders were on (the reported ride first).
  insert into report_messages (report_id, source, source_id, source_name, sender_id, sender_name, body, sent_at)
  select p_report, 'ride_chat', rd.id, rd.name, m.user_id, p.display_name, m.body, m.sent_at
  from (
    select x.id, x.name from rides x
    where (x.organizer_id = r.reporter_id or exists (select 1 from ride_members a where a.ride_id = x.id and a.user_id = r.reporter_id))
      and (x.organizer_id = r.reported_user_id or exists (select 1 from ride_members b where b.ride_id = x.id and b.user_id = r.reported_user_id))
      and (x.id = r.ride_id or x.created_at > now() - interval '60 days')
    order by (x.id = r.ride_id) desc nulls last, x.created_at desc limit 5
  ) rd
  cross join lateral (
    select rm.* from ride_messages rm
    where rm.ride_id = rd.id and rm.user_id in (r.reporter_id, r.reported_user_id)
      and rm.created_at > now() - interval '30 days'
    order by rm.created_at desc limit 60
  ) m left join profiles p on p.id = m.user_id;
  get diagnostics n = row_count; v_count := v_count + n;

  return v_count;
end;
$$;
revoke execute on function report_copy_conversation(uuid) from public, anon, authenticated;

-- After a report is saved: copy the conversation, then email the owner. Neither can ever stop a
-- report from being saved.
create or replace function reports_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    perform report_copy_conversation(new.id);
  exception when others then
    raise warning 'report_copy_conversation: %', sqlerrm;
  end;
  perform queue_push(jsonb_build_object('type', 'report', 'id', new.id));
  return null;
end;
$$;
revoke execute on function reports_after_insert() from public, anon, authenticated;

drop trigger if exists reports_after_insert on reports;
create trigger reports_after_insert after insert on reports for each row execute function reports_after_insert();

-- ---------------------------------------------------------------------------
-- The owner's email (read by notify-ride-message with the service role)
-- ---------------------------------------------------------------------------
create or replace function report_email(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  -- The service role has no auth.uid(); a signed-in rider never gets here.
  if auth.uid() is not null and not is_admin(auth.uid()) then
    raise exception 'admin only' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'id', x.id, 'kind', x.kind, 'reason', x.reason, 'details', x.details, 'source', x.source,
    'created_at', x.created_at,
    'reporter_name', rp.display_name, 'reported_name', ru.display_name, 'ride_name', rd.name, 'group_name', g.name,
    'reports_on_user', (select count(*) from reports y where x.reported_user_id is not null and y.reported_user_id = x.reported_user_id),
    'reporters_on_user', (select count(distinct y.reporter_id) from reports y where x.reported_user_id is not null and y.reported_user_id = x.reported_user_id),
    'messages_copied', (select count(*) from report_messages m where m.report_id = x.id))
  from reports x
  left join profiles rp on rp.id = x.reporter_id
  left join profiles ru on ru.id = x.reported_user_id
  left join rides rd on rd.id = x.ride_id
  left join riding_groups g on g.id = x.group_id
  where x.id = p_id
  into v;
  return v;
end;
$$;
revoke execute on function report_email(uuid) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function report_email(uuid) to service_role;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Admin Dashboard
-- ---------------------------------------------------------------------------
-- The list, now with where it came from, how many messages were copied and whether the reported
-- rider is suspended. Same signature and shape as before (extra keys only).
create or replace function admin_reports(p_status text default 'open', p_page int default 0, p_page_size int default 50)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_rows jsonb; v_total bigint;
begin
  perform require_admin();
  p_page_size := least(greatest(coalesce(p_page_size, 50), 1), 200);
  p_page := greatest(coalesce(p_page, 0), 0);
  with f as (
    select x.id, x.kind, x.reason, x.details, x.status, x.created_at, x.resolved_at, x.resolution_note,
           x.source, x.group_id, g.name as group_name,
           x.ride_id, rd.name as ride_name, rd.status as ride_status,
           x.reported_user_id, ru.display_name as reported_name,
           x.reporter_id, rp.display_name as reporter_name,
           (select count(*) from reports y where y.reported_user_id is not null and y.reported_user_id = x.reported_user_id) as reports_on_user,
           (select count(*) from report_messages m where m.report_id = x.id) as messages_copied,
           (select u.banned_until from auth.users u where u.id = x.reported_user_id) as reported_banned_until
    from reports x
    left join rides rd on rd.id = x.ride_id
    left join riding_groups g on g.id = x.group_id
    left join profiles ru on ru.id = x.reported_user_id
    left join profiles rp on rp.id = x.reporter_id
    where case coalesce(p_status, 'open')
      when 'open' then x.status in ('open', 'reviewing')
      when 'all' then true
      else x.status = p_status end
  )
  select (select count(*) from f),
         coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
           select * from f order by created_at desc offset p_page * p_page_size limit p_page_size) x), '[]')
    into v_total, v_rows;
  return jsonb_build_object('rows', v_rows, 'total', v_total);
end;
$$;

-- One report with its copied conversation. Opening it is written to the audit log.
create or replace function admin_report(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v jsonb;
begin
  perform require_admin();
  select to_jsonb(x) into v from (
    select r.id, r.kind, r.reason, r.details, r.status, r.created_at, r.resolved_at, r.resolution_note, r.source,
           r.group_id, g.name as group_name, r.ride_id, rd.name as ride_name,
           r.reported_user_id, ru.display_name as reported_name,
           r.reporter_id, rp.display_name as reporter_name,
           (select count(*) from reports y where r.reported_user_id is not null and y.reported_user_id = r.reported_user_id) as reports_on_user,
           (select count(distinct y.reporter_id) from reports y where r.reported_user_id is not null and y.reported_user_id = r.reported_user_id) as reporters_on_user,
           (select u.banned_until from auth.users u where u.id = r.reported_user_id) as reported_banned_until,
           coalesce((select jsonb_agg(jsonb_build_object(
               'source', m.source, 'source_id', m.source_id, 'source_name', m.source_name,
               'sender_id', m.sender_id, 'sender_name', m.sender_name, 'body', m.body, 'sent_at', m.sent_at)
             order by m.source, m.source_id, m.sent_at)
             from report_messages m where m.report_id = r.id), '[]') as messages
    from reports r
    left join riding_groups g on g.id = r.group_id
    left join rides rd on rd.id = r.ride_id
    left join profiles ru on ru.id = r.reported_user_id
    left join profiles rp on rp.id = r.reporter_id
    where r.id = p_id
  ) x;
  if v is null then raise exception 'report not found'; end if;
  perform log_admin_action('report.view', 'report', p_id::text, null,
          jsonb_build_object('messages', jsonb_array_length(v -> 'messages')));
  return v;
end;
$$;
revoke execute on function admin_report(uuid) from public, anon;
grant execute on function admin_report(uuid) to authenticated;
