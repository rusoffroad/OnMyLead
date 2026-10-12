-- Ride chat: the sender can clear a message they sent, or mark it resolved.
-- Additive only: two nullable columns on ride_messages and two functions. Riders still have
-- no update or delete rights on ride_messages; both changes go through these functions, which
-- only ever act on the caller's own messages.

-- When the sender marked the message resolved (null while it is open).
alter table ride_messages add column resolved_at timestamptz;

-- Mark one of your own messages resolved, or open it again. Everyone who can read the
-- message sees the change (realtime sends the update under the same read rules).
create or replace function set_message_resolved(p_message uuid, p_resolved boolean)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  v_at timestamptz := case when p_resolved then now() end;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  update ride_messages set resolved_at = v_at
  where id = p_message and user_id = auth.uid();
  if not found then raise exception 'only the sender can resolve this message'; end if;
  return v_at;
end;
$$;

-- Clear (delete) one of your own messages for everyone. Votes on a cleared poll go with it.
create or replace function clear_ride_message(p_message uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  delete from ride_messages where id = p_message and user_id = auth.uid();
  if not found then raise exception 'only the sender can clear this message'; end if;
end;
$$;

revoke execute on function set_message_resolved(uuid, boolean) from public, anon;
revoke execute on function clear_ride_message(uuid) from public, anon;
grant execute on function set_message_resolved(uuid, boolean) to authenticated;
grant execute on function clear_ride_message(uuid) to authenticated;
