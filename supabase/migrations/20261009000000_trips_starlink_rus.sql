-- Trip planner (packing checklists) and Starlink setup. Both are private to the rider:
-- nobody else, including people on the same ride, can see them.

-- ---------------------------------------------------------------------------
-- Shared rule: a row's vehicle must be in the same rider's garage.
-- ---------------------------------------------------------------------------
create or replace function check_owner_vehicle()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.vehicle_id is not null and not exists (
    select 1 from vehicles where id = new.vehicle_id and owner_id = new.owner_id
  ) then
    raise exception 'that vehicle is not in your garage';
  end if;
  return new;
end;
$$;

create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Trips and their checklists
-- ---------------------------------------------------------------------------
create table trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  starts_on date,
  ends_on date,
  ride_id uuid references rides (id) on delete set null,
  vehicle_id uuid references vehicles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create index on trips (owner_id);
-- One trip per ride per rider, so "Plan what to bring" always opens the same list.
create unique index trips_owner_ride on trips (owner_id, ride_id) where ride_id is not null;

create trigger trips_vehicle_owner before insert or update of vehicle_id, owner_id on trips
  for each row execute function check_owner_vehicle();
create trigger trips_touch before update on trips
  for each row execute function touch_updated_at();

create table trip_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 200),
  category text not null default 'other' check (category in (
    'recovery', 'tools_spares', 'first_aid', 'navigation_comms', 'power_starlink',
    'camping', 'food_water', 'clothing', 'fuel_fluids', 'documents', 'other'
  )),
  checked boolean not null default false,
  quantity int not null default 1 check (quantity between 1 and 999),
  notes text check (notes is null or length(notes) <= 1000),
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index on trip_items (trip_id);

alter table trips enable row level security;
alter table trip_items enable row level security;

create policy trips_owner on trips for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy trip_items_owner on trip_items for all to authenticated
  using (exists (select 1 from trips t where t.id = trip_id and t.owner_id = auth.uid()))
  with check (exists (select 1 from trips t where t.id = trip_id and t.owner_id = auth.uid()));
