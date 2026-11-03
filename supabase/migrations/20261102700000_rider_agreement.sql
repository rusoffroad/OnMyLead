-- Rider Safety and Liability Agreement (Chris 2026-11-03: "add a disclaimer ... that shows to
-- everyone ... Record their acknowledgement somewhere on the backend where we can show it in
-- court later if needed").
--
-- Every rider agrees to it before using OnMyLead on iPhone, iPad, Android phones and tablets and
-- onmylead.com (app/src/components/rider-agreement.tsx). This migration keeps the evidence:
--
--   * rider_agreements: each published version's exact text and its SHA-256 fingerprint. A
--     published version can never be changed or removed (a trigger refuses it, for every role);
--     new wording is a new version, which every rider is asked to agree to again.
--   * rider_agreement_acceptances: one row each time a rider agrees. Append-only (a trigger
--     refuses every update and delete, for every role, the service role included). No foreign key
--     to auth.users, on purpose: the record is kept after the account is deleted, with the email
--     and name the rider had when they agreed. It stores the fingerprint of the text the app
--     actually showed and whether it matches the published copy (the full text too if it didn't),
--     the server's time, the phone's time, the app version and build, platform, device, OS
--     version, language, IP address and user agent.
--
-- Riders write rows only through accept_rider_agreement() and read only their own. The Admin
-- (two-factor) searches and exports them with admin_rider_agreements() and
-- admin_rider_agreement_export(); every export is written to the Audit Log.
--
-- Additive only: two new tables and five new functions. Older app builds never call them and
-- keep working. Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. Published versions.
-- ---------------------------------------------------------------------------
create table if not exists rider_agreements (
  version int primary key check (version > 0),
  title text not null,
  body text not null,
  body_sha256 text not null,
  effective_on date not null,
  published_at timestamptz not null default now()
);

alter table rider_agreements enable row level security;
drop policy if exists "anyone reads published agreements" on rider_agreements;
create policy "anyone reads published agreements" on rider_agreements for select to anon, authenticated using (true);
revoke insert, update, delete on rider_agreements from anon, authenticated;
grant select on rider_agreements to anon, authenticated;

create or replace function rider_agreements_frozen()
returns trigger language plpgsql as $$
begin
  raise exception 'A published rider agreement can''t be changed or removed. Publish a new version instead.'
    using errcode = '42501';
end;
$$;
drop trigger if exists rider_agreements_frozen on rider_agreements;
create trigger rider_agreements_frozen before update or delete on rider_agreements
  for each row execute function rider_agreements_frozen();

-- Version 1. The text is app/src/core/rider-agreement.ts agreementText(), character for
-- character; app/src/core/__tests__/rider-agreement.test.ts fails if they ever differ.
insert into rider_agreements (version, title, body, body_sha256, effective_on)
select 1, 'Rider Safety and Liability Agreement', t, encode(sha256(convert_to(t, 'UTF8')), 'hex'), date '2026-11-03'
from (select $agreement_v1$Rider Safety and Liability Agreement (version 1, effective November 3, 2026)

OnMyLead is a tool to help your group keep track of each other. You are in charge of your own safety. Please read this and agree before you ride.

You Ride at Your Own Risk
Riding and driving, on or off road, alone or in a group, is dangerous and can lead to injury, death and damage to vehicles and property. You choose where, when and how you ride, and you voluntarily accept all of those risks, whether or not you use OnMyLead.

Never Use the App While Driving or Riding
Do not look at, type on or tap your phone while your vehicle is moving. Pull over and stop first, or let a passenger use the app. Mount your phone securely and set up your ride before you leave. Follow every law about phone use where you are.

Only Ride Where It Is Legal and Allowed
Maps, routes, trails, waypoints and directions in OnMyLead, including ones other riders share, can be wrong, out of date, closed, unsafe or on private land. It is your job to check that you are allowed to be there and that the way is safe, and to obey traffic laws, land-use rules, closures and signs.

OnMyLead Is Not an Emergency or Safety Service
Locations can be late, wrong or missing. Phones lose signal and batteries run out. Help, SOS and other alerts only reach riders in the app and may arrive late or not at all. Never rely on OnMyLead to keep you or anyone else safe. In an emergency, call 911 or your local emergency number.

You Are Responsible for What You Do
You are responsible for your own actions, for how you ride and drive, and for any accident, injury or damage you cause while using OnMyLead. Leading, following or joining a ride does not make the leader, other riders or OnMyLead responsible for your safety.

Release of Liability
To the fullest extent the law allows, you release RUS Offroad LLC, OnMyLead and their owners, employees and partners from all claims for injury, death, property damage or other loss that come from your riding or your use of the app, including claims about locations, routes, maps, directions or alerts. You agree they are not liable for those losses, and that you will cover any claim brought against them because of how you rode or used the app.

Age and the Terms of Use
If you are under 18, a parent or guardian must read and agree to this for you. This agreement is part of the OnMyLead Terms of Use, which also apply. If any part cannot be enforced where you live, the rest still applies. If you do not agree, do not use OnMyLead.

I have read and agree to the Rider Safety and Liability Agreement, and I accept the risks of riding.$agreement_v1$ as t) s
on conflict (version) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Acceptances (append-only evidence).
-- ---------------------------------------------------------------------------
create table if not exists rider_agreement_acceptances (
  id uuid primary key default gen_random_uuid(),
  -- No foreign key: the record outlives the account.
  user_id uuid not null,
  email text,
  display_name text,
  agreement_version int not null references rider_agreements (version),
  text_sha256 text not null,
  text_matches boolean not null,
  -- Only when the app showed something other than the published text.
  shown_text text,
  accepted_at timestamptz not null default now(),
  device_accepted_at timestamptz,
  -- Agreed on the launch screen before signing in, sent once the rider signed in.
  before_sign_in boolean not null default false,
  platform text,
  app_version text,
  app_build text,
  device text,
  os_version text,
  locale text,
  ip_address text,
  user_agent text
);
create index if not exists rider_agreement_acceptances_user_idx on rider_agreement_acceptances (user_id, agreement_version);
create index if not exists rider_agreement_acceptances_time_idx on rider_agreement_acceptances (accepted_at desc);

alter table rider_agreement_acceptances enable row level security;
drop policy if exists "read own agreement acceptances" on rider_agreement_acceptances;
create policy "read own agreement acceptances" on rider_agreement_acceptances for select to authenticated
  using (user_id = auth.uid());
revoke insert, update, delete, truncate on rider_agreement_acceptances from anon, authenticated;
revoke all on rider_agreement_acceptances from anon;
grant select on rider_agreement_acceptances to authenticated;

create or replace function rider_agreement_acceptances_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'Rider agreement records are permanent and can''t be changed or deleted.'
    using errcode = '42501';
end;
$$;
drop trigger if exists rider_agreement_acceptances_append_only on rider_agreement_acceptances;
create trigger rider_agreement_acceptances_append_only before update or delete on rider_agreement_acceptances
  for each row execute function rider_agreement_acceptances_append_only();
drop trigger if exists rider_agreement_acceptances_no_truncate on rider_agreement_acceptances;
create trigger rider_agreement_acceptances_no_truncate before truncate on rider_agreement_acceptances
  for each statement execute function rider_agreement_acceptances_append_only();

-- The caller's IP address, from the headers the API passes through (null when run as SQL).
create or replace function request_ip()
returns text language plpgsql stable set search_path = public as $$
declare
  h jsonb;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    return null;
  end;
  if h is null then return null; end if;
  return left(nullif(trim(coalesce(h ->> 'cf-connecting-ip', split_part(h ->> 'x-forwarded-for', ',', 1), h ->> 'x-real-ip')), ''), 64);
end;
$$;

create or replace function request_user_agent()
returns text language plpgsql stable set search_path = public as $$
declare
  h jsonb;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    return null;
  end;
  return left(h ->> 'user-agent', 400);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. The rider's side.
-- ---------------------------------------------------------------------------

-- Saves that the signed-in rider agreed to p_version, having been shown p_text. Calling it again
-- for a version already on record returns that record (an app retry never makes a duplicate).
create or replace function accept_rider_agreement(
  p_version int,
  p_text text,
  p_device_accepted_at timestamptz default null,
  p_before_sign_in boolean default false,
  p_platform text default null,
  p_app_version text default null,
  p_app_build text default null,
  p_device text default null,
  p_os_version text default null,
  p_locale text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_published rider_agreements;
  v_hash text;
  v_row rider_agreement_acceptances;
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select * into v_published from rider_agreements where version = p_version;
  if not found then
    raise exception 'unknown agreement version %', p_version using errcode = '22023';
  end if;
  if p_text is null or char_length(p_text) = 0 or char_length(p_text) > 20000 then
    raise exception 'agreement text missing' using errcode = '22023';
  end if;

  select * into v_row from rider_agreement_acceptances
  where user_id = v_me and agreement_version = p_version
  order by accepted_at limit 1;
  if found then
    return jsonb_build_object('version', v_row.agreement_version, 'accepted_at', v_row.accepted_at, 'matches', v_row.text_matches);
  end if;

  v_hash := encode(sha256(convert_to(p_text, 'UTF8')), 'hex');
  insert into rider_agreement_acceptances (
    user_id, email, display_name, agreement_version, text_sha256, text_matches, shown_text,
    device_accepted_at, before_sign_in, platform, app_version, app_build, device, os_version, locale,
    ip_address, user_agent)
  values (
    v_me,
    (select u.email from auth.users u where u.id = v_me),
    (select p.display_name from profiles p where p.id = v_me),
    p_version, v_hash, v_hash = v_published.body_sha256,
    case when v_hash = v_published.body_sha256 then null else p_text end,
    p_device_accepted_at, coalesce(p_before_sign_in, false),
    left(p_platform, 20), left(p_app_version, 40), left(p_app_build, 20), left(p_device, 120),
    left(p_os_version, 40), left(p_locale, 40),
    request_ip(), request_user_agent())
  returning * into v_row;
  return jsonb_build_object('version', v_row.agreement_version, 'accepted_at', v_row.accepted_at, 'matches', v_row.text_matches);
end;
$$;

-- The newest version the signed-in rider agreed to (null = none), and the newest published.
create or replace function my_rider_agreement()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'version', (select max(agreement_version) from rider_agreement_acceptances where user_id = auth.uid()),
    'accepted_at', (select max(accepted_at) from rider_agreement_acceptances where user_id = auth.uid()),
    'current', (select max(version) from rider_agreements));
$$;

-- ---------------------------------------------------------------------------
-- 4. The Admin's side (onmylead.com/admin > Rider Agreements, and each rider's page).
-- ---------------------------------------------------------------------------
create or replace function admin_rider_agreements(
  p_search text default null, p_user uuid default null, p_page int default 0, p_page_size int default 50
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_rows jsonb; v_total bigint; v_q text := nullif(trim(coalesce(p_search, '')), '');
  v_current int := (select max(version) from rider_agreements);
begin
  perform require_admin();
  p_page_size := least(greatest(coalesce(p_page_size, 50), 1), 200);
  p_page := greatest(coalesce(p_page, 0), 0);
  with f as (
    select a.*, not exists (select 1 from auth.users u where u.id = a.user_id) as account_deleted
    from rider_agreement_acceptances a
    where (p_user is null or a.user_id = p_user)
      and (v_q is null or a.email ilike '%' || v_q || '%' or a.display_name ilike '%' || v_q || '%'
           or a.user_id::text = v_q or a.ip_address = v_q)
  )
  select (select count(*) from f),
         coalesce((select jsonb_agg(to_jsonb(x) order by x.accepted_at desc) from (
           select * from f order by accepted_at desc offset p_page * p_page_size limit p_page_size) x), '[]')
    into v_total, v_rows;
  return jsonb_build_object(
    'rows', v_rows,
    'total', v_total,
    'current_version', v_current,
    'riders', (select count(*) from auth.users),
    'riders_on_current', (select count(distinct a.user_id) from rider_agreement_acceptances a
                          join auth.users u on u.id = a.user_id where a.agreement_version = v_current),
    'versions', coalesce((select jsonb_agg(jsonb_build_object('version', r.version, 'title', r.title,
                  'effective_on', r.effective_on, 'body_sha256', r.body_sha256, 'body', r.body) order by r.version desc)
                  from rider_agreements r), '[]'));
end;
$$;

-- Every record accepted in [p_from, p_to), for a CSV download (at most 100,000 rows). Logged.
create or replace function admin_rider_agreement_export(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_rows jsonb; v_count int;
begin
  perform require_admin();
  select coalesce(jsonb_agg(to_jsonb(x) order by x.accepted_at), '[]'), count(*)
  into v_rows, v_count
  from (
    select a.id, a.accepted_at, a.device_accepted_at, a.user_id, a.email, a.display_name,
           a.agreement_version, a.text_sha256, a.text_matches, a.before_sign_in, a.platform,
           a.app_version, a.app_build, a.device, a.os_version, a.locale, a.ip_address, a.user_agent,
           not exists (select 1 from auth.users u where u.id = a.user_id) as account_deleted
    from rider_agreement_acceptances a
    where a.accepted_at >= p_from and a.accepted_at < p_to
    order by a.accepted_at
    limit 100000
  ) x;
  perform log_admin_action('export_csv', 'export', 'rider_agreements', null,
    jsonb_build_object('from', p_from, 'to', p_to, 'rows', v_count));
  return v_rows;
end;
$$;

revoke all on function request_ip(), request_user_agent() from public, anon, authenticated;
revoke all on function accept_rider_agreement(int, text, timestamptz, boolean, text, text, text, text, text, text),
  my_rider_agreement(), admin_rider_agreements(text, uuid, int, int),
  admin_rider_agreement_export(timestamptz, timestamptz) from public, anon;
grant execute on function accept_rider_agreement(int, text, timestamptz, boolean, text, text, text, text, text, text),
  my_rider_agreement(), admin_rider_agreements(text, uuid, int, int),
  admin_rider_agreement_export(timestamptz, timestamptz) to authenticated;
