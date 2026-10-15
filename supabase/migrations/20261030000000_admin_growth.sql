-- Admin Dashboard Growth page (onmylead.com/admin/growth): how many real riders have signed up
-- (test and admin accounts left out), and app downloads from the App Store and Google Play.
--
-- Builds on 20261018300000_admin_dashboard.sql (require_admin(), log_admin_action(), profiles,
-- admin_users) and 20261018400000_admin_analytics.sql (admin_buckets(), admin_check_bucket()).
--
-- Backward compatible: two new tables for test accounts, two for store numbers, new functions only.
-- Downloads are written by the store-downloads edge function with the service role; until it is
-- deployed with its keys the page says "Not Connected Yet".

-- ---------------------------------------------------------------------------
-- Test accounts
-- ---------------------------------------------------------------------------
-- Accounts the owner marked as testing, left out of rider counts. Admins are always left out too.
create table if not exists admin_test_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  note text,
  marked_by uuid references auth.users (id) on delete set null,
  marked_at timestamptz not null default now()
);
alter table admin_test_accounts enable row level security;
-- No policies: only the admin_* functions below read or write it.

-- Chris's two test accounts (his own and the second account on his iPhone).
insert into admin_test_accounts (user_id, note)
select id, 'Owner test account' from auth.users
where lower(email) in ('chris@rusoffroad.com', 'chmorelock07@yahoo.com')
on conflict (user_id) do nothing;

-- True for an admin or a marked test account. Internal: only the admin_* functions call it.
create or replace function admin_is_test_account(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admin_test_accounts t where t.user_id = p_user)
      or exists (select 1 from admin_users a where a.user_id = p_user)
$$;

