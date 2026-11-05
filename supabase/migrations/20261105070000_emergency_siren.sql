-- Emergency Siren (app/src/core/siren.ts): when a rider sends EMERGENCY (or a Crash Alert goes
-- out), the other riders' phones sound a siren. With the app closed the siren is the push's own
-- sound, so the push service (notify-ride-message) needs to know which phones have the siren
-- sound and want it:
--   push_tokens.siren  true   this phone's app has the siren and it is switched on
--                      false  this phone's app has the siren and the rider switched it off
--                      null   an app from before the siren (2.1 and older): the plain sound, as before
-- The app sets it with set_push_siren after registering its token, and again whenever the switch
-- changes. register_push_token keeps the value (a token re-registered by the same app stays as it
-- was), so 2.1 and older builds never get a sound or Android channel they don't have.
-- Backward compatible: nothing is renamed or dropped.

alter table push_tokens add column if not exists siren boolean;

create or replace function set_push_siren(p_token text, p_on boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_found boolean;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  update push_tokens set siren = coalesce(p_on, true), updated_at = now()
  where token = p_token and user_id = auth.uid();
  v_found := found;
  return v_found;
end;
$$;

revoke all on function set_push_siren(text, boolean) from public, anon;
grant execute on function set_push_siren(text, boolean) to authenticated;
