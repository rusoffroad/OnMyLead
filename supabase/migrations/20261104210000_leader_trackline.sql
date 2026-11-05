-- Leader Trackline (2.1): in Ride Mode every rider's map draws a line behind the leader, in the
-- leader dot's color, so the group can see exactly where the leader went. Each phone builds the
-- line from the leader's live spots it already receives (nothing new is uploaded or stored on the
-- server); this migration only holds the leader's choice to show it or not, so every phone on the
-- ride follows the same switch.
--
-- Additive only: one column with a default (rides saved before this, and old app builds that never
-- read it, get "on") and one function. Nothing is dropped or rewritten.

alter table rides add column if not exists leader_trackline boolean not null default true;

-- The leader (is_ride_leader falls back to the organizer when nobody holds the Leader role) and the
-- ride's organizers turn the line on or off, the same riders who share waypoints with the group.
-- Only this one column changes, so none of the rides triggers (status, time, place) fire, and every
-- phone in Ride Mode picks it up from the rides realtime update it already listens to.
create or replace function set_leader_trackline(p_ride uuid, p_on boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if p_on is null then
    raise exception 'Say whether the trackline is on or off.' using errcode = '22023';
  end if;
  if not can_share_waypoint(p_ride, auth.uid()) then
    raise exception 'Only the leader can do that.' using errcode = '42501';
  end if;
  update rides set leader_trackline = p_on where id = p_ride;
  if not found then
    raise exception 'Ride not found.' using errcode = 'P0002';
  end if;
  return p_on;
end $$;

revoke all on function set_leader_trackline(uuid, boolean) from public, anon;
grant execute on function set_leader_trackline(uuid, boolean) to authenticated;
