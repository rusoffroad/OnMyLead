-- Bluetooth Sharing, Your Dot, group photos and CarPlay become Pro, plus the launch trial (Chris, 2026-11-05, for 2.1).
--
--   * bluetooth_sharing: Ride Mode passing spots, taps and messages to nearby riders over
--     Bluetooth when there is no service. Free riders see the Pro prompt instead.
--   * custom_dot: picking a Dot Style or Dot Size other than the default (Red, White and Blue,
--     Medium). Free riders keep the default dot; a saved pick comes back when they go Pro.
--   * group_photos: adding or changing a riding group's photo. Everyone still sees group photos.
--   * carplay: the ride on the car screen. Free riders' cars show a plain notice instead (nothing
--     to buy in the car); Ride Mode, status taps and EMERGENCY stay free on the phone.
--   * start_pro_launch_trials(days): a fresh Pro trial (30 days by default) for every rider who
--     doesn't have Pro, so nobody loses a feature the day Pro starts counting (Chris, 2026-11-05:
--     "They should get a free 30 day trial of pro before it downgrades them"). Riders on a trial,
--     or whose trial already ended, get the fresh days too. It is NOT run by this migration: it
--     runs once, from the Mac, in the server block that turns Pro on, after Chris's typed OK.
--
-- Both are checked in the app (my_entitlements reports them). Backward compatible: four rows, one new function, and
-- admin_set_feature_plan replaced with the same signature and a longer list. Builds before 2.1
-- never ask for these features and keep working as before. Admin > Settings can move either
-- one back to Free.

insert into feature_plans (feature, min_plan, free_monthly_allowance) values
  ('bluetooth_sharing', 'pro', null),
  ('custom_dot', 'pro', null),
  ('group_photos', 'pro', null),
  ('carplay', 'pro', null)
on conflict (feature) do nothing;

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
                       'bluetooth_sharing', 'custom_dot', 'group_photos', 'carplay') then
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

-- ---------------------------------------------------------------------------
-- The launch trial. Owner-only (postgres or service_role; no rider or Admin Dashboard call).
-- Runs once: it records when it ran in app_settings 'launch_trial', and a second call returns 0.
--   * Skips Admins, paid subscribers and complimentary Pro (they have Pro already).
--   * A rider with no trial gets one; a rider whose trial is running or has ended gets it moved to
--     end `p_days` from now (never earlier than it already ends). A trial an Admin revoked stays revoked.
--   * Reminder notices for a moved trial are cleared, so the 7, 3 and 1 day reminders come again.
-- Returns how many riders got the fresh days.
-- ---------------------------------------------------------------------------
create or replace function start_pro_launch_trials(p_days int default 30)
returns int language plpgsql security invoker set search_path = public as $$
declare
  v_ends timestamptz := now() + make_interval(days => p_days);
  v_moved int := 0;
  v_new int := 0;
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then raise exception 'not allowed'; end if;
  if p_days is null or p_days < 1 or p_days > 90 then raise exception 'days must be 1 to 90'; end if;
  if setting('launch_trial') is not null and setting('launch_trial') <> 'null'::jsonb then return 0; end if;

  create temp table launch_riders on commit drop as
    select p.id from profiles p
    where not is_admin(p.id) and not has_paid_pro(p.id)
      and not exists (select 1 from store_subscriptions s where s.user_id = p.id
                      and subscription_gives_pro(s.status, s.expires_at, s.grace_until))
      and (live_grant(p.id, 'comp')).id is null;

  delete from trial_notices n using entitlement_grants g, launch_riders r
  where n.grant_id = g.id and g.user_id = r.id and g.source = 'trial' and g.revoked_at is null and g.ends_at < v_ends;

  update entitlement_grants g set ends_at = v_ends, starts_at = least(g.starts_at, now()),
         note = concat_ws(' · ', g.note, 'Pro launch trial')
  from launch_riders r
  where g.user_id = r.id and g.source = 'trial' and g.revoked_at is null and g.ends_at < v_ends;
  get diagnostics v_moved = row_count;

  insert into entitlement_grants (user_id, source, starts_at, ends_at, note)
  select r.id, 'trial', now(), v_ends, 'Pro launch trial' from launch_riders r
  where not exists (select 1 from entitlement_grants g where g.user_id = r.id and g.source = 'trial')
  on conflict do nothing;
  get diagnostics v_new = row_count;

  insert into app_settings (key, value)
  values ('launch_trial', jsonb_build_object('at', now(), 'days', p_days, 'ends_at', v_ends, 'riders', v_moved + v_new))
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return v_moved + v_new;
end;
$$;
revoke execute on function start_pro_launch_trials(int) from public, anon, authenticated;
