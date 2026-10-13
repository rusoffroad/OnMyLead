-- Minimal stand-ins for Supabase's auth schema and roles so the migration and tests can
-- run on plain Postgres. Not used in Supabase itself.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
-- Like Supabase, pgcrypto lives in the extensions schema, which is on the default search_path.
create schema extensions;
create extension pgcrypto with schema extensions;
select set_config('search_path', current_setting('search_path') || ', extensions', false);
do $$ begin
  execute format('alter database %I set search_path = "$user", public, extensions', current_database());
end $$;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
grant execute on function auth.jwt() to anon, authenticated;
-- Columns the Admin Dashboard reads (account status and sign-in times).
alter table auth.users add column if not exists created_at timestamptz default now(),
  add column if not exists email_confirmed_at timestamptz,
  add column if not exists last_sign_in_at timestamptz,
  add column if not exists banned_until timestamptz;
-- Sign-in accounts linked to each user (Apple, Google, Facebook, email), as Supabase keeps them.
create table auth.identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,
  provider_id text not null,
  identity_data jsonb not null default '{}',
  last_sign_in_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
