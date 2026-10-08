-- Ride chat: "Leader only" messages, and push notifications for new messages.
-- Additive only: one enum, one column with a default, one helper, restrictive policies, a
-- device-token table, and an after-insert trigger that hands new messages to the
-- notify-ride-message Edge Function. Nothing is dropped or rewritten.

-- ---------------------------------------------------------------------------
-- Who a message is for. Existing rows and old app versions get 'everyone'.
-- ---------------------------------------------------------------------------
create type message_audience as enum ('everyone', 'leader');
alter table ride_messages add column audience message_audience not null default 'everyone';

-- The ride's leader: every joined rider with the Leader role. When nobody has been given the
-- role, the organizer leads.
create or replace function is_ride_leader(p_ride uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
           select 1 from ride_members
           where ride_id = p_ride and user_id = p_user and status = 'joined' and role = 'leader'
         )
      or (
           not exists (select 1 from ride_members where ride_id = p_ride and status = 'joined' and role = 'leader')
           and exists (select 1 from rides where id = p_ride and organizer_id = p_user)
         );
$$;

-- A leader-only message is readable only by its sender and the leader. Restrictive, so it is
-- ANDed with messages_read (joined riders only). Realtime applies the same rule.
create policy messages_audience_read on ride_messages as restrictive for select to authenticated
  using (audience = 'everyone' or user_id = auth.uid() or is_ride_leader(ride_id, auth.uid()));

-- Announcements are for the whole group, so they can't be leader-only.
create policy messages_audience_write on ride_messages as restrictive for insert to authenticated
  with check (audience = 'everyone' or kind <> 'announcement');

-- ---------------------------------------------------------------------------
-- Push notifications.
-- Each phone registers its device token through register_push_token. Riders can see and
-- remove only their own tokens; nobody else (and no app) can read them.
-- ---------------------------------------------------------------------------
create table push_tokens (
  token text primary key check (length(token) between 16 and 512),
  user_id uuid not null references profiles (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);
create index on push_tokens (user_id);
alter table push_tokens enable row level security;
create policy push_tokens_own on push_tokens for select to authenticated using (user_id = auth.uid());
create policy push_tokens_delete_own on push_tokens for delete to authenticated using (user_id = auth.uid());

-- Claims a device token for the signed-in rider. A phone that signs in as someone else moves
-- its token over, so the previous account stops getting that phone's notifications.
create or replace function register_push_token(p_token text, p_platform text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  insert into push_tokens (token, user_id, platform) values (p_token, auth.uid(), p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;

-- Who should be notified about a message: joined riders on the ride except the sender, or
-- only the leader for leader-only messages. Server-side only (the Edge Function calls it
-- with the service role); anyone else gets an error.
create or replace function ride_message_recipients(p_message uuid)
returns table (user_id uuid, token text, platform text)
language plpgsql stable security invoker set search_path = public as $$
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'not allowed';
  end if;
  return query
  select t.user_id, t.token, t.platform
  from ride_messages msg
  join ride_members m on m.ride_id = msg.ride_id and m.status = 'joined' and m.left_at is null
  join push_tokens t on t.user_id = m.user_id
  where msg.id = p_message
    and m.user_id <> msg.user_id
    and (msg.audience = 'everyone' or is_ride_leader(msg.ride_id, m.user_id));
end;
$$;
revoke execute on function ride_message_recipients(uuid) from public, anon, authenticated;

-- Hand each new message to the Edge Function. Uses pg_net (asynchronous, so sending a
-- message never waits on it) and two Vault secrets:
--   onmylead_push_url     https://<project>.supabase.co/functions/v1/notify-ride-message
--   onmylead_push_secret  the same value as the function's PUSH_WEBHOOK_SECRET
-- Until both secrets exist this does nothing, and any failure here is only a warning: a
-- message is never refused because a notification could not be sent.
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
end $$;

create or replace function ride_message_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_secret text;
begin
  if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then
    return null;
  end if;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'onmylead_push_url'$q$ into v_url;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'onmylead_push_secret'$q$ into v_secret;
  if v_url is null or v_secret is null then return null; end if;
  execute $q$select net.http_post(url := $1, body := $2, headers := $3)$q$
    using v_url,
          jsonb_build_object('message_id', new.id),
          jsonb_build_object('Content-Type', 'application/json', 'x-onmylead-push-secret', v_secret);
  return null;
exception when others then
  raise warning 'ride_message_notify: %', sqlerrm;
  return null;
end;
$$;

create trigger ride_messages_notify after insert on ride_messages
  for each row execute function ride_message_notify();
