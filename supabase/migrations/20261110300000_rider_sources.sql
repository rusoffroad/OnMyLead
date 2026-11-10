-- Where riders found OnMyLead (3.0). Two signals per account, shown on the Admin Dashboard's
-- Signups and Downloads page:
--   * answer: what the rider tapped on Home's one-time "How Did You Find OnMyLead?" card;
--   * utm_* / click: the ad or link that brought them to onmylead.com, saved by the website at
--     sign-up (lib/found-us.web.ts). The phone apps can't see the website visit, so they only send
--     the answer.
-- Only the rider can write their own row; nobody but admins reads it, and only as counts.
-- Additive: older builds never call these functions.

create table if not exists rider_sources (
  user_id uuid primary key references auth.users (id) on delete cascade,
  answer text check (answer in ('facebook', 'instagram', 'tiktok', 'youtube', 'google', 'app_store', 'google_play',
                                'friend', 'group_or_club', 'event', 'other', 'skipped')),
  detail text check (char_length(detail) <= 80),
  utm_source text check (char_length(utm_source) <= 60),
  utm_medium text check (char_length(utm_medium) <= 60),
  utm_campaign text check (char_length(utm_campaign) <= 100),
  click text check (click in ('meta', 'google', 'tiktok')),
  platform text check (platform in ('ios', 'android', 'web')),
  answered_at timestamptz,
  created_at timestamptz not null default now()
);
alter table rider_sources enable row level security;
-- No policies: rows are written through set_my_found_us() and read through admin_found_us().
revoke all on rider_sources from anon, authenticated;

create or replace function _clean_tag(v text, n int)
returns text language sql immutable as $$
  select nullif(left(regexp_replace(lower(btrim(coalesce(v, ''))), '[^a-z0-9 ._+-]', '', 'g'), n), '')
$$;

-- The rider's answer (null keeps the earlier one) and, from the website, the campaign that brought
-- them. A campaign is kept from the first time it was saved: that is the visit that won them.
create or replace function set_my_found_us(p_answer text default null, p_detail text default null,
                                           p_utm jsonb default null, p_platform text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_answer text := nullif(btrim(coalesce(p_answer, '')), '');
  v_click text := nullif(p_utm ->> 'click', '');
begin
  if me is null then raise exception 'signed out' using errcode = '42501'; end if;
  if v_answer is not null and v_answer not in ('facebook', 'instagram', 'tiktok', 'youtube', 'google', 'app_store',
      'google_play', 'friend', 'group_or_club', 'event', 'other', 'skipped') then
    raise exception 'unknown answer' using errcode = '22023';
  end if;
  if v_click is not null and v_click not in ('meta', 'google', 'tiktok') then v_click := null; end if;
  insert into rider_sources as r (user_id, answer, detail, utm_source, utm_medium, utm_campaign, click, platform, answered_at)
  values (me, v_answer, case when v_answer = 'other' then nullif(left(btrim(coalesce(p_detail, '')), 80), '') end,
          _clean_tag(p_utm ->> 'source', 60), _clean_tag(p_utm ->> 'medium', 60), _clean_tag(p_utm ->> 'campaign', 100),
          v_click, case when p_platform in ('ios', 'android', 'web') then p_platform end,
          case when v_answer is not null then now() end)
  on conflict (user_id) do update set
    answer = coalesce(excluded.answer, r.answer),
    detail = case when excluded.answer is not null then excluded.detail else r.detail end,
    answered_at = coalesce(excluded.answered_at, r.answered_at),
    utm_source = coalesce(r.utm_source, excluded.utm_source),
    utm_medium = coalesce(r.utm_medium, excluded.utm_medium),
    utm_campaign = coalesce(r.utm_campaign, excluded.utm_campaign),
    click = coalesce(r.click, excluded.click),
    platform = coalesce(r.platform, excluded.platform);
end;
$$;
revoke all on function set_my_found_us(text, text, jsonb, text) from public, anon;
grant execute on function set_my_found_us(text, text, jsonb, text) to authenticated;

-- Whether Home should still ask (no answer and no skip yet).
create or replace function my_found_us_answered()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from rider_sources where user_id = auth.uid() and answer is not null)
$$;
revoke all on function my_found_us_answered() from public, anon;
grant execute on function my_found_us_answered() to authenticated;

-- Admin: for riders who signed up in the period (test and admin accounts left out), the answers,
-- the website campaigns, and the "Other" write-ins.
create or replace function admin_found_us(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
begin
  perform require_admin();
  p_from := coalesce(p_from, '-infinity'); p_to := coalesce(p_to, 'infinity');
  with r as (
    select p.id, s.answer, s.detail, s.utm_source, s.utm_medium, s.utm_campaign, s.click
    from profiles p left join rider_sources s on s.user_id = p.id
    where p.created_at >= p_from and p.created_at < p_to and not admin_is_test_account(p.id)
  )
  select jsonb_build_object(
    'riders', (select count(*) from r),
    'answered', (select count(*) from r where answer is not null and answer <> 'skipped'),
    'skipped', (select count(*) from r where answer = 'skipped'),
    'answers', (select coalesce(jsonb_agg(jsonb_build_object('answer', answer, 'riders', n) order by n desc, answer), '[]')
                from (select answer, count(*) n from r where answer is not null and answer <> 'skipped' group by answer) a),
    'campaigns', (select coalesce(jsonb_agg(jsonb_build_object('source', src, 'medium', utm_medium, 'campaign', utm_campaign, 'riders', n)
                                            order by n desc, src), '[]')
                  from (select coalesce(utm_source, case click when 'meta' then 'facebook' else click end) src,
                               utm_medium, utm_campaign, count(*) n
                        from r where utm_source is not null or click is not null
                        group by 1, 2, 3) c),
    'other', (select coalesce(jsonb_agg(detail order by detail), '[]')
              from (select distinct detail from r where answer = 'other' and detail is not null limit 50) o)
  ) into v;
  return v;
end;
$$;
revoke all on function admin_found_us(timestamptz, timestamptz) from public, anon;
grant execute on function admin_found_us(timestamptz, timestamptz) to authenticated;
