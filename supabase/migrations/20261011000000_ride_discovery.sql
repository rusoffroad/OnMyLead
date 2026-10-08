-- Public ride discovery by state, and private ride previews by invite code.
--
-- * meet_state: the US state of the meeting area (two-letter code), so riders can pick a state
--   and see its public rides on a map. Distance search uses the rounded meet_area_lat/lng that
--   already exist; the exact pin stays in ride_private_details.
-- * ride_preview: lets anyone holding a private ride's invite code (or link) see the ride page
--   before joining or creating an account. The code is the invitation, so it shows only what a
--   public ride page shows; the exact meeting point and roster still need membership.

alter table rides add column meet_state text check (meet_state ~ '^[A-Z]{2}$');
create index on rides (meet_state, meet_at) where visibility = 'public' and status in ('scheduled', 'live');
create index on rides (meet_area_lat, meet_area_lng) where visibility = 'public' and status in ('scheduled', 'live');

create or replace function ride_preview(p_code text)
returns setof rides
language sql stable security definer set search_path = public as $$
  select * from rides where invite_code = upper(trim(p_code)) limit 1;
$$;
grant execute on function ride_preview(text) to anon, authenticated;
