-- Notifications inbox (Chris 2026-11-02: "need a way to show and clear app notifications").
--
-- Every notification OnMyLead sends a rider is also saved here, so the app (iPhone, iPad, Android
-- phones and tablets, and onmylead.com) can list them under the bell on the Rides tab, mark them
-- read and clear them, one at a time or all at once.
--
-- How rows get here: queue_push (the one place every push event passes through, from the
-- database triggers) now first calls record_notifications(event). That runs the same push_batch*
-- function the notify-ride-message Edge Function runs, so the inbox gets exactly the text the
-- phone got, after each rider's notification settings, quiet hours, mutes and blocks. One row per
-- rider (not per phone). It never fails the action that caused it.
--   * A status tap and its cancellation share a collapse key, so "Ann cancelled Need Help"
--     replaces "Ann needs help", like on the lock screen.
--   * Ride chat, group chat and direct messages fold into one unread row per conversation
--     ("+2 more"), so a busy chat doesn't bury a rider alert.
--   * A ride chat message deleted by its sender is removed from everyone's inbox.
--   * Each rider keeps at most the 100 newest rows from the last 30 days.
--
-- Riders read their own rows (row level security) and change them only through
-- mark_notifications_read and clear_notifications. Deleting an account removes its rows
-- (on delete cascade).
--
-- Additive only: one new table, three new functions, one trigger, and queue_push replaced with
-- the same body plus the record_notifications call. The Edge Function is unchanged, and older app
-- builds keep working (they never read this table). Safe to run more than once.

create table if not exists rider_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  data jsonb not null default '{}',
  collapse_key text,
  count int not null default 1,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists rider_notifications_user_idx on rider_notifications (user_id, created_at desc);
create index if not exists rider_notifications_key_idx on rider_notifications (user_id, collapse_key) where collapse_key is not null;
create index if not exists rider_notifications_message_idx on rider_notifications ((data ->> 'messageId')) where data ? 'messageId';

alter table rider_notifications enable row level security;
drop policy if exists "read own notifications" on rider_notifications;
create policy "read own notifications" on rider_notifications for select to authenticated
  using (user_id = auth.uid());
-- Writes only through the functions below.
revoke insert, update, delete on rider_notifications from anon, authenticated;
revoke all on rider_notifications from anon;
grant select on rider_notifications to authenticated;

-- Live updates for the bell's count.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'rider_notifications') then
    alter publication supabase_realtime add table rider_notifications;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Save the notifications for one push event (same event shapes as notify-ride-message).
