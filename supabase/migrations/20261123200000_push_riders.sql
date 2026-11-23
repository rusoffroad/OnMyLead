-- Admin > Push Riders (Chris, 2026-11-23: "send a push notification ... to the users about this
-- sale"): one push notification to riders' phones from the dashboard, through the rider-push edge
-- function. Server only: installed apps already receive pushes, and a tap just opens the app.
-- Riders who turned off account notifications are left out, and so is anyone in their quiet hours.

create table if not exists push_broadcasts (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users (id) on delete set null,
  title text not null check (length(title) between 3 and 80),
  body text not null check (length(body) between 5 and 240),
  audience text not null check (audience in ('not_subscribed', 'everyone')),
  test boolean not null default false,
  recipients int not null default 0,
  sent int not null default 0,
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  note text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
alter table push_broadcasts enable row level security;
revoke all on push_broadcasts from public, anon, authenticated;

-- The phones a push would reach. 'not_subscribed': riders without a paid App Store or Google Play
-- subscription or a complimentary grant (Free riders and riders on a trial). 'everyone': all.
create or replace function push_audience(p_audience text)
returns table (user_id uuid, token text, platform text)
language sql stable security definer set search_path = public as $$
  select t.user_id, t.token, t.platform
  from push_tokens t
  join auth.users u on u.id = t.user_id
  left join notification_settings s on s.user_id = t.user_id
  where (u.banned_until is null or u.banned_until < now())
    and coalesce(s.account_push, true)
    and not (coalesce(s.quiet_hours, false) and in_quiet_window(
      s.quiet_start, s.quiet_end,
      (extract(hour from now() at time zone coalesce(s.time_zone, 'UTC')) * 60
        + extract(minute from now() at time zone coalesce(s.time_zone, 'UTC')))::int))
    and (p_audience = 'everyone'
      or (p_audience = 'not_subscribed' and not has_paid_pro(t.user_id) and (live_grant(t.user_id, 'comp')).id is null));
$$;

create or replace function admin_push_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  return jsonb_build_object(
    'not_subscribed', (select count(distinct a.user_id) from push_audience('not_subscribed') a),
    'not_subscribed_devices', (select count(*) from push_audience('not_subscribed')),
    'everyone', (select count(distinct a.user_id) from push_audience('everyone') a),
    'everyone_devices', (select count(*) from push_audience('everyone')),
    'with_phones', (select count(distinct t.user_id) from push_tokens t),
    'sends', coalesce((
      select jsonb_agg(to_jsonb(b) - 'created_by' order by b.created_at desc)
      from (select * from push_broadcasts order by created_at desc limit 20) b
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function push_audience(text), admin_push_overview() from public, anon, authenticated;
grant execute on function admin_push_overview() to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function push_audience(text) to service_role;
    grant select, insert, update on push_broadcasts to service_role;
    grant select, delete on push_tokens to service_role;
  end if;
end $$;
