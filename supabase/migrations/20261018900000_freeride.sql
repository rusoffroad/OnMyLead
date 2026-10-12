-- Mapped Ride or Freeride: when creating a ride the organizer says whether there will be a
-- mapped route or it's a freeride with none. Freeride rides skip the "Build the Route" prompt.
-- The existing rides policies already cover this column (organizer inserts and updates).
alter table rides add column if not exists freeride boolean not null default false;