-- ---------------------------------------------------------------------------
create or replace function record_notifications(p_event jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_type text := p_event ->> 'type';
  v_fn text;
  v_sender uuid;
  v_chat_key text;
  v_key text;
  r record;
begin
  if v_type is null then return; end if;
  -- The same routing as the Edge Function.
  v_fn := case
    when v_type in ('trial', 'badge', 'trail_hidden') then 'push_batch_account'
    when v_type in ('invite', 'leader_ride') then 'push_batch_social'
    when v_type = 'group_message' then 'push_batch_group'
    when v_type = 'direct_message' then 'push_batch_dm'
    when v_type in ('friend_request', 'friend_accept') then 'push_batch_friends'
    else 'push_batch'
  end;
  if to_regprocedure(v_fn || '(jsonb)') is null then return; end if;

  -- Chat folds into one row per conversation; riders who blocked the sender get nothing
  -- (status taps, quick replies and announcements are never filtered, like the push).
  if v_type = 'message' then
    select m.user_id, case when m.kind = 'chat' then 'chat:' || m.ride_id || ':' || m.audience end
      into v_sender, v_chat_key
    from ride_messages m where m.id = (p_event ->> 'id')::uuid;
    if v_chat_key is null then v_sender := null; end if;
  elsif v_type = 'group_message' then
    select m.user_id, 'group:' || m.group_id into v_sender, v_chat_key
    from group_messages m where m.id = (p_event ->> 'id')::uuid;
  end if;

  for r in execute format(
    'select distinct on (b.user_id) b.user_id, b.title, b.body, b.data from %I($1) b order by b.user_id', v_fn
  ) using p_event loop
    if v_sender is not null and exists (
      select 1 from blocked_riders x where x.blocker_id = r.user_id and x.blocked_id = v_sender
    ) then
      continue;
    end if;
    v_key := case
      when r.data ? 'collapseId' then 'item:' || (r.data ->> 'collapseId')
      when v_type = 'direct_message' then 'dm:' || coalesce(r.data ->> 'userId', '')
      else v_chat_key
    end;

    if v_key like 'item:%' then
      -- A status tap and its cancellation: the newer one replaces the older.
      delete from rider_notifications n where n.user_id = r.user_id and n.collapse_key = v_key;
    elsif v_key is not null then
      update rider_notifications n
      set title = r.title, body = coalesce(r.body, ''), data = coalesce(r.data, '{}'), count = n.count + 1, created_at = now()
      where n.user_id = r.user_id and n.collapse_key = v_key and n.read_at is null;
      if found then continue; end if;
    end if;

    insert into rider_notifications (user_id, kind, title, body, data, collapse_key)
    values (r.user_id, coalesce(r.data ->> 'type', v_type), r.title, coalesce(r.body, ''), coalesce(r.data, '{}'), v_key);

    delete from rider_notifications n
    where n.user_id = r.user_id
      and (n.created_at < now() - interval '30 days'
           or n.id in (select o.id from rider_notifications o where o.user_id = r.user_id order by o.created_at desc offset 100));
  end loop;
exception when others then
  -- Never stop the message, status tap or ride change that caused it.
  raise warning 'record_notifications: %', sqlerrm;
end;
$$;
revoke execute on function record_notifications(jsonb) from public, anon, authenticated;

-- queue_push as in 20261015000000_notification_settings.sql, plus the inbox. Runs whether or not
-- the push itself is set up (the Vault secrets), so the inbox works on the website too.
create or replace function queue_push(p_event jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_secret text;
begin
  perform record_notifications(p_event);
  if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then
    return;
  end if;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'onmylead_push_url'$q$ into v_url;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'onmylead_push_secret'$q$ into v_secret;
  if v_url is null or v_secret is null then return; end if;
  execute $q$select net.http_post(url := $1, body := $2, headers := $3)$q$
    using v_url, p_event,
          jsonb_build_object('Content-Type', 'application/json', 'x-onmylead-push-secret', v_secret);
exception when others then
  raise warning 'queue_push: %', sqlerrm;
end;
$$;
revoke execute on function queue_push(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- What the app calls. Null ids means all of mine. Each returns how many rows it changed.
-- ---------------------------------------------------------------------------
create or replace function mark_notifications_read(p_ids uuid[] default null)
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  update rider_notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics v = row_count;
  return v;
end;
$$;

create or replace function clear_notifications(p_ids uuid[] default null)
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from rider_notifications where user_id = auth.uid() and (p_ids is null or id = any (p_ids));
  get diagnostics v = row_count;
  return v;
end;
$$;
revoke execute on function mark_notifications_read(uuid[]), clear_notifications(uuid[]) from public, anon;
grant execute on function mark_notifications_read(uuid[]), clear_notifications(uuid[]) to authenticated;

-- A ride chat message its sender deleted leaves everyone's inbox too.
create or replace function ride_message_unnotify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from rider_notifications where data ->> 'messageId' = old.id::text;
  return null;
exception when others then
  raise warning 'ride_message_unnotify: %', sqlerrm;
  return null;
end;
$$;
drop trigger if exists ride_messages_unnotify on ride_messages;
create trigger ride_messages_unnotify after delete on ride_messages
  for each row execute function ride_message_unnotify();
