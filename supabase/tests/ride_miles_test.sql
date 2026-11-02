-- Ride miles (migration 20261102200000_ride_miles_cleanup.sql): the group summary and badge
-- miles skip rough fixes, GPS bounces, location gaps and jumps the phone's speed contradicts.
-- Tracks are [lng, lat, epochSeconds, speedMps, altitudeM, accuracyM].

-- About 4 miles: 59 fixes 0.001 deg (111.2 m) apart, every 10 s, at 11 m/s.
create or replace function test_drive(p_n int, p_t0 double precision default 1760000000, p_lat double precision default 38.5)
returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_array(-109.5, p_lat + i * 0.001, p_t0 + i * 10, 11, null, 8) order by i)
  from generate_series(0, p_n - 1) i;
$$;

do $$
declare
  clean_m double precision := (select meters from track_clean_meters(test_drive(59)));
  m double precision;
begin
  if clean_m not between 6400 and 6500 then raise exception 'FAIL: clean drive measured % m', clean_m; end if;

  -- The 1.0.3 bug: leftover fixes from an earlier ride 30 miles away, hours before, joined on.
  m := (select meters from track_clean_meters(test_drive(5, 1760000000 - 20000, 38.07) || test_drive(59)));
  if m > clean_m + 500 then raise exception 'FAIL: leftover points added % m', m - clean_m; end if;

  -- Parked 30 minutes with a phone bouncing 100 m east and back every 2 s (50 m/s, under the spike limit).
  m := (select meters from track_clean_meters(
    (select jsonb_agg(jsonb_build_array(-109.5 + (i % 2) * 0.00115, 38.6, 1760000000 + i * 2, null) order by i) from generate_series(0, 899) i)));
  if m > 200 then raise exception 'FAIL: GPS bounce counted % m', m; end if;

  -- Every third fix rough (1.5 km off, accuracy 1500 m): skipped.
  m := (select meters from track_clean_meters(
    (select jsonb_agg(case when i % 3 = 1 then jsonb_build_array(-109.5, 38.51 + i * 0.001, 1760000000 + i * 10, 11, null, 1500)
                           else jsonb_build_array(-109.5, 38.5 + i * 0.001, 1760000000 + i * 10, 11, null, 8) end order by i)
     from generate_series(0, 58) i)));
  if m not between 6200 and 6500 then raise exception 'FAIL: rough fixes gave % m', m; end if;

  -- An hour with location off, 33 km further on: the straight line isn't counted.
  m := (select meters from track_clean_meters(test_drive(20) || test_drive(20, 1760000000 + 3800, 38.8)));
  if m not between 4100 and 4300 then raise exception 'FAIL: gap counted, % m', m; end if;

  -- The phone says it was standing still, but the fix moved 333 m in 15 s.
  m := (select meters from track_clean_meters('[[-109.5,38.6,1760000000,0],[-109.5,38.6,1760000015,0],[-109.5,38.603,1760000030,0],[-109.5,38.603,1760000045,0]]'));
  if m <> 0 then raise exception 'FAIL: contradicted jump counted % m', m; end if;

  -- Tracks from older builds (four values, no accuracy) still measure.
  m := (select meters from track_clean_meters('[[-109.5,38.5,1760000000,11],[-109.5,38.501,1760000010,11],[-109.5,38.502,1760000020,11]]'));
  if m not between 220 and 225 then raise exception 'FAIL: old-format track % m', m; end if;

  if (select meters from track_clean_meters('[]')) <> 0 or (select meters from track_clean_meters('"junk"')) <> 0 then
    raise exception 'FAIL: empty track';
  end if;
end $$;

drop function test_drive(int, double precision, double precision);
