-- 2.1 release test pass fixes (thread "Test 2.1 thoroughly before release").
-- 1. edit_ride: a ride whose ride_private_details row never got written (the app inserts it in a
--    second request after the ride) can now be given a meeting spot; before, the update touched
--    no row and riders were told the spot moved anyway.
-- 2. park_trail_parks: trail miles count trails only, matching the trail count beside them.
-- 3. reports_social_fill: the visibility checks use the signed-in rider, not a reporter_id the
--    client may have set to someone else, so the error text can't probe who can see what.

create or replace function edit_ride(p_ride uuid, p_fields jsonb default '{}'::jsonb, p_private jsonb default null)
returns rides language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_old rides;
  v_new rides;
  v_old_spot ride_private_details;
  f jsonb := coalesce(p_fields, '{}'::jsonb);
  p jsonb := coalesce(p_private, '{}'::jsonb);
  v_changed text[] := '{}';
  v_spot_moved boolean := false;
begin
  if v_uid is null then raise exception 'Sign in to edit the ride.' using errcode = '42501'; end if;
  select * into v_old from rides where id = p_ride for update;
  if not found then raise exception 'That ride is gone.' using errcode = 'P0002'; end if;
  if not is_ride_manager(p_ride, v_uid) then
    raise exception 'Only the ride''s leaders can edit it.' using errcode = '42501';
  end if;
  if v_old.status not in ('scheduled', 'live') then
    raise exception 'This ride has %, so it can''t be edited.', v_old.status using errcode = '22023';
  end if;
  if v_old.status = 'live' and (
    f ?| array['meet_at', 'depart_at', 'meet_area_lat', 'meet_area_lng', 'meet_area_label', 'meet_state']
    or p ?| array['meet_lat', 'meet_lng', 'meet_label']
  ) then
    raise exception 'The ride is live, so its time and meeting point stay as they are.' using errcode = '22023';
  end if;
  if f ? 'name' and length(btrim(coalesce(f ->> 'name', ''))) not between 1 and 120 then
    raise exception 'Give the ride a name (up to 120 characters).' using errcode = '22023';
  end if;
  -- A private ride's code is the invitation, so it stays open to anyone holding it.
  if f ? 'join_policy' and v_old.visibility = 'private' and f ->> 'join_policy' <> 'open' then
    raise exception 'A private ride stays open to anyone with its code.' using errcode = '22023';
  end if;
  if (p ? 'meet_lat' and abs((p ->> 'meet_lat')::double precision) > 90)
     or (p ? 'meet_lng' and abs((p ->> 'meet_lng')::double precision) > 180) then
    raise exception 'That meeting point isn''t on the map.' using errcode = '22023';
  end if;

  if p_private is not null and p <> '{}'::jsonb then
    select * into v_old_spot from ride_private_details where ride_id = p_ride;
    if not found then
      if p ? 'meet_lat' and p ? 'meet_lng' then
        insert into ride_private_details (ride_id, meet_lat, meet_lng)
        values (p_ride, (p ->> 'meet_lat')::double precision, (p ->> 'meet_lng')::double precision);
      else
        raise exception 'Pick the meeting point on the map first.' using errcode = '22023';
      end if;
    end if;
    update ride_private_details set
      meet_lat = case when p ? 'meet_lat' then (p ->> 'meet_lat')::double precision else meet_lat end,
      meet_lng = case when p ? 'meet_lng' then (p ->> 'meet_lng')::double precision else meet_lng end,
      meet_label = case when p ? 'meet_label' then nullif(btrim(p ->> 'meet_label'), '') else meet_label end,
      instructions = case when p ? 'instructions' then nullif(btrim(p ->> 'instructions'), '') else instructions end
    where ride_id = p_ride;
    v_spot_moved := (p ? 'meet_lat' and (p ->> 'meet_lat')::double precision is distinct from v_old_spot.meet_lat)
                 or (p ? 'meet_lng' and (p ->> 'meet_lng')::double precision is distinct from v_old_spot.meet_lng)
                 or (p ? 'meet_label' and nullif(btrim(p ->> 'meet_label'), '') is distinct from v_old_spot.meet_label);
  end if;

  update rides set
    name = case when f ? 'name' then btrim(f ->> 'name') else name end,
    description = case when f ? 'description' then nullif(btrim(f ->> 'description'), '') else description end,
    meet_at = case when f ? 'meet_at' and f ->> 'meet_at' is not null then (f ->> 'meet_at')::timestamptz else meet_at end,
    depart_at = case when f ? 'depart_at' then (f ->> 'depart_at')::timestamptz else depart_at end,
    expected_finish_at = case when f ? 'expected_finish_at' then (f ->> 'expected_finish_at')::timestamptz else expected_finish_at end,
    meet_area_lat = case when f ? 'meet_area_lat' then (f ->> 'meet_area_lat')::double precision else meet_area_lat end,
    meet_area_lng = case when f ? 'meet_area_lng' then (f ->> 'meet_area_lng')::double precision else meet_area_lng end,
    meet_area_label = case when f ? 'meet_area_label' then nullif(btrim(f ->> 'meet_area_label'), '') else meet_area_label end,
    meet_state = case when f ? 'meet_state' then f ->> 'meet_state' else meet_state end,
    destination_label = case when f ? 'destination_label' then nullif(btrim(f ->> 'destination_label'), '') else destination_label end,
    vehicle_types = case when f ? 'vehicle_types'
      then coalesce(array(select jsonb_array_elements_text(f -> 'vehicle_types')), '{}') else vehicle_types end,
    difficulty = case when f ? 'difficulty' then f ->> 'difficulty' else difficulty end,
    experience_level = case when f ? 'experience_level' then f ->> 'experience_level' else experience_level end,
    max_riders = case when f ? 'max_riders' then (f ->> 'max_riders')::int else max_riders end,
    max_vehicles = case when f ? 'max_vehicles' then (f ->> 'max_vehicles')::int else max_vehicles end,
    what_to_bring = case when f ? 'what_to_bring' then nullif(btrim(f ->> 'what_to_bring'), '') else what_to_bring end,
    required_equipment = case when f ? 'required_equipment' then nullif(btrim(f ->> 'required_equipment'), '') else required_equipment end,
    fuel_notes = case when f ? 'fuel_notes' then nullif(btrim(f ->> 'fuel_notes'), '') else fuel_notes end,
    route_miles = case when f ? 'route_miles' then (f ->> 'route_miles')::numeric else route_miles end,
    join_policy = case when f ? 'join_policy' then (f ->> 'join_policy')::join_policy else join_policy end
  where id = p_ride
  returning * into v_new;

  -- What changed, worked out here from the rows rather than trusted from the app.
  if v_new.name is distinct from v_old.name then v_changed := v_changed || 'name'::text; end if;
  if v_new.meet_at is distinct from v_old.meet_at or v_new.depart_at is distinct from v_old.depart_at then
    v_changed := v_changed || 'time'::text;
  end if;
  if v_spot_moved or v_new.meet_area_lat is distinct from v_old.meet_area_lat or v_new.meet_area_lng is distinct from v_old.meet_area_lng
     or v_new.meet_area_label is distinct from v_old.meet_area_label or v_new.meet_state is distinct from v_old.meet_state then
    v_changed := v_changed || 'place'::text;
  end if;
  if (p ? 'instructions')
     or row(v_new.description, v_new.expected_finish_at, v_new.destination_label, v_new.vehicle_types, v_new.difficulty,
            v_new.experience_level, v_new.max_riders, v_new.max_vehicles, v_new.what_to_bring, v_new.required_equipment,
            v_new.fuel_notes, v_new.route_miles, v_new.join_policy)
        is distinct from
        row(v_old.description, v_old.expected_finish_at, v_old.destination_label, v_old.vehicle_types, v_old.difficulty,
            v_old.experience_level, v_old.max_riders, v_old.max_vehicles, v_old.what_to_bring, v_old.required_equipment,
            v_old.fuel_notes, v_old.route_miles, v_old.join_policy) then
    v_changed := v_changed || 'details'::text;
  end if;

  if array_length(v_changed, 1) is not null then
    update rides set details_edited_at = now(), details_changed = v_changed where id = p_ride returning * into v_new;
  end if;

  -- The rides_notify trigger covered a new time or a new public area. An exact spot that moved
  -- inside the same square mile (or got a new name) leaves the ride row's area alone, so say it here.
  if v_spot_moved and v_new.status = 'scheduled'
     and v_new.meet_area_lat is not distinct from v_old.meet_area_lat
     and v_new.meet_area_lng is not distinct from v_old.meet_area_lng
     and v_new.meet_area_label is not distinct from v_old.meet_area_label
     and v_new.meet_at is not distinct from v_old.meet_at then
    perform queue_push(jsonb_build_object('type', 'ride', 'id', p_ride, 'change', 'place', 'actor', v_uid));
  end if;

  return v_new;
