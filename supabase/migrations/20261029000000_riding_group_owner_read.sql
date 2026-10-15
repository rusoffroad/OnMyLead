-- Fix: making a riding group failed with "new row violates row-level security policy for table
-- riding_groups", so no group could ever be created.
--
-- The app creates a group with insert ... returning (supabase-js .insert().select().single()),
-- and Postgres checks the read policy on the returned row. riding_groups_read only called
-- is_group_member -> is_group_owner, a stable security-definer function that looks the group up
-- again in riding_groups; inside the insert statement its snapshot can't see the new row yet, so
-- the owner was refused their own group. Proven by the insert ... returning case in
-- supabase/tests/groups_test.sql (G1).
--
-- The owner now matches on the row itself. Members still match through is_group_member, and
-- anyone else still sees nothing. Same policy name, so old app builds are unaffected.

drop policy if exists riding_groups_read on riding_groups;
create policy riding_groups_read on riding_groups for select to authenticated
  using (owner_id = auth.uid() or is_group_member(id, auth.uid()));
