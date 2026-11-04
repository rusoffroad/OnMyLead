-- Edit Ride Details (2.1): the leader (organizer or co-organizer) changes a ride's name, day and
-- times, meeting point, description and the rest of its details after creating it, on the app and
-- the website. The rules are in app/src/core/ride-edit.ts; this is the server half.
--
--   * edit_ride(...) saves the ride row and its private details in one go, only for the ride's
--     managers (is_ride_manager), and only while it is scheduled or live. Once a ride is live the
--     day, times and meeting point stay put (everyone is already there).
--   * The ride row's meeting AREA is still the fuzzed square mile the app works out; the exact spot
--     only ever goes into ride_private_details, as on create.
--   * Riders hear about it: the existing ride_change_notify trigger already sends "has a new time"
--     and "has a new meeting spot" when meet_at or the public area changes. When only the exact spot
--     moved (inside the same square mile) this sends the "new meeting spot" notification itself.
--   * rides.details_edited_at / details_changed say when and what changed last, for the
--     "Updated 5 min Ago: New Time" tag on the ride page.
--
-- Additive only: two nullable columns and one new function. Older app builds never call it and
-- ignore the columns. Before this is applied the app writes the same change straight to the tables
-- (the existing rides_update / private_details_write policies already allow the ride's managers).

alter table rides add column if not exists details_edited_at timestamptz;
alter table rides add column if not exists details_changed text[];

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
revoke execute on function edit_ride(uuid, jsonb, jsonb) from public, anon;
grant execute on function edit_ride(uuid, jsonb, jsonb) to authenticated;