end;
$$;


-- Every park with trails on the map: name, where it is, how much is mapped. The app draws the park
-- names from far out and the Places to Ride list says "trails on the map".
create or replace function park_trail_parks()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'park_osm_id', p.park_osm_id, 'park_name', p.park_name, 'park_state', p.park_state, 'park_website', p.park_website,
    'trail_count', p.trail_count, 'trail_m', p.trail_m,
    'center', jsonb_build_object('lat', (p.min_lat + p.max_lat) / 2, 'lng', (p.min_lng + p.max_lng) / 2),
    'box', jsonb_build_array(p.min_lat, p.min_lng, p.max_lat, p.max_lng),
    'updated_at', p.updated_at) order by p.park_name), '[]'::jsonb)
  from (
    select park_osm_id, min(park_name) as park_name, min(park_state) as park_state, min(park_website) as park_website,
      count(*) filter (where kind = 'trail') as trail_count, coalesce(sum(length_m) filter (where kind = 'trail'), 0) as trail_m,
      min(min_lat) as min_lat, min(min_lng) as min_lng, max(max_lat) as max_lat, max(max_lng) as max_lng,
      max(updated_at) as updated_at
    from park_trails where not hidden
    group by park_osm_id
  ) p
$$;
revoke execute on function park_trail_parks() from public;
grant execute on function park_trail_parks() to anon, authenticated;

