-- 2.0 Free and Pro tiers (Chris, 2026-11-03).
--
-- What changes:
--   * New Pro features in feature_plans, so my_entitlements() reports them and Admin > Settings can
--     move each one between Free and Pro: custom share codes, your own Ride Mode messages and quick
--     replies, music controls, voting on polls, drawing ride routes, adding waypoints, directions,
--     map layers, Map a Custom Trail, saving, rating, Track Line, named spots, the garage build
--     sheet, sync, themes, natural voices, and using OnMyLead on a tablet or the website.
--   * Map Mode is free for a number of hours each UTC month (map_mode, allowance in hours, 8 by
--     default; Pro is unlimited). The app reports time in Map Mode while it's on screen and the
--     rider isn't on a group ride; the total lives here so reinstalling doesn't reset it.
--
-- Never gated: joining rides, Ride Mode, following the leader, live tracking, Need Help,
-- EMERGENCY, Mechanical Issue, Crash Alert, ride chat, reports and blocks. None of them is in
-- feature_plans.
--
-- Backward compatible: rows, one table and new functions. The new features are checked by the
-- 2.0 app (older builds never ask for them and keep working as before). admin_set_feature_plan is
-- replaced with the same signature and a longer list.

insert into feature_plans (feature, min_plan, free_monthly_allowance) values
  ('custom_codes', 'pro', null),
  ('quick_replies', 'pro', null),
  ('music_controls', 'pro', null),
  ('vote_polls', 'pro', null),
  ('route_builder', 'pro', null),
  ('waypoints', 'pro', null),
  ('directions', 'pro', null),
  ('map_layers', 'pro', null),
  ('map_mode', 'free', 8),
  ('custom_trails', 'pro', null),
  ('save_trails', 'pro', null),
  ('rate_trails', 'pro', null),
  ('track_line', 'pro', null),
  ('trail_spots', 'pro', null),
  ('garage_build', 'pro', null),
  ('sync', 'pro', null),
  ('themes', 'pro', null),
  ('natural_voices', 'pro', null),
  ('tablet_web', 'pro', null)
on conflict (feature) do nothing;

-- ---------------------------------------------------------------------------
-- Map Mode time
-- ---------------------------------------------------------------------------
create table if not exists map_mode_usage (
  user_id uuid not null references profiles (id) on delete cascade,
  month date not null,
  seconds int not null default 0 check (seconds >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);
alter table map_mode_usage enable row level security;
-- No policies and no grants: riders reach it only through the functions below.
revoke all on map_mode_usage from public, anon, authenticated;

-- Free hours this month for this rider, in seconds; null = unlimited (Pro, or no allowance set).
create or replace function map_mode_allowance_seconds(p_user uuid)
returns int language sql stable security definer set search_path = public as $$
  select case
    when has_pro(p_user) then null
    when (select min_plan from feature_plans where feature = 'map_mode') = 'pro' then 0
    else (select free_monthly_allowance * 3600 from feature_plans where feature = 'map_mode')
  end;
$$;

create or replace function map_mode_answer(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'used_seconds', coalesce((select seconds from map_mode_usage
                              where user_id = p_user and month = date_trunc('month', now() at time zone 'utc')::date), 0),
    'allowance_seconds', map_mode_allowance_seconds(p_user),
    'resets_at', (date_trunc('month', now() at time zone 'utc') + interval '1 month') at time zone 'utc');
$$;

-- How much Map Mode time this rider has used this month, and the allowance.
create or replace function my_map_mode_time()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not signed in'; end if;
  return map_mode_answer(v_me);
end;
$$;

-- Adds time spent in Map Mode. A call adds at most the time since the last call plus a little
-- slack (and never more than 2 minutes), so a burst of calls can't add more than real time.
create or replace function log_map_mode_time(p_seconds int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_month date := date_trunc('month', now() at time zone 'utc')::date;
  v_last timestamptz;
  v_add int;
begin
  if v_me is null then raise exception 'not signed in'; end if;
  v_add := least(greatest(coalesce(p_seconds, 0), 0), 120);
  select updated_at into v_last from map_mode_usage where user_id = v_me and month = v_month for update;
  if v_last is not null then
    v_add := least(v_add, greatest(0, ceil(extract(epoch from now() - v_last))::int + 5));
  end if;
  if v_add > 0 then
    insert into map_mode_usage (user_id, month, seconds, updated_at) values (v_me, v_month, v_add, now())
    on conflict (user_id, month) do update set seconds = map_mode_usage.seconds + excluded.seconds, updated_at = now();
  end if;
  return map_mode_answer(v_me);
end;
$$;

revoke execute on function map_mode_allowance_seconds(uuid), map_mode_answer(uuid), my_map_mode_time(), log_map_mode_time(int)
  from public, anon;
grant execute on function my_map_mode_time(), log_map_mode_time(int) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin > Settings can move every Pro feature, the new ones included. Same signature.
-- ---------------------------------------------------------------------------
create or replace function admin_set_feature_plan(p_feature text, p_min_plan text, p_allowance int default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb;
begin
  perform require_admin();
  if p_feature not in ('create_ride', 'import_gpx', 'offline_maps', 'saved_groups', 'create_poll', 'ride_history',
                       'advanced_trip_planning', 'advanced_stats', 'premium_ride_cards',
                       'record_trails', 'share_trails', 'trail_rides', 'social_posts', 'create_events',
                       'custom_codes', 'quick_replies', 'music_controls', 'vote_polls', 'route_builder', 'waypoints',
                       'directions', 'map_layers', 'map_mode', 'custom_trails', 'save_trails', 'rate_trails',
                       'track_line', 'trail_spots', 'garage_build', 'sync', 'themes', 'natural_voices', 'tablet_web') then
    raise exception 'this feature cannot be configured here';
  end if;
  if p_min_plan not in ('free', 'pro') then raise exception 'plan must be free or pro'; end if;
  if p_allowance is not null and (p_allowance < 0 or p_allowance > 1000) then raise exception 'allowance must be 0 to 1000'; end if;
  if p_feature = 'create_ride' and p_min_plan = 'pro' and p_allowance is null then
    raise exception 'ride creation needs a Free allowance';
  end if;
  select to_jsonb(f) into v_before from feature_plans f where feature = p_feature for update;
  if v_before is null then raise exception 'unknown feature'; end if;
  update feature_plans set min_plan = p_min_plan, free_monthly_allowance = p_allowance where feature = p_feature;
  perform log_admin_action('feature_plan.set', 'feature', p_feature, v_before,
          jsonb_build_object('feature', p_feature, 'min_plan', p_min_plan, 'free_monthly_allowance', p_allowance));
end;
$$;
