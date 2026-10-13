-- Block Rider.
-- A rider can block another rider: the app then hides the blocked rider's chat messages and polls
-- from them, in ride chat and in group chat, and the notify-ride-message Edge Function skips
-- their chat pushes to them. Safety pushes (Need Help, EMERGENCY) always go through.
--
-- Each row belongs to the rider who blocked. They can list, add and remove only their own rows,
-- and the blocked rider can never see that they were blocked: there is no policy that shows a
-- row to anyone else, and nothing in the app or the pushes tells them.
--
-- Additive only: one new table.

create table blocked_riders (
  blocker_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
-- The Edge Function looks up who blocked a message's sender.
create index blocked_riders_blocked_idx on blocked_riders (blocked_id);

alter table blocked_riders enable row level security;

create policy blocked_riders_read on blocked_riders for select to authenticated
  using (blocker_id = auth.uid());
create policy blocked_riders_add on blocked_riders for insert to authenticated
  with check (blocker_id = auth.uid());
create policy blocked_riders_remove on blocked_riders for delete to authenticated
  using (blocker_id = auth.uid());
-- No update: unblock and block again instead.

revoke all on blocked_riders from anon, authenticated;
grant select, delete on blocked_riders to authenticated;
grant insert (blocked_id) on blocked_riders to authenticated;
