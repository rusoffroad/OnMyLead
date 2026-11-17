-- Email All Riders (Admin Dashboard > Email Riders, 2026-11-16).
--
-- The owner writes one email (an app update, the refer-a-friend promo) and the rider-email edge
-- function sends it to every account with an email address, one email per rider, through Resend.
-- Every email has an unsubscribe link: a rider who uses it gets no more of these emails (ride
-- cancellations and Pro trial reminders have their own switches and are not touched).
--
-- Additive only: one column with a default, two tables with row level security and no policies,
-- and new functions. Nothing an app build in riders' hands uses is changed.

alter table notification_settings
  add column if not exists news_emails boolean not null default true;

-- Riders who unsubscribed before they ever had a notification_settings row (or whose row is
-- gone) are kept here too, so an unsubscribe always sticks.
create table if not exists email_unsubscribes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table email_unsubscribes enable row level security;
revoke all on email_unsubscribes from public, anon, authenticated;

-- Every send, so the dashboard shows what went out and the same email can't go out twice by
-- a double tap.
create table if not exists email_broadcasts (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null,
  subject text not null check (char_length(subject) between 3 and 150),
  body text not null check (char_length(body) between 10 and 10000),
  test boolean not null default false,
  recipients int not null default 0,
  sent int not null default 0,
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  note text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists email_broadcasts_created on email_broadcasts (created_at desc);
alter table email_broadcasts enable row level security;
revoke all on email_broadcasts from public, anon, authenticated;

-- Who gets an Email All Riders email: every account with an email address that isn't suspended,
-- hasn't unsubscribed, and isn't an Apple "Hide My Email" relay address (those only accept mail
-- from senders registered with Apple, so they would bounce).
create or replace function email_audience()
returns table (user_id uuid, email text, first_name text)
language sql stable security definer set search_path = public as $$
  select u.id, u.email::text,
    nullif(split_part(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '')), ' ', 1), '')
  from auth.users u
  left join notification_settings s on s.user_id = u.id
  where u.email is not null and u.email <> '' and position('@' in u.email) > 1
    and u.email not ilike '%@privaterelay.appleid.com'
    and (u.banned_until is null or u.banned_until < now())
    and coalesce(s.news_emails, true)
    and not exists (select 1 from email_unsubscribes x where x.user_id = u.id)
  order by u.created_at;
$$;

-- The dashboard's numbers: how many riders an email would reach right now, how many are left out
-- and why, and the last sends.
create or replace function admin_email_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  return jsonb_build_object(
    'audience', (select count(*) from email_audience()),
    'accounts', (select count(*) from auth.users),
    'no_email', (select count(*) from auth.users where email is null or email = ''),
    'apple_relay', (select count(*) from auth.users where email ilike '%@privaterelay.appleid.com'),
    'unsubscribed', (select count(*) from auth.users u where exists (select 1 from email_unsubscribes x where x.user_id = u.id)
      or exists (select 1 from notification_settings s where s.user_id = u.id and not s.news_emails)),
    'sends', coalesce((
      select jsonb_agg(to_jsonb(b) - 'body' - 'created_by' order by b.created_at desc)
      from (select * from email_broadcasts order by created_at desc limit 20) b
    ), '[]'::jsonb)
  );
end;
$$;

-- Turns a rider's Email All Riders emails off (the unsubscribe link). Service role only: the
-- edge function checks the link's signature first.
create or replace function email_unsubscribe(p_user uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from auth.users where id = p_user) then return false; end if;
  insert into email_unsubscribes (user_id) values (p_user) on conflict do nothing;
  update notification_settings set news_emails = false, updated_at = now() where user_id = p_user;
  return true;
end;
$$;

revoke execute on function email_audience(), admin_email_overview(), email_unsubscribe(uuid) from public, anon, authenticated;
grant execute on function admin_email_overview() to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function email_audience(), email_unsubscribe(uuid) to service_role;
    grant select, insert, update on email_broadcasts to service_role;
    grant select on email_unsubscribes to service_role;
  end if;
end $$;
