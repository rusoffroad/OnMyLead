-- 4.0 Free and Pro plan (Chris, 2026-11-19): "if you are not a Pro Rider, all you can really do is
-- join a ride created by someone else and follow along and send communications ... we can give them
-- some free map mode every month". Plan doc OK'd 2026-11-19 16:37Z.
--
-- Everything here waits for one switch: the `pro_plan_4` flag on Admin > Features (app_settings
-- 'flags'). Until the owner turns it on, nothing changes for anyone, so the 3.3 riders in the
-- stores keep today's plan while 4.0 is being tested. Turning it on:
--   * Creating a ride needs Pro. Accounts made before the switch first went on keep their Free
--     allowance (1 a UTC month) through Feb 1, 2027 (ends 2027-02-02 08:00 UTC, midnight
--     Pacific); accounts made after get 0. Rides already
--     created keep working (the rule only checks new inserts).
--   * Seven new Pro features (rows here, read by app 4.0+ through my_entitlements): places,
--     terrain_3d, garage (one machine stays free), trip_planner, starlink, event_cohost,
--     leaderboard_filters. They are inserted as Free, so nothing is gated until the switch.
--   * Voting on ride polls becomes Free (it is a way of talking to the group).
--   * Free Map Mode drops from 8 to 5 hours a UTC month (only when it is still above 5, so a
--     number the owner picked in Admin > Settings below that is kept).
-- Turning the switch off puts each of those back. The time it first went on is kept in
-- app_settings 'pro_plan_4_start' and never moves, so the grace list stays the same.
--
-- Never gated, on any plan: joining rides, Ride Mode, following the leader, live tracking, ride
-- chat, Need Help, EMERGENCY, Crash Alerts, the siren, reports and blocks.
--
-- Backward compatible: new rows, one new settings row, new functions, and ride_allowance /
-- admin_set_feature_plan replaced with the same signatures. Older app builds already show the Pro
-- prompt when the ride limit refuses an insert.

insert into feature_plans (feature, min_plan, free_monthly_allowance) values
  ('places', 'free', null),
  ('terrain_3d', 'free', null),
  ('garage', 'free', null),
  ('trip_planner', 'free', null),
  ('starlink', 'free', null),
  ('event_cohost', 'free', null),
  ('leaderboard_filters', 'free', null)
on conflict (feature) do nothing;

-- Is the 4.0 plan switched on?
create or replace function pro_plan_4_on()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (value ->> 'pro_plan_4')::boolean from app_settings where key = 'flags'), false);
$$;

-- When the 4.0 plan first went on, and when the Free ride allowance ends for accounts made before it.
create or replace function pro_plan_4_start()
returns timestamptz language sql stable security definer set search_path = public as $$
  select (value ->> 'started_at')::timestamptz from app_settings where key = 'pro_plan_4_start';
$$;

create or replace function pro_plan_4_grace_until()
returns timestamptz language sql stable security definer set search_path = public as $$
  select coalesce((select (value ->> 'grace_until')::timestamptz from app_settings where key = 'pro_plan_4_start'),
                  '2027-02-02T08:00:00Z'::timestamptz);
$$;

-- Rides a rider may create this UTC month; null is unlimited.
create or replace function ride_allowance(p_user uuid)
returns int language sql stable security definer set search_path = public as $$
  select case
    when has_pro(p_user) then null
    when pro_plan_4_on() then
      case when now() < pro_plan_4_grace_until()
             and (select created_at from profiles where id = p_user) < coalesce(pro_plan_4_start(), now())
           then coalesce((select free_monthly_allowance from feature_plans where feature = 'create_ride'), 1)
           else 0 end
    else coalesce((select free_monthly_allowance from feature_plans where feature = 'create_ride'), 1)
  end;
$$;

-- The rider's own answer about the change, for the Home notice in app 4.0:
-- {on, grace_until (or null when this account has no grace), started_at}.
create or replace function my_pro_plan_4()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_grace boolean;
begin
  if v_me is null then raise exception 'not signed in'; end if;
  v_grace := pro_plan_4_on() and now() < pro_plan_4_grace_until()
             and (select created_at from profiles where id = v_me) < coalesce(pro_plan_4_start(), now());
  return jsonb_build_object(
    'on', pro_plan_4_on(),
    'started_at', pro_plan_4_start(),
    'grace_until', case when v_grace then pro_plan_4_grace_until() end);
end;
$$;
revoke execute on function my_pro_plan_4() from public, anon;
grant execute on function my_pro_plan_4() to authenticated;
revoke execute on function pro_plan_4_on(), pro_plan_4_start(), pro_plan_4_grace_until() from public, anon, authenticated;

-- Flipping the switch moves the feature plans with it.
create or replace function pro_plan_4_apply()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_on boolean;
  v_was boolean;
begin
  if new.key <> 'flags' then return new; end if;
  v_on := coalesce((new.value ->> 'pro_plan_4')::boolean, false);
  v_was := case when tg_op = 'UPDATE' then coalesce((old.value ->> 'pro_plan_4')::boolean, false) else false end;
  if v_on = v_was then return new; end if;
  if v_on then
    insert into app_settings (key, value)
    values ('pro_plan_4_start', jsonb_build_object('started_at', now(), 'grace_until', '2027-02-02T08:00:00Z'))
    on conflict (key) do nothing;
    update feature_plans set min_plan = 'pro'
      where feature in ('places', 'terrain_3d', 'garage', 'trip_planner', 'starlink', 'event_cohost', 'leaderboard_filters');
    update feature_plans set min_plan = 'free' where feature = 'vote_polls';
    update feature_plans set free_monthly_allowance = 5 where feature = 'map_mode' and coalesce(free_monthly_allowance, 0) > 5;
  else
    update feature_plans set min_plan = 'free'
      where feature in ('places', 'terrain_3d', 'garage', 'trip_planner', 'starlink', 'event_cohost', 'leaderboard_filters');
    update feature_plans set min_plan = 'pro' where feature = 'vote_polls';
    update feature_plans set free_monthly_allowance = 8 where feature = 'map_mode' and free_monthly_allowance = 5;
  end if;
  return new;
end;
$$;
drop trigger if exists app_settings_pro_plan_4 on app_settings;
create trigger app_settings_pro_plan_4 after insert or update on app_settings
  for each row execute function pro_plan_4_apply();

-- Admin > Settings can move the new features too.
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
                       'track_line', 'trail_spots', 'garage_build', 'sync', 'themes', 'natural_voices', 'tablet_web',
                       'bluetooth_sharing', 'custom_dot', 'group_photos', 'carplay',
                       'places', 'terrain_3d', 'garage', 'trip_planner', 'starlink', 'event_cohost', 'leaderboard_filters') then
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
