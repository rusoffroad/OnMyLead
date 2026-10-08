-- Ride chat, announcements and the post-ride summary.
-- Additive only: one trigger and index on ride_messages, one extra (restrictive) read rule on
-- ride_tracks, and one read-only summary function. Nothing is dropped or rewritten.
-- Fuel range on the ride page needs no schema change: rides.route_miles already holds the
-- planned distance and ride_members.vehicle_id the rider's machine.

-- ---------------------------------------------------------------------------
-- Chat: light spam limits.
-- Who can read and post is already enforced by messages_read / messages_write (joined riders
-- only; announcements only from organizers and co-organizers). This adds:
--   * messages are trimmed and at most 500 characters (the column allows 2000),
--   * at most 10 messages per minute per rider, across all rides,
--   * created_at is always the server time, and sent_at (when it was tapped, which can be
--     earlier for messages queued without signal) can never be in the future.
-- ---------------------------------------------------------------------------
create or replace function ride_message_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_recent int;
begin
  new.body := btrim(new.body);
  if length(new.body) = 0 then raise exception 'message is empty'; end if;
  if length(new.body) > 500 then raise exception 'message too long (500 characters max)'; end if;
  new.created_at := now();
  new.sent_at := least(coalesce(new.sent_at, now()), now());

  select count(*) into v_recent from ride_messages
  where user_id = new.user_id and created_at > now() - interval '1 minute';
  if v_recent >= 10 then raise exception 'slow down: too many messages, try again in a minute'; end if;
  return new;
end;
$$;

create trigger ride_messages_guard before insert on ride_messages
  for each row execute function ride_message_guard();

-- Rate-limit lookups and "latest announcement" both read by sender or kind and time.
create index if not exists ride_messages_user_recent on ride_messages (user_id, created_at desc);
create index if not exists ride_messages_ride_kind on ride_messages (ride_id, kind, created_at desc);

-- ---------------------------------------------------------------------------
-- Post-ride summary.
-- Tracks are precise location history, so each rider now reads only their own track. The
-- original tracks_ride rule let every joined rider read everyone's track; this restrictive
-- rule narrows it without dropping anything (restrictive rules are ANDed with the others).
-- ---------------------------------------------------------------------------
create policy tracks_own_only on ride_tracks as restrictive for select to authenticated
  using (user_id = auth.uid());

-- Group totals for an ended ride, without exposing anyone's points: counts, distances and
-- top speed only. Joined riders (and the organizer) can call it once the ride has ended.
-- Distance mirrors the app's rules: segments faster than 60 m/s are GPS spikes, and slower
-- than 2 m/s (about 4.5 mph) is standing still, so jitter at a stop doesn't add miles.
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
  with pts as (
    select t.user_id,
           (e.p ->> 0)::double precision as lng,
           (e.p ->> 1)::double precision as lat,
           (e.p ->> 2)::double precision as ts,
           case when jsonb_typeof(e.p -> 3) = 'number' then (e.p ->> 3)::double precision end as speed
    from ride_tracks t
    cross join lateral jsonb_array_elements(case when jsonb_typeof(t.points) = 'array' then t.points else '[]'::jsonb end) as e(p)
    where t.ride_id = p_ride
      and jsonb_typeof(e.p) = 'array'
      and jsonb_typeof(e.p -> 0) = 'number' and jsonb_typeof(e.p -> 1) = 'number' and jsonb_typeof(e.p -> 2) = 'number'
  ),
  seg as (
    select user_id, speed,
           ts - lag(ts) over w as dt,
           2 * 6371008.8 * asin(least(1, sqrt(
             power(sin(radians(lat - lag(lat) over w) / 2), 2)
             + cos(radians(lat)) * cos(radians(lag(lat) over w)) * power(sin(radians(lng - lag(lng) over w) / 2), 2)
           ))) as d
    from pts
    window w as (partition by user_id order by ts)
  ),
  per_rider as (
    select user_id,
           coalesce(sum(d) filter (where dt > 0 and d / dt between 2 and 60), 0) as meters,
           max(speed) filter (where speed between 0 and 60) as vmax
    from seg
    group by user_id
    having count(*) >= 2
  )
  select count(*)::int,
         round((sum(meters) / 1609.344)::numeric, 1),
         round((avg(meters) / 1609.344)::numeric, 1),
         round((max(meters) / 1609.344)::numeric, 1),
         round((max(vmax) * 2.236936)::numeric, 0)
  from per_rider;
end;
$$;
