-- OnMyLead Founder: a second badge OnMyLead gives (Chris, 2026-11-03: "make me a badge for
-- OnMyLead Founder and attach it to my profile").
--
-- Works exactly like Brand Ambassador (migration 20261103700000_brand_ambassador.sql): key
-- 'founder', always level 1, given and taken back only with admin_grant_badge /
-- admin_revoke_badge, audit-logged, one push on grant, never earned by riding. Older app builds
-- drop the unknown key, so they just don't show it.
--
-- Additive only: a wider check on rider_badges.badge, the honor list gains 'founder', and
-- badge_push_text() keeps the same text for every other badge.

alter table rider_badges drop constraint if exists rider_badges_badge_check;
alter table rider_badges add constraint rider_badges_badge_check
  check (badge in ('trail_boss', 'tail_gunner', 'crew_rider', 'mile_eater', 'trailblazer', 'mapmaker', 'trail_scout', 'ambassador', 'founder'));
alter table rider_badges drop constraint if exists rider_badges_honor_level;
alter table rider_badges add constraint rider_badges_honor_level check (badge not in ('ambassador', 'founder') or level = 1);

create or replace function honor_badges()
returns setof text language sql immutable set search_path = public as $$
  values ('ambassador'), ('founder')
$$;

create or replace function badge_push_text(p_badge text, p_level int, p_count int, out title text, out body text)
language sql immutable set search_path = public as $$
  select
    case when p_count > 1 then 'You Earned ' || p_count || ' New Badges'
         when n.honor then n.honor_title
         else 'New Badge: ' || n.name || ' ' || (array['Bronze', 'Silver', 'Gold'])[p_level] end,
    case when p_count > 1 then 'Including ' || n.name || case when n.honor then '' else ' ' || (array['Bronze', 'Silver', 'Gold'])[p_level] end || '. See them on the You tab.'
         else n.how || ' See it on the You tab.' end
  from (values
    ('trail_boss', 'Trail Boss', 'For leading rides.', false, null),
    ('tail_gunner', 'Tail Gunner', 'For riding at the rear so nobody gets left behind.', false, null),
    ('crew_rider', 'Crew Rider', 'For riding with a group.', false, null),
    ('mile_eater', 'Mile Eater', 'For the miles you have ridden.', false, null),
    ('trailblazer', 'Trailblazer', 'For sharing trails with every rider.', false, null),
    ('mapmaker', 'Mapmaker', 'Riders rated your trails accurate.', false, null),
    ('trail_scout', 'Trail Scout', 'For rating trails so others know what to expect.', false, null),
    ('ambassador', 'Brand Ambassador', 'Thanks for representing OnMyLead. Your badge now shows beside your name.', true, 'You''re an OnMyLead Brand Ambassador'),
    ('founder', 'OnMyLead Founder', 'You started OnMyLead. Your badge now shows beside your name.', true, 'You''re the OnMyLead Founder')
  ) as n(key, name, how, honor, honor_title)
  where n.key = p_badge;
$$;
