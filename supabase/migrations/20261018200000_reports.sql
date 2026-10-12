-- Report Ride / Report Rider.
-- A rider can flag a ride or another rider for the owner to look at. Reports are write-only from
-- the app: the reporter inserts one and can never read it back, edit it or see anyone else's.
-- The Admin Dashboard reads and resolves them through its own admin_* functions.

create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid default auth.uid() references profiles(id) on delete set null,
  kind text not null check (kind in ('ride', 'rider')),
  ride_id uuid references rides(id) on delete set null,
  reported_user_id uuid references profiles(id) on delete set null,
  reason text not null check (char_length(reason) between 1 and 60),
  details text check (details is null or char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz default now(),
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_note text
);
create index reports_status_idx on reports (status, created_at desc);

alter table reports enable row level security;

-- Insert only, as yourself, as a fresh open report about a ride or someone other than you.
-- No select, update or delete policy: the app never reads reports.
create policy reports_insert on reports for insert to authenticated with check (
  reporter_id = auth.uid()
  and status = 'open'
  and resolved_at is null and resolved_by is null and resolution_note is null
  and ((kind = 'ride' and ride_id is not null) or (kind = 'rider' and reported_user_id is not null))
  and reported_user_id is distinct from auth.uid()
);

revoke all on reports from anon, authenticated;
grant insert (kind, ride_id, reported_user_id, reason, details) on reports to authenticated;

-- At most 10 reports an hour from one account, so the queue can't be flooded.
create function reports_rate_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from reports where reporter_id = new.reporter_id and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'report_limit: too many reports, try again later' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function reports_rate_limit() from public, anon, authenticated;

create trigger reports_rate_limit before insert on reports for each row execute function reports_rate_limit();
