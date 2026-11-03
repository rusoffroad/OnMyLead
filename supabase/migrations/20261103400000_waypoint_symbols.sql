-- Waypoint symbols (2.1): riders give a waypoint one of 15 symbols. The first seven are the
-- original kinds; the eight new ones (gate, trailhead, water crossing, food, restroom, first aid,
-- repair, photo spot) go in a new symbol column.
--
-- Backward compatible with every app build already in riders' hands:
-- * kind keeps its original seven values, and the server sets it to the nearest one for each new
--   symbol, so older builds (which only know kind) still draw every waypoint;
-- * when an older build changes a waypoint's kind, the stale symbol is cleared, so the new kind shows
--   everywhere;
-- * the column is optional: older builds never send it.

alter table ride_waypoints add column symbol text
  check (symbol is null or symbol in (
    'spot', 'camp', 'fuel', 'water', 'view', 'hazard', 'parking',
    'gate', 'trailhead', 'crossing', 'food', 'restroom', 'first_aid', 'repair', 'photo'
  ));

comment on column ride_waypoints.symbol is
  'The picture the rider picked (2.1+). null = show kind. kind always holds the nearest original value for older app builds.';

-- The original kind an older build should show for a symbol.
create function waypoint_symbol_kind(p_symbol text) returns text language sql immutable set search_path = public as $$
  select case p_symbol
    when 'gate' then 'spot'
    when 'trailhead' then 'parking'
    when 'crossing' then 'hazard'
    when 'food' then 'spot'
    when 'restroom' then 'spot'
    when 'first_aid' then 'spot'
    when 'repair' then 'spot'
    when 'photo' then 'view'
    else p_symbol
  end;
$$;

create function ride_waypoints_symbol() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.symbol is not distinct from old.symbol and new.kind is distinct from old.kind then
    -- An older build changed the kind: the old symbol no longer describes it.
    new.symbol := null;
  end if;
  if new.symbol is not null then
    new.kind := waypoint_symbol_kind(new.symbol);
  end if;
  return new;
end $$;
revoke execute on function ride_waypoints_symbol() from public, anon, authenticated;

create trigger ride_waypoints_symbol before insert or update on ride_waypoints
  for each row execute function ride_waypoints_symbol();

grant insert (symbol) on ride_waypoints to authenticated;
grant update (symbol) on ride_waypoints to authenticated;
