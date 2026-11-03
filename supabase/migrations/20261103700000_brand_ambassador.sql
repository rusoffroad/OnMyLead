-- Brand Ambassador: a badge OnMyLead gives, never earned by riding.
-- Chris (2026-11-03) wanted a badge for the riders in the OnMyLead Ambassador program (friends with
-- lifetime Complimentary Pro) that he can give out and take back later from the Admin Dashboard.
--
-- * It lives in rider_badges like every other badge (key 'ambassador', always level 1), so it
--   shows beside rider names, on the Feed and on profiles through the same reads as today.
-- * Only an admin with the authenticator code can give or take it back (admin_grant_badge,
--   admin_revoke_badge). Both are written to the audit log. award_rider_badges() never touches
--   it: badge_levels() has no 'ambassador' row. Who gave it is in admin_audit_log, not on the
--   badge row, because every signed-in rider can read rider_badges.
-- * Giving it sends one push ("account" notifications, like other badges) and it shows as New on
--   the You tab until the rider has seen it.
-- * App builds from before 2.0's badge update drop badge keys they don't know (parseBadgeRows), so
--   older iPhone and Android builds simply don't show it. Nothing is renamed or dropped.
--
-- Additive only: a wider check on rider_badges.badge, new admin functions and
-- a badge_push_text() that still returns exactly the same text for every earned badge.

-- ---------------------------------------------------------------------------
-- The table accepts the new key; honors have one level.
-- ---------------------------------------------------------------------------
do $$
declare
  c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.rider_badges'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%trail_boss%'
  loop
    execute format('alter table rider_badges drop constraint %I', c);
  end loop;
end $$;
alter table rider_badges add constraint rider_badges_badge_check
  check (badge in ('trail_boss', 'tail_gunner', 'crew_rider', 'mile_eater', 'trailblazer', 'mapmaker', 'trail_scout', 'ambassador'));
alter table rider_badges drop constraint if exists rider_badges_honor_level;
alter table rider_badges add constraint rider_badges_honor_level check (badge <> 'ambassador' or level = 1);

-- The badges an admin can give.
create or replace function honor_badges()
returns setof text language sql immutable set search_path = public as $$
  values ('ambassador')
$$;

-- ---------------------------------------------------------------------------
-- Push text: unchanged for earned badges, plus the honor (no Bronze/Silver/Gold in its name).
-- ---------------------------------------------------------------------------
create or replace function badge_push_text(p_badge text, p_level int, p_count int, out title text, out body text)
language sql immutable set search_path = public as $$
  select
    case when p_count > 1 then 'You Earned ' || p_count || ' New Badges'
         when n.honor then 'You''re an OnMyLead ' || n.name
         else 'New Badge: ' || n.name || ' ' || (array['Bronze', 'Silver', 'Gold'])[p_level] end,
    case when p_count > 1 then 'Including ' || n.name || case when n.honor then '' else ' ' || (array['Bronze', 'Silver', 'Gold'])[p_level] end || '. See them on the You tab.'
         else n.how || ' See it on the You tab.' end
  from (values
    ('trail_boss', 'Trail Boss', 'For leading rides.', false),
    ('tail_gunner', 'Tail Gunner', 'For riding at the rear so nobody gets left behind.', false),
    ('crew_rider', 'Crew Rider', 'For riding with a group.', false),
    ('mile_eater', 'Mile Eater', 'For the miles you have ridden.', false),
    ('trailblazer', 'Trailblazer', 'For sharing trails with every rider.', false),
    ('mapmaker', 'Mapmaker', 'Riders rated your trails accurate.', false),
    ('trail_scout', 'Trail Scout', 'For rating trails so others know what to expect.', false),
    ('ambassador', 'Brand Ambassador', 'Thanks for representing OnMyLead. Your badge now shows beside your name.', true)
  ) as n(key, name, how, honor)
  where n.key = p_badge;
$$;

-- ---------------------------------------------------------------------------
-- Admin Dashboard.
-- ---------------------------------------------------------------------------
-- Give a rider an honor. Returns false when they already have it (nothing changes).
create or replace function admin_grant_badge(p_user uuid, p_badge text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_new int;
begin
  perform require_admin();
  if p_badge is null or p_badge not in (select honor_badges()) then raise exception 'that badge can only be earned by riding'; end if;
  if not exists (select 1 from profiles where id = p_user) then raise exception 'rider not found'; end if;
  insert into rider_badges (user_id, badge, level)
  values (p_user, p_badge, 1)
  on conflict do nothing;
  get diagnostics v_new = row_count;
  if v_new = 0 then return false; end if;
  perform log_admin_action('badge.grant', 'user', p_user::text, null, jsonb_build_object('badge', p_badge));
  perform queue_push(jsonb_build_object('type', 'badge', 'user', p_user, 'badge', p_badge, 'level', 1, 'count', 1));
  return true;
end;
$$;

-- Take an honor back. Returns false when they didn't have it.
create or replace function admin_revoke_badge(p_user uuid, p_badge text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  b rider_badges;
begin
  perform require_admin();
  if p_badge is null or p_badge not in (select honor_badges()) then raise exception 'that badge can only be earned by riding'; end if;
  delete from rider_badges where user_id = p_user and badge = p_badge returning * into b;
  if not found then return false; end if;
  perform log_admin_action('badge.revoke', 'user', p_user::text, to_jsonb(b), null);
  return true;
end;
$$;

-- One rider's badges, earned and given, for their Admin page.
create or replace function admin_user_badges(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'badge', badge, 'level', level, 'earned_at', earned_at
    ) order by earned_at), '[]'::jsonb)
    from rider_badges where user_id = p_user
  );
end;
$$;

-- Everyone who holds an honor, newest first, for Admin > Users > Brand Ambassadors.
create or replace function admin_badge_holders(p_badge text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  if p_badge is null or p_badge not in (select honor_badges()) then raise exception 'unknown badge'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'user_id', b.user_id, 'display_name', p.display_name, 'email', u.email, 'granted_at', b.earned_at
    ) order by b.earned_at desc), '[]'::jsonb)
    from rider_badges b
    join profiles p on p.id = b.user_id
    left join auth.users u on u.id = b.user_id
    where b.badge = p_badge
  );
end;
$$;

revoke execute on function admin_grant_badge(uuid, text), admin_revoke_badge(uuid, text),
  admin_user_badges(uuid), admin_badge_holders(text) from public, anon;
grant execute on function admin_grant_badge(uuid, text), admin_revoke_badge(uuid, text),
  admin_user_badges(uuid), admin_badge_holders(text) to authenticated;