-- Fills in who is reported and copies the text; refuses posts and comments you can't see.
create or replace function reports_social_fill()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  p rider_posts;
  c feed_comments;
begin
  if new.post_id is null and new.comment_id is null then return new; end if;
  if auth.uid() is not null and new.reporter_id is distinct from auth.uid() then
    raise exception 'post not found';
  end if;
  if new.post_id is not null and new.comment_id is not null then raise exception 'report a post or a comment, not both'; end if;
  if new.post_id is not null then
    select * into p from rider_posts where id = new.post_id;
    if not found or p.author_id = new.reporter_id
       or not (feed_can_see(new.reporter_id, p.author_id)) then
      raise exception 'post not found';
    end if;
    new.kind := 'rider';
    new.reported_user_id := p.author_id;
    new.reported_text := left(coalesce(p.body, ''), 1000);
    new.reported_photo := p.photo_path;
    new.source := coalesce(new.source, 'post');
  else
    select * into c from feed_comments where id = new.comment_id;
    if not found or c.author_id = new.reporter_id
       or not (c.owner_id = new.reporter_id or feed_can_interact(new.reporter_id, c.item_key)) then
      raise exception 'comment not found';
    end if;
    new.kind := 'rider';
    new.reported_user_id := c.author_id;
    new.reported_text := left(c.body, 1000);
    new.source := coalesce(new.source, 'comment');
  end if;
  return new;
end;
$$;
revoke execute on function reports_social_fill() from public, anon, authenticated;


-- 4. Google Play referral deferral, done once. referral-defer reserves the reward
--    (referral_reserve_deferral) before asking Google, records Google's answer with
--    referral_mark_deferred, and puts the reward back with referral_unmark_deferred when Google
--    refused; a reward that is reserved but not confirmed is never reserved again, so a retry
--    can't push the same subscription out twice.
drop function if exists referral_reserve_deferral(uuid);
-- True only for the call that took the reservation, so two calls at once can't both ask Google.
create or replace function referral_reserve_deferral(p_user uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update referral_rewards set deferred_at = now()
  where user_id = p_user and claim_kind = 'google_defer' and deferred_at is null;
  return found;
end;
$$;
-- Confirms the deferral: the reward is redeemed and the subscription row takes Google's own expiry.
create or replace function referral_mark_deferred(p_user uuid, p_new_expiry timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  update referral_rewards set deferred_at = coalesce(deferred_at, now()), redeemed_at = coalesce(redeemed_at, now())
  where user_id = p_user and claim_kind = 'google_defer';
  update play_subscriptions set expires_at = p_new_expiry, updated_at = now()
  where purchase_token = referral_play_token(p_user) and expires_at is distinct from p_new_expiry;
end;
$$;
-- Google refused: the reservation comes off a reward that was never confirmed.
create or replace function referral_unmark_deferred(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update referral_rewards set deferred_at = null
  where user_id = p_user and claim_kind = 'google_defer' and deferred_at is not null and redeemed_at is null;
end;
$$;
-- The target now says whether the deferral is confirmed (redeemed_at), not only reserved.
create or replace function referral_defer_target(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('reward_id', w.id, 'deferred_at', w.deferred_at, 'redeemed_at', w.redeemed_at, 'purchase_token', s.purchase_token,
                            'product_id', s.product_id, 'expires_at', s.expires_at, 'defer_days', (referral_rules() ->> 'defer_days')::int)
  from referral_rewards w
  left join play_subscriptions s on s.purchase_token = referral_play_token(p_user)
  where w.user_id = p_user and w.claim_kind = 'google_defer';
$$;
revoke execute on function referral_reserve_deferral(uuid), referral_unmark_deferred(uuid) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function referral_reserve_deferral(uuid), referral_unmark_deferred(uuid) to service_role;
  end if;
end $$;
