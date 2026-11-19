-- Activities (4.0, Chris 2026-11-19): OnMyLead for more than offroad. Rides, events and places
-- carry the activity they're for (app/src/core/activities.ts lists them: offroad, motorcycle,
-- road_trip, snowmobile). Everything that existed before is Offroad.
--
-- Backward compatible: only new columns with defaults and new functions. Older app builds insert
-- rides and events without an activity (Offroad), and keep calling events_list and
-- riding_spots_near, which are unchanged and still list everything.

-- An activity id: lower case words joined by _, so new activities need no migration.
alter table rides add column if not exists activity text not null default 'offroad'
  check (activity ~ '^[a-z][a-z_]{1,23}$');
alter table rider_events add column if not exists activity text not null default 'offroad'
  check (activity ~ '^[a-z][a-z_]{1,23}$');
-- A place can serve several activities (a forest with OHV trails in summer and sled trails in winter).
alter table riding_spots add column if not exists activities text[] not null default '{offroad}'
  check (cardinality(activities) between 1 and 12 and array_to_string(activities, ',') ~ '^[a-z][a-z_]{1,23}(,[a-z][a-z_]{1,23})*$');

-- Public ride discovery filters on it (with the existing visibility/status/meet_at filters).
create index if not exists rides_public_activity_idx on rides (activity, meet_at) where visibility = 'public';

-- Upcoming public events for one activity: events_list, kept to the events of that activity.
create or replace function events_list_for(p_activity text, p_scope text default 'upcoming', p_lat double precision default null,
                                           p_lng double precision default null, p_miles int default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(e.j order by e.n), '[]'::jsonb)
  from jsonb_array_elements(events_list(p_scope, p_lat, p_lng, p_miles)) with ordinality as e(j, n)
  join rider_events r on r.id = (e.j ->> 'id')::uuid
  where r.activity = coalesce(p_activity, 'offroad');
$$;
revoke execute on function events_list_for(text, text, double precision, double precision, int) from public;
grant execute on function events_list_for(text, text, double precision, double precision, int) to anon, authenticated;

-- A host labels their event with its activity (the app does it right after creating the event).
create or replace function set_event_activity(p_event uuid, p_activity text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if p_activity is null or p_activity !~ '^[a-z][a-z_]{1,23}$' then raise exception 'bad activity'; end if;
  perform require_event_host(p_event);
  update rider_events set activity = p_activity where id = p_event;
end;
$$;
revoke execute on function set_event_activity(uuid, text) from public, anon;
grant execute on function set_event_activity(uuid, text) to authenticated;

-- Places to ride near a point for one activity: riding_spots_near, kept to the places that serve it.
create or replace function riding_spots_near_for(
  p_activity text, p_lat double precision, p_lng double precision, p_miles double precision default 250,
  p_kinds text[] default null, p_limit int default 300)
returns table (
  id uuid, name text, kind text, lat double precision, lng double precision, state text, area_name text,
  website text, source text, attribution text, distance_mi double precision, rides_coming_up int)
language sql stable security definer set search_path = public as $$
  select n.* from riding_spots_near(p_lat, p_lng, p_miles, p_kinds, p_limit) n
  join riding_spots s on s.id = n.id
  where coalesce(p_activity, 'offroad') = any (s.activities)
  order by n.distance_mi;
$$;
revoke execute on function riding_spots_near_for(text, double precision, double precision, double precision, text[], int) from public;
grant execute on function riding_spots_near_for(text, double precision, double precision, double precision, text[], int) to anon, authenticated;

-- Admin Dashboard > Places to Ride: which activities each place serves, and changing them.
create or replace function admin_riding_spot_activities(p_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  return coalesce((select jsonb_object_agg(s.id, to_jsonb(s.activities)) from riding_spots s where s.id = any (p_ids)), '{}'::jsonb);
end;
$$;
revoke execute on function admin_riding_spot_activities(uuid[]) from public, anon;
grant execute on function admin_riding_spot_activities(uuid[]) to authenticated;

create or replace function admin_set_riding_spot_activities(p_id uuid, p_activities text[])
returns void language plpgsql security definer set search_path = public as $$
declare v_before text[];
begin
  perform require_admin();
  if p_activities is null or cardinality(p_activities) = 0 then raise exception 'pick at least one activity'; end if;
  select activities into v_before from riding_spots where id = p_id;
  if not found then raise exception 'no such place'; end if;
  update riding_spots set activities = (select array_agg(distinct a order by a) from unnest(p_activities) a), edited_by_admin = true
  where id = p_id;
  perform log_admin_action('riding_spot.activities', 'riding_spot', p_id::text,
    jsonb_build_object('activities', v_before), jsonb_build_object('activities', p_activities));
end;
$$;
revoke execute on function admin_set_riding_spot_activities(uuid, text[]) from public, anon;
grant execute on function admin_set_riding_spot_activities(uuid, text[]) to authenticated;