create or replace function admin_set_test_account(p_user uuid, p_test boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_was boolean;
begin
  perform require_admin();
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'no such account'; end if;
  v_was := exists (select 1 from admin_test_accounts where user_id = p_user);
  if p_test then
    insert into admin_test_accounts (user_id, note, marked_by)
    values (p_user, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
    on conflict (user_id) do update set note = excluded.note, marked_by = excluded.marked_by, marked_at = now();
  else
    delete from admin_test_accounts where user_id = p_user;
  end if;
  perform log_admin_action(case when p_test then 'user.mark_test' else 'user.unmark_test' end, 'user', p_user::text,
    jsonb_build_object('test_account', v_was), jsonb_build_object('test_account', p_test, 'note', p_note));
end;
$$;

-- ---------------------------------------------------------------------------
-- Registered riders
-- ---------------------------------------------------------------------------
-- Totals for the Growth page. "Riders" are accounts that are neither admins nor marked as test.
create or replace function admin_growth_summary(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
begin
  perform require_admin();
  p_from := coalesce(p_from, '-infinity'); p_to := coalesce(p_to, 'infinity');
  with a as (
    select p.id, p.created_at, p.last_active_at, admin_is_test_account(p.id) as test,
           coalesce(u.raw_app_meta_data ->> 'provider', 'email') as provider,
           exists (select 1 from ride_members m where m.user_id = p.id and m.status = 'joined') as rode
    from profiles p left join auth.users u on u.id = p.id
  ), r as (select * from a where not test)
  select jsonb_build_object(
    'accounts_total', (select count(*) from a),
    'test_accounts', (select count(*) from a where test),
    'riders_total', (select count(*) from r),
    'riders_new', (select count(*) from r where created_at >= p_from and created_at < p_to),
    'riders_active_30d', (select count(*) from r where last_active_at >= now() - interval '30 days'),
    'riders_with_ride', (select count(*) from r where rode),
    'first_rider_at', (select min(created_at) from r),
    'last_rider_at', (select max(created_at) from r),
    'by_method', (select coalesce(jsonb_agg(jsonb_build_object('method', provider, 'riders', n) order by n desc, provider), '[]')
                  from (select provider, count(*) as n from r group by provider) m),
    'test_list', (select coalesce(jsonb_agg(jsonb_build_object(
                    'user_id', a.id, 'display_name', p.display_name, 'email', u.email, 'created_at', a.created_at,
                    'reason', case when exists (select 1 from admin_users x where x.user_id = a.id) then 'admin' else 'marked' end,
                    'note', t.note) order by a.created_at), '[]')
                  from a join profiles p on p.id = a.id left join auth.users u on u.id = a.id
                  left join admin_test_accounts t on t.user_id = a.id
                  where a.test)
  ) into v;
  return v;
end;
$$;

-- New riders per bucket and the running total at the end of each bucket.
create or replace function admin_growth_series(p_from timestamptz, p_to timestamptz, p_bucket text default 'day')
returns table (bucket_start timestamptz, new_riders bigint, total_riders bigint, new_test_accounts bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  perform admin_check_bucket(p_bucket);
  if p_from is null or p_to is null or p_to <= p_from then raise exception 'bad date range'; end if;
  if p_to - p_from > interval '3 years' then raise exception 'date range too long'; end if;
  return query
  with a as (
    select p.created_at, admin_is_test_account(p.id) as test from profiles p
  ), b as (
    select x.bucket_start as s, least(x.bucket_start + ('1 ' || p_bucket)::interval, p_to) as e
    from admin_buckets(p_from, p_to, p_bucket) x
  )
  select b.s,
    (select count(*) from a where not a.test and a.created_at >= greatest(b.s, p_from) and a.created_at < b.e),
    (select count(*) from a where not a.test and a.created_at < b.e),
    (select count(*) from a where a.test and a.created_at >= greatest(b.s, p_from) and a.created_at < b.e)
  from b order by b.s;
end;
$$;

-- ---------------------------------------------------------------------------
-- App downloads
-- ---------------------------------------------------------------------------
-- One row per store, day and device, from the store's own daily reports. App Store: the Sales
-- and Trends summary (device iPhone, iPad, ...). Google Play: the installs report from the Play
-- Console's Cloud Storage bucket (device "Android"; Play doesn't split phones from tablets).
create table if not exists store_downloads (
  store text not null check (store in ('apple', 'google')),
  day date not null,
  device text not null,
  downloads int not null default 0,       -- first-time downloads / new user installs
  redownloads int not null default 0,     -- App Store re-downloads by the same Apple ID
  updates int not null default 0,
  uninstalls int,                         -- Google Play only
  imported_at timestamptz not null default now(),
  primary key (store, day, device)
);
alter table store_downloads enable row level security;

-- Days already read, so a day with no downloads isn't fetched again.
create table if not exists store_download_days (
  store text not null check (store in ('apple', 'google')),
  day date not null,
  primary key (store, day)
);
alter table store_download_days enable row level security;

-- The last time each store was read, and what went wrong.
create table if not exists store_download_imports (
  store text primary key check (store in ('apple', 'google')),
  checked_at timestamptz,
  ok_at timestamptz,
  latest_day date,
  error text
);
alter table store_download_imports enable row level security;
-- No policies on these three: the edge function writes with the service role; admins read
-- through admin_downloads().

create or replace function admin_downloads(p_from timestamptz, p_to timestamptz, p_bucket text default 'day')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
  v_from date; v_to date;
begin
  perform require_admin();
  perform admin_check_bucket(p_bucket);
  if p_from is null or p_to is null or p_to <= p_from then raise exception 'bad date range'; end if;
  if p_to - p_from > interval '3 years' then raise exception 'date range too long'; end if;
  v_from := (p_from at time zone 'UTC')::date;
  v_to := ((p_to - interval '1 microsecond') at time zone 'UTC')::date;
  select jsonb_build_object(
    'stores', (select jsonb_object_agg(s.store, jsonb_build_object(
        'checked_at', i.checked_at, 'ok_at', i.ok_at, 'latest_day', i.latest_day, 'error', i.error,
        'downloads', coalesce((select sum(d.downloads) from store_downloads d where d.store = s.store and d.day between v_from and v_to), 0),
        'redownloads', coalesce((select sum(d.redownloads) from store_downloads d where d.store = s.store and d.day between v_from and v_to), 0),
        'updates', coalesce((select sum(d.updates) from store_downloads d where d.store = s.store and d.day between v_from and v_to), 0),
        'uninstalls', (select sum(d.uninstalls) from store_downloads d where d.store = s.store and d.day between v_from and v_to),
        'all_time', coalesce((select sum(d.downloads) from store_downloads d where d.store = s.store), 0)))
      from (values ('apple'), ('google')) s (store) left join store_download_imports i on i.store = s.store),
    'by_device', (select coalesce(jsonb_agg(jsonb_build_object('store', store, 'device', device, 'downloads', n) order by n desc, device), '[]')
                  from (select store, device, sum(downloads) as n from store_downloads
                        where day between v_from and v_to group by store, device having sum(downloads) <> 0) x),
    'series', (select coalesce(jsonb_agg(jsonb_build_object('bucket_start', b.bucket_start,
        'apple', coalesce((select sum(d.downloads) from store_downloads d where d.store = 'apple'
                            and d.day >= greatest((b.bucket_start at time zone 'UTC')::date, v_from)
                            and d.day < ((b.bucket_start + ('1 ' || p_bucket)::interval) at time zone 'UTC')::date and d.day <= v_to), 0),
        'google', coalesce((select sum(d.downloads) from store_downloads d where d.store = 'google'
                            and d.day >= greatest((b.bucket_start at time zone 'UTC')::date, v_from)
                            and d.day < ((b.bucket_start + ('1 ' || p_bucket)::interval) at time zone 'UTC')::date and d.day <= v_to), 0))
        order by b.bucket_start), '[]')
      from admin_buckets(p_from, p_to, p_bucket) b)
  ) into v;
  return v;
end;
$$;

revoke all on function admin_is_test_account(uuid) from public, anon, authenticated;
revoke all on function
  admin_set_test_account(uuid, boolean, text), admin_growth_summary(timestamptz, timestamptz),
  admin_growth_series(timestamptz, timestamptz, text), admin_downloads(timestamptz, timestamptz, text)
from public, anon;
grant execute on function
  admin_set_test_account(uuid, boolean, text), admin_growth_summary(timestamptz, timestamptz),
  admin_growth_series(timestamptz, timestamptz, text), admin_downloads(timestamptz, timestamptz, text)
to authenticated;
