-- OnMyLead Pro: who has Pro, the automatic 30-day trial, the Free ride allowance, the Admin
-- role and its audit log. The plan and the contracts other code builds on are in
-- /mnt/project-files/onmylead/pro/plan.md (section 4).
--
--   * Pro comes from an app-managed grant (the signup trial, or a complimentary grant from the
--     Admin) or a verified App Store subscription. The database is the only judge: has_pro().
--   * Admin is a separate list (admin_users) and is never a subscription. Admins get every Pro
--     feature. Admin-only functions also need a multi-factor session (aal2).
--   * Free riders create one ride per UTC calendar month, counted in a ledger that deleting,
--     cancelling or handing off a ride never shrinks. A per-rider lock stops two at once.
--   * Pro-only actions on the server: poll creation, saved group creation and adding riders,
--     and saving a newly imported GPX route. Nothing already saved is removed or hidden.
--   * Safety features (Ride Mode, Help, EMERGENCY, Mechanical Issue, sharing, chat, joining)
--     are never checked here.
--
-- Additive: new tables and functions, two triggers on auth.users/rides, three guard triggers,
-- feature_plans rows, and new notification settings columns. Existing users get no trial.

-- ---------------------------------------------------------------------------
-- 1. Admins. Rows are added only by SQL run by the owner (never from the app).
-- ---------------------------------------------------------------------------
create table admin_users (
  user_id uuid primary key references profiles (id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid,
  note text
);
alter table admin_users enable row level security;
revoke all on admin_users from anon, authenticated;

create or replace function is_admin(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select p_user is not null and exists (select 1 from admin_users where user_id = p_user);
$$;

-- Every Admin Dashboard function starts with this: an admin, signed in with a second factor.
create or replace function require_admin()
returns uuid language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin(auth.uid()) then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'admin needs two-factor sign-in' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

create table admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  action text not null,
  target_type text,
  target_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index on admin_audit_log (created_at desc);
alter table admin_audit_log enable row level security;
revoke all on admin_audit_log from anon, authenticated;

-- Signed-in callers must be admins; with no signed-in user (SQL run by the owner, edge
-- functions with the service role) the actor is recorded as all zeros.
create or replace function log_admin_action(p_action text, p_target_type text, p_target_id text, p_before jsonb, p_after jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_admin(auth.uid()) then
    raise exception 'admin only' using errcode = '42501';
  end if;
  insert into admin_audit_log (actor_id, action, target_type, target_id, before, after)
  values (coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'), p_action, p_target_type, p_target_id, p_before, p_after);
end;
$$;
revoke execute on function log_admin_action(text, text, text, jsonb, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Settings the Admin can change. Validated in admin_set_setting.
-- ---------------------------------------------------------------------------
create table app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table app_settings enable row level security;
revoke all on app_settings from anon, authenticated;
insert into app_settings (key, value) values
  ('trial_days', '30'),
  ('auto_trial', 'true'),
  ('announcement', 'null'),
  ('maintenance', 'null'),
  ('flags', '{}');

create or replace function setting(p_key text)
returns jsonb language sql stable security definer set search_path = public as $$
  select value from app_settings where key = p_key;
$$;

-- What the app may read: the banner texts only.
create or replace function public_app_settings()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('announcement', setting('announcement'), 'maintenance', setting('maintenance'), 'flags', setting('flags'));
$$;
grant execute on function public_app_settings() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Pro: app-managed grants and App Store subscriptions.
-- ---------------------------------------------------------------------------
create type grant_source as enum ('trial', 'comp');

create table entitlement_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  source grant_source not null,
  starts_at timestamptz not null default now(),
  -- Null means until revoked (complimentary grants only).
  ends_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid,
  created_by uuid,
  note text,
  created_at timestamptz not null default now(),
  check (source <> 'trial' or ends_at is not null),
  check (ends_at is null or ends_at > starts_at)
);
create unique index entitlement_grants_one_trial on entitlement_grants (user_id) where source = 'trial';
create index on entitlement_grants (user_id);
create index on entitlement_grants (ends_at) where source = 'trial';
alter table entitlement_grants enable row level security;
create policy entitlement_grants_own on entitlement_grants for select to authenticated using (user_id = auth.uid());
revoke all on entitlement_grants from anon, authenticated;
grant select on entitlement_grants to authenticated;

-- Written only by the App Store edge functions (service role) after Apple's signature checks.
create table app_store_subscriptions (
  original_transaction_id text primary key,
  user_id uuid references profiles (id) on delete set null,
  product_id text not null,
  status text not null check (status in ('active', 'grace', 'billing_retry', 'expired', 'revoked', 'refunded')),
  expires_at timestamptz,
  grace_until timestamptz,
  auto_renew boolean,
  offer_type int,
  offer_id text,
  price_milli bigint,
  currency text,
  environment text not null check (environment in ('Sandbox', 'Production', 'Xcode', 'LocalTesting')),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index on app_store_subscriptions (user_id);
alter table app_store_subscriptions enable row level security;
create policy app_store_subscriptions_own on app_store_subscriptions for select to authenticated using (user_id = auth.uid());
revoke all on app_store_subscriptions from anon, authenticated;
grant select on app_store_subscriptions to authenticated;

create table app_store_events (
  id bigint generated always as identity primary key,
  notification_uuid text unique,
  type text,
  subtype text,
  original_transaction_id text,
  payload jsonb,
  error text,
  received_at timestamptz not null default now()
);
create index on app_store_events (received_at desc);
alter table app_store_events enable row level security;
revoke all on app_store_events from anon, authenticated;

-- A paid subscription that gives Pro right now (Apple's grace period counts; billing retry only
-- while inside the grace period).
create or replace function has_paid_pro(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from app_store_subscriptions s
    where s.user_id = p_user
      and ((s.status = 'active' and (s.expires_at is null or s.expires_at > now()))
        or (s.status in ('grace', 'billing_retry') and s.grace_until > now()))
  );
$$;

create or replace function live_grant(p_user uuid, p_source grant_source)
returns entitlement_grants language sql stable security definer set search_path = public as $$
  select g.* from entitlement_grants g
  where g.user_id = p_user and g.source = p_source and g.revoked_at is null
    and g.starts_at <= now() and (g.ends_at is null or g.ends_at > now())
  order by g.ends_at desc nulls first
  limit 1;
$$;

create or replace function has_pro(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_user is not null and (
    is_admin(p_user)
    or has_paid_pro(p_user)
    or (live_grant(p_user, 'comp')).id is not null
    or (live_grant(p_user, 'trial')).id is not null
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. Which features are Pro. feature_plans already existed for this; 'pro' joins its plans.
--    Anything not listed (or listed as 'free') is never gated.
-- ---------------------------------------------------------------------------
alter table feature_plans drop constraint if exists feature_plans_min_plan_check;
alter table feature_plans add constraint feature_plans_min_plan_check
  check (min_plan in ('free', 'pro', 'rider_pro', 'organizer_pro', 'club_pro'));
insert into feature_plans (feature, min_plan, free_monthly_allowance) values
  ('create_ride', 'free', 1),
  ('import_gpx', 'pro', null),
  ('offline_maps', 'pro', null),
  ('saved_groups', 'pro', null),
  ('create_poll', 'pro', null),
  ('ride_history', 'free', 5),
  ('advanced_trip_planning', 'pro', null),
  ('advanced_stats', 'pro', null),
  ('premium_ride_cards', 'pro', null)
on conflict (feature) do update set min_plan = excluded.min_plan, free_monthly_allowance = excluded.free_monthly_allowance;
comment on table subscriptions is 'Unused since 20261018000000_pro_entitlements; see entitlement_grants and app_store_subscriptions.';

create or replace function has_feature(p_user uuid, p_feature text)
returns boolean language sql stable security definer set search_path = public as $$
  select case coalesce((select min_plan from feature_plans where feature = p_feature), 'free')
    when 'free' then true
    when 'pro' then has_pro(p_user)
    else false
  end;
$$;

create or replace function pro_required(p_user uuid, p_feature text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if p_user is not null and not has_feature(p_user, p_feature) then
    raise exception 'pro_required:%', p_feature using hint = 'OnMyLead Pro is needed for this.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. The automatic trial: every new account, once, if trials are on. Settings changes only
--    affect later signups because each trial stores its own end time.
-- ---------------------------------------------------------------------------
create or replace function handle_new_user_trial()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_days int := coalesce((setting('trial_days'))::text::int, 30);
begin
  if coalesce((setting('auto_trial'))::text::boolean, false) and v_days > 0
     and exists (select 1 from profiles where id = new.id) then
    insert into entitlement_grants (user_id, source, starts_at, ends_at, note)
    values (new.id, 'trial', now(), now() + make_interval(days => v_days), 'Automatic signup trial')
    on conflict do nothing;
  end if;
  return new;
end;
$$;
-- Named to fire after on_auth_user_created, which makes the profile.
create trigger on_auth_user_created_trial after insert on auth.users
  for each row execute function handle_new_user_trial();

-- ---------------------------------------------------------------------------
-- 6. Free ride allowance: one per UTC calendar month, counted when the ride is created.
-- ---------------------------------------------------------------------------
create table ride_creations (
  ride_id uuid primary key,          -- no foreign key: deleting the ride keeps the count
  user_id uuid not null,
  created_at timestamptz not null default now()
);
create index on ride_creations (user_id, created_at);
alter table ride_creations enable row level security;
revoke all on ride_creations from anon, authenticated;
-- Rides that already exist count toward their month.
insert into ride_creations (ride_id, user_id, created_at)
select id, organizer_id, created_at from rides on conflict do nothing;

create or replace function utc_month_start(p_at timestamptz default now())
returns timestamptz language sql immutable as $$
  select date_trunc('month', p_at at time zone 'UTC') at time zone 'UTC';
$$;

create or replace function rides_created_this_month(p_user uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from ride_creations where user_id = p_user and created_at >= utc_month_start();
$$;

create or replace function ride_allowance(p_user uuid)
returns int language sql stable security definer set search_path = public as $$
  select case when has_pro(p_user) then null
    else coalesce((select free_monthly_allowance from feature_plans where feature = 'create_ride'), 1) end;
$$;

create or replace function ride_limit_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_allowance int;
  v_used int;
begin
  -- One creation at a time per rider, so two taps can't both squeeze under the limit.
  perform pg_advisory_xact_lock(hashtextextended('ride_limit:' || new.organizer_id::text, 0));
  v_allowance := ride_allowance(new.organizer_id);
  if v_allowance is not null then
    v_used := rides_created_this_month(new.organizer_id);
    if v_used >= v_allowance then
      raise exception 'ride_limit:%/%', v_used, v_allowance
        using hint = 'Free accounts create one ride a month. Joining rides is unlimited.';
    end if;
  end if;
  return new;
end;
$$;
create trigger rides_limit_guard before insert on rides
  for each row execute function ride_limit_guard();

create or replace function ride_count_creation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into ride_creations (ride_id, user_id, created_at) values (new.id, new.organizer_id, now())
  on conflict do nothing;
  return new;
end;
$$;
create trigger rides_count_creation after insert on rides
  for each row execute function ride_count_creation();

-- ---------------------------------------------------------------------------
-- 7. Pro-only actions checked on the server.
-- ---------------------------------------------------------------------------
-- Polls: only Pro organizers ask; everyone votes.
create or replace function ride_poll_pro_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.poll_options is not null then perform pro_required(new.user_id, 'create_poll'); end if;
  return new;
end;
$$;
create trigger ride_messages_poll_pro before insert on ride_messages
  for each row execute function ride_poll_pro_guard();

-- Saved groups: making one, and the owner adding riders. Joining through a group link is free.
create or replace function riding_group_pro_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform pro_required(new.owner_id, 'saved_groups');
  return new;
end;
$$;
create trigger riding_groups_pro before insert on riding_groups
  for each row execute function riding_group_pro_guard();

create or replace function riding_group_member_pro_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.added_by is distinct from new.user_id then perform pro_required(new.added_by, 'saved_groups'); end if;
  return new;
end;
$$;
create trigger riding_group_members_pro before insert on riding_group_members
  for each row execute function riding_group_member_pro_guard();

-- GPX: saving a newly imported route. A route that was already imported stays editable.
create or replace function ride_route_pro_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.route_geojson -> 'properties' ->> 'source' = 'gpx'
     and (tg_op = 'INSERT' or coalesce(old.route_geojson -> 'properties' ->> 'source', '') <> 'gpx') then
    perform pro_required(auth.uid(), 'import_gpx');
  end if;
  return new;
end;
$$;
create trigger ride_private_details_route_pro before insert or update of route_geojson on ride_private_details
  for each row execute function ride_route_pro_guard();

-- ---------------------------------------------------------------------------
-- 8. What the app shows: one call, everything about the rider's plan.
-- ---------------------------------------------------------------------------
create or replace function my_entitlements()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_admin boolean;
  v_trial entitlement_grants;
  v_comp entitlement_grants;
  v_paid app_store_subscriptions;
  v_last_trial entitlement_grants;
  v_source text;
  v_until timestamptz;
  v_pro boolean;
begin
  if v_me is null then return null; end if;
  v_admin := is_admin(v_me);
  v_trial := live_grant(v_me, 'trial');
  v_comp := live_grant(v_me, 'comp');
  select * into v_paid from app_store_subscriptions s
  where s.user_id = v_me
    and ((s.status = 'active' and (s.expires_at is null or s.expires_at > now()))
      or (s.status in ('grace', 'billing_retry') and s.grace_until > now()))
  order by s.expires_at desc nulls first limit 1;
  select * into v_last_trial from entitlement_grants where user_id = v_me and source = 'trial';

  v_source := case
    when v_admin then 'admin'
    when v_paid.original_transaction_id is not null then 'apple'
    when v_comp.id is not null then 'comp'
    when v_trial.id is not null then 'trial'
  end;
  v_until := case v_source
    when 'apple' then coalesce(v_paid.grace_until, v_paid.expires_at)
    when 'comp' then v_comp.ends_at
    when 'trial' then v_trial.ends_at
  end;
  v_pro := v_source is not null;

  return jsonb_build_object(
    'account_type', case when v_admin then 'admin' when v_pro then 'pro' else 'free' end,
    'pro_source', v_source,
    'pro_until', v_until,
    'trial_ends_at', v_trial.ends_at,
    'trial_used', v_last_trial.id is not null,
    'apple', case when v_paid.original_transaction_id is null then null else jsonb_build_object(
      'product_id', v_paid.product_id, 'status', v_paid.status, 'expires_at', v_paid.expires_at,
      'auto_renew', v_paid.auto_renew, 'environment', v_paid.environment) end,
    'rides_created_this_month', rides_created_this_month(v_me),
    'ride_allowance', ride_allowance(v_me),
    'history_limit', case when v_pro then null
      else (select free_monthly_allowance from feature_plans where feature = 'ride_history') end,
    'features', (select coalesce(jsonb_object_agg(feature, has_feature(v_me, feature)), '{}')
                 from feature_plans where min_plan in ('free', 'pro')),
    'server_time', now()
  );
end;
$$;
revoke execute on function my_entitlements() from public, anon;
grant execute on function my_entitlements() to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Admin actions on Pro and settings. Each one is logged.
-- ---------------------------------------------------------------------------
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
    else
      raise exception 'unknown setting %', p_key;
  end case;
  select value into v_before from app_settings where key = p_key;
  update app_settings set value = p_value, updated_at = now(), updated_by = auth.uid() where key = p_key;
  perform log_admin_action('setting.update', 'setting', p_key, v_before, p_value);
end;
$$;

-- Complimentary Pro, separate from anything Apple bills.
create or replace function admin_grant_comp(p_user uuid, p_ends_at timestamptz, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  perform require_admin();
  if not exists (select 1 from profiles where id = p_user) then raise exception 'rider not found'; end if;
  if p_ends_at is not null and p_ends_at <= now() then raise exception 'the end date must be in the future'; end if;
  insert into entitlement_grants (user_id, source, ends_at, created_by, note)
  values (p_user, 'comp', p_ends_at, auth.uid(), p_note)
  returning id into v_id;
  perform log_admin_action('pro.comp_grant', 'user', p_user::text, null,
    jsonb_build_object('grant_id', v_id, 'ends_at', p_ends_at, 'note', p_note));
  return v_id;
end;
$$;

create or replace function admin_revoke_grant(p_grant uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  g entitlement_grants;
begin
  perform require_admin();
  select * into g from entitlement_grants where id = p_grant for update;
  if not found then raise exception 'grant not found'; end if;
  if g.revoked_at is not null then return; end if;
  update entitlement_grants set revoked_at = now(), revoked_by = auth.uid() where id = p_grant;
  perform log_admin_action('pro.grant_revoke', 'user', g.user_id::text, to_jsonb(g), jsonb_build_object('revoked_at', now()));
end;
$$;

-- Adds days to a rider's trial (or restarts an ended one from today). Reminders start over.
create or replace function admin_extend_trial(p_user uuid, p_days int)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  g entitlement_grants;
  v_end timestamptz;
begin
  perform require_admin();
  if p_days is null or p_days not between 1 and 365 then raise exception 'days must be from 1 to 365'; end if;
  select * into g from entitlement_grants where user_id = p_user and source = 'trial' for update;
  if not found then
    if not exists (select 1 from profiles where id = p_user) then raise exception 'rider not found'; end if;
    insert into entitlement_grants (user_id, source, ends_at, created_by, note)
    values (p_user, 'trial', now() + make_interval(days => p_days), auth.uid(), 'Trial granted by Admin')
    returning * into g;
    v_end := g.ends_at;
  else
    v_end := greatest(g.ends_at, now()) + make_interval(days => p_days);
    update entitlement_grants set ends_at = v_end, revoked_at = null, revoked_by = null where id = g.id;
    delete from trial_notices where grant_id = g.id;
  end if;
  perform log_admin_action('trial.extend', 'user', p_user::text,
    jsonb_build_object('ends_at', g.ends_at), jsonb_build_object('ends_at', v_end, 'days', p_days));
  return v_end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Trial reminders: 7, 3 and 1 day before the end, and at the end. Run hourly by pg_cron.
--     Each stage goes once per trial; a late start sends only the nearest stage. Riders with
--     paid Pro, complimentary Pro or Admin hear nothing.
-- ---------------------------------------------------------------------------
create table trial_notices (
  grant_id uuid not null references entitlement_grants (id) on delete cascade,
  stage text not null check (stage in ('7d', '3d', '1d', 'ended')),
  sent_at timestamptz not null default now(),
  primary key (grant_id, stage)
);
alter table trial_notices enable row level security;
revoke all on trial_notices from anon, authenticated;

alter table notification_settings
  add column if not exists account_push boolean not null default true,
  add column if not exists account_emails boolean not null default true;

create or replace function trial_stage(p_ends_at timestamptz, p_now timestamptz default now())
returns text language sql immutable as $$
  select case
    when p_ends_at <= p_now and p_ends_at > p_now - interval '3 days' then 'ended'
    when p_ends_at <= p_now then null
    when p_ends_at - p_now <= interval '1 day' then '1d'
    when p_ends_at - p_now <= interval '3 days' then '3d'
    when p_ends_at - p_now <= interval '7 days' then '7d'
  end;
$$;

create or replace function trial_reminder_batch()
returns int language plpgsql security invoker set search_path = public as $$
declare
  r record;
  v_sent int := 0;
  v_order text[] := array['7d', '3d', '1d', 'ended'];
begin
  if current_user not in ('postgres', 'service_role') then raise exception 'not allowed'; end if;
  for r in
    select g.id, g.user_id, g.ends_at, trial_stage(g.ends_at) as stage
    from entitlement_grants g
    where g.source = 'trial' and g.revoked_at is null
      and g.ends_at > now() - interval '3 days' and g.ends_at <= now() + interval '7 days'
      and trial_stage(g.ends_at) is not null
      and not exists (select 1 from trial_notices n where n.grant_id = g.id and n.stage = trial_stage(g.ends_at))
  loop
    -- This stage and every earlier one count as done, so nothing is sent twice or out of order.
    insert into trial_notices (grant_id, stage)
    select r.id, s from unnest(v_order[1:array_position(v_order, r.stage)]) s
    on conflict do nothing;
    if is_admin(r.user_id) or has_paid_pro(r.user_id) or (live_grant(r.user_id, 'comp')).id is not null then
      continue;
    end if;
    perform queue_push(jsonb_build_object('type', 'trial', 'user', r.user_id, 'stage', r.stage, 'ends_at', r.ends_at));
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end;
$$;
revoke execute on function trial_reminder_batch() from public, anon, authenticated;

create or replace function trial_notice_text(p_stage text)
returns table (title text, body text) language sql immutable as $$
  select
    case p_stage when 'ended' then 'Your Pro Trial Has Ended' else 'Your Pro Trial Ends Soon' end,
    case p_stage
      when '7d' then 'Your OnMyLead Pro trial ends in 7 days. You won''t be charged; your account moves to Free unless you choose Pro.'
      when '3d' then 'Your OnMyLead Pro trial ends in 3 days. You won''t be charged; your account moves to Free unless you choose Pro.'
      when '1d' then 'Your OnMyLead Pro trial ends tomorrow. You won''t be charged; your account moves to Free unless you choose Pro.'
      else 'Your account is now Free. Your rides, routes, groups and maps are all still here. Upgrade any time for Pro features.'
    end;
$$;

-- Push rows for an account event, for the edge function (service role only).
--   {"type":"trial","user":<uuid>,"stage":"7d|3d|1d|ended","ends_at":<timestamp>}
create or replace function push_batch_account(p_event jsonb)
returns table (user_id uuid, token text, platform text, title text, body text, thread_id text, data jsonb)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_user uuid := (p_event ->> 'user')::uuid;
  v_stage text := p_event ->> 'stage';
  s notification_settings;
  v_now timestamp;
begin
  if current_user not in ('service_role', 'postgres') then raise exception 'not allowed'; end if;
  if p_event ->> 'type' <> 'trial' or v_stage is null then return; end if;
  select * into s from notification_settings ns where ns.user_id = v_user;
  if found then
    if not s.account_push then return; end if;
    if s.quiet_hours then
      v_now := now() at time zone coalesce(s.time_zone, 'UTC');
      if in_quiet_window(s.quiet_start, s.quiet_end, (extract(hour from v_now) * 60 + extract(minute from v_now))::int) then
        return;
      end if;
    end if;
  end if;
  return query
  select t.user_id, t.token, t.platform, x.title, x.body, 'account'::text,
         jsonb_build_object('type', 'trial', 'stage', v_stage, 'url', '/pro')
  from push_tokens t, trial_notice_text(v_stage) x
  where t.user_id = v_user;
end;
$$;

create or replace function email_batch_account(p_event jsonb)
returns table (user_id uuid, email text, rider_name text, subject text, body text, ends_at timestamptz)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_user uuid := (p_event ->> 'user')::uuid;
begin
  if current_user not in ('service_role', 'postgres') then raise exception 'not allowed'; end if;
  if p_event ->> 'type' <> 'trial' or p_event ->> 'stage' is null then return; end if;
  return query
  select u.id, u.email, nullif(btrim(p.display_name), ''), x.title, x.body, (p_event ->> 'ends_at')::timestamptz
  from user_emails(array[v_user]) u
  left join profiles p on p.id = u.id
  left join notification_settings s on s.user_id = u.id
  cross join trial_notice_text(p_event ->> 'stage') x
  where coalesce(s.account_emails, true);
end;
$$;
revoke execute on function push_batch_account(jsonb), email_batch_account(jsonb) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function push_batch_account(jsonb), email_batch_account(jsonb) to service_role;
  end if;
end $$;

-- Hourly, when pg_cron is switched on in Supabase (Database > Extensions). Without it, nothing
-- is scheduled and trials still end on time; only the reminders wait.
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('onmylead-trial-reminders', '7 * * * *', 'select public.trial_reminder_batch()');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 11. Account deletion requests (Apple requires an in-app way to delete an account), and a
--     last-active stamp for daily and monthly active riders. Neither stores any location.
-- ---------------------------------------------------------------------------
create table account_deletion_requests (
  user_id uuid primary key references profiles (id) on delete cascade,
  requested_at timestamptz not null default now(),
  reason text check (reason is null or length(reason) <= 1000),
  handled_at timestamptz,
  handled_by uuid
);
alter table account_deletion_requests enable row level security;
create policy account_deletion_requests_own on account_deletion_requests for select to authenticated using (user_id = auth.uid());
revoke all on account_deletion_requests from anon, authenticated;
grant select on account_deletion_requests to authenticated;

create or replace function request_account_deletion(p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  insert into account_deletion_requests (user_id, reason)
  values (auth.uid(), nullif(btrim(p_reason), ''))
  on conflict (user_id) do update set requested_at = now(), reason = excluded.reason, handled_at = null, handled_by = null;
end;
$$;
revoke execute on function request_account_deletion(text) from public, anon;
grant execute on function request_account_deletion(text) to authenticated;

alter table profiles add column if not exists last_active_at timestamptz;
create index if not exists profiles_last_active_at on profiles (last_active_at);

-- Called when the app opens or comes back; writes at most once an hour.
create or replace function touch_activity()
returns void language sql security definer set search_path = public as $$
  update profiles set last_active_at = now()
  where id = auth.uid() and (last_active_at is null or last_active_at < now() - interval '1 hour');
$$;
revoke execute on function touch_activity() from public, anon;
grant execute on function touch_activity() to authenticated;

-- Internal helpers stay internal.
revoke execute on function has_paid_pro(uuid), live_grant(uuid, grant_source), setting(text),
  rides_created_this_month(uuid), ride_allowance(uuid), pro_required(uuid, text) from public, anon, authenticated;
revoke execute on function admin_set_setting(text, jsonb), admin_grant_comp(uuid, timestamptz, text),
  admin_revoke_grant(uuid), admin_extend_trial(uuid, int) from public, anon;
grant execute on function admin_set_setting(text, jsonb), admin_grant_comp(uuid, timestamptz, text),
  admin_revoke_grant(uuid), admin_extend_trial(uuid, int) to authenticated;
