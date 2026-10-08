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
