-- Ride miles that match the ride.
-- A rider's after-ride summary said 60 miles for a 4 mile test ride. Three things added miles
-- that weren't ridden (the app's own summary in app/src/core/summary.ts is fixed the same way):
--   * rough fixes: phones with a poor fix (indoors, Approximate Location) bounce 100 m or more
--     every couple of seconds, and each bounce under 134 mph counted;
--   * gaps: points left over from an earlier ride, or a stale fix from hours before, were
--     joined to the ride by a straight line;
--   * jumps the phone's own speed says never happened (it reported standing still).
-- So miles now skip fixes with accuracy worse than 100 m (stored from 1.0.4 as the sixth value),
-- single-fix bounces that go out at least 50 m faster than 20 m/s and come straight back, any
-- gap longer than five minutes, and jumps while both fixes report standing still (under
-- 0.3 m/s) or faster than three times the reported speed plus 10 m/s.
-- Spike and moving thresholds are unchanged (2 to 60 m/s).
--
-- Backward compatible: same function names, arguments and results; old builds' tracks (no
-- accuracy) are read as before, minus the gap and bounce rules. Nothing stored is changed here.

-- Great-circle meters (null when either point is missing).
create or replace function track_geo_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable set search_path = public as $$
  select 2 * 6371008.8 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )));
$$;

-- Meters and top reported speed of one stored track, cleaned. Shared by the group summary and
-- badge miles so they always agree.
create or replace function track_clean_meters(p_points jsonb, out meters double precision, out vmax double precision)
language sql immutable set search_path = public as $$
  with raw as (
    select (e.p ->> 0)::double precision as lng,
           (e.p ->> 1)::double precision as lat,
           (e.p ->> 2)::double precision as ts,
           case when jsonb_typeof(e.p -> 3) = 'number' and (e.p ->> 3)::double precision >= 0 then (e.p ->> 3)::double precision end as speed,
           case when jsonb_typeof(e.p -> 5) = 'number' then (e.p ->> 5)::double precision end as acc
    from jsonb_array_elements(case when jsonb_typeof(p_points) = 'array' then p_points else '[]'::jsonb end) as e(p)
    where jsonb_typeof(e.p) = 'array'
      and jsonb_typeof(e.p -> 0) = 'number' and jsonb_typeof(e.p -> 1) = 'number' and jsonb_typeof(e.p -> 2) = 'number'
  ),
  pts as (
    select distinct on (ts) lng, lat, ts, speed from raw
    where abs(lat) <= 90 and abs(lng) <= 180 and (acc is null or acc <= 100)
    order by ts
  ),
  nb as (
    select lng, lat, ts, speed,
           lag(lat) over w as plat, lag(lng) over w as plng, lag(ts) over w as pts,
           lead(lat) over w as nlat, lead(lng) over w as nlng
    from pts window w as (order by ts)
  ),
  kept as (
    -- Drop a fix that bounces out (50 m+, 20 m/s+) and lands back within a third of the way.
    select lng, lat, ts, speed from nb
    where plat is null or nlat is null
       or not (
         track_geo_m(plat, plng, lat, lng) >= 50
         and ts > pts and track_geo_m(plat, plng, lat, lng) / (ts - pts) >= 20
         and track_geo_m(plat, plng, nlat, nlng) <= track_geo_m(plat, plng, lat, lng) / 3
       )
  ),
  seg as (
    select speed, lag(speed) over w as pspeed, ts - lag(ts) over w as dt,
           track_geo_m(lag(lat) over w, lag(lng) over w, lat, lng) as d
    from kept window w as (order by ts)
  )
  select coalesce(sum(d) filter (
           where dt > 0 and dt <= 300 and d / dt between 2 and 60
             and not (speed is not null and pspeed is not null
                      and (greatest(speed, pspeed) < 0.3 or d / dt > 3 * greatest(speed, pspeed) + 10))
         ), 0),
         (select max(speed) from pts where speed <= 60)
  from seg;
$$;

revoke execute on function track_clean_meters(jsonb) from public, anon, authenticated;
revoke execute on function track_geo_m(double precision, double precision, double precision, double precision) from public, anon, authenticated;

create or replace function rider_track_miles(p_ride uuid, p_user uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(least(1000, round(((select meters from track_clean_meters(t.points)) / 1609.344)::numeric, 1)), 0)
  from (select (select points from ride_tracks where ride_id = p_ride and user_id = p_user) as points) t;
$$;
revoke execute on function rider_track_miles(uuid, uuid) from public, anon, authenticated;

create or replace function ride_group_summary(p_ride uuid)
returns table (
  riders_tracked int,
  total_miles numeric,
  average_miles numeric,
  longest_miles numeric,
  top_speed_mph numeric
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from rides where id = p_ride and status = 'ended') then return; end if;
  if not (is_ride_member(p_ride, auth.uid()) or is_ride_manager(p_ride, auth.uid())) then return; end if;

  return query
  with per_rider as (
    select c.meters, c.vmax
    from ride_tracks t
    cross join lateral track_clean_meters(t.points) c
    where t.ride_id = p_ride
      and jsonb_typeof(t.points) = 'array'
      and (select count(*) from jsonb_array_elements(t.points) e(p)
           where jsonb_typeof(e.p) = 'array' and jsonb_typeof(e.p -> 0) = 'number'
             and jsonb_typeof(e.p -> 1) = 'number' and jsonb_typeof(e.p -> 2) = 'number') >= 2
  )
  select count(*)::int,
         round((sum(meters) / 1609.344)::numeric, 1),
         round((avg(meters) / 1609.344)::numeric, 1),
         round((max(meters) / 1609.344)::numeric, 1),
         round((max(vmax) * 2.236936)::numeric, 0)
  from per_rider;
end;
$$;
