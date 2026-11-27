-- Admin > Push Riders: a third audience, "Riders With Complimentary Pro" (Chris, 2026-11-27: "send
-- to the others ... dont send to the ones you just sent to, or the 2 paid ones"). Riders with a
-- live complimentary grant who are not also paying through a store, and not admins. Same skips as
-- the other audiences (suspended, account notifications off, quiet hours). Adds to the existing
-- function and overview; the two audiences already in use keep working unchanged.

alter table push_broadcasts drop constraint if exists push_broadcasts_audience_check;
alter table push_broadcasts add constraint push_broadcasts_audience_check
  check (audience in ('not_subscribed', 'everyone', 'complimentary'));

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
      or (p_audience = 'not_subscribed' and not has_paid_pro(t.user_id) and (live_grant(t.user_id, 'comp')).id is null)
      or (p_audience = 'complimentary' and not has_paid_pro(t.user_id) and (live_grant(t.user_id, 'comp')).id is not null
          and not exists (select 1 from admin_users a where a.user_id = t.user_id)));
$$;

create or replace function admin_push_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  return jsonb_build_object(
    'not_subscribed', (select count(distinct a.user_id) from push_audience('not_subscribed') a),
    'not_subscribed_devices', (select count(*) from push_audience('not_subscribed')),
    'complimentary', (select count(distinct a.user_id) from push_audience('complimentary') a),
    'complimentary_devices', (select count(*) from push_audience('complimentary')),
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
  end if;
end $$;
