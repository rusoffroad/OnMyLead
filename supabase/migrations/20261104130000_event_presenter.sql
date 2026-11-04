-- "Presented by RUS Offroad" event cards (2.1). The owner marks an event as presented (sponsored)
-- by RUS Offroad, or by any name he types, from Admin > Events. Every rider then sees a gold
-- "Presented by RUS Offroad" mark on the event's card in Events and on the event page, with
-- "Shop RUS Offroad" when the presenter is RUS Offroad. Hosts can't set it themselves: it is the
-- owner's call, like hiding an event, and is written to the Audit Log.
--
-- Additive only: two nullable columns, one new admin function, and the three readers
-- (event_detail, events_list, admin_events) gain keys older app builds ignore.

alter table rider_events add column if not exists presented_by text
  check (presented_by is null or char_length(btrim(presented_by)) between 2 and 60);
alter table rider_events add column if not exists presented_at timestamptz;

-- Set (a name) or clear (null / blank) who presents an event. Admin only, audited.
create or replace function admin_set_event_presenter(p_event uuid, p_presented_by text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb;
  v_name text := nullif(btrim(coalesce(p_presented_by, '')), '');
begin
  perform require_admin();
  if v_name is not null and char_length(v_name) not between 2 and 60 then
    raise exception 'the presenter name is 2 to 60 characters';
  end if;
  select jsonb_build_object('presented_by', presented_by, 'presented_at', presented_at) into v_before
  from rider_events where id = p_event for update;
  if v_before is null then raise exception 'event not found'; end if;
  update rider_events set presented_by = v_name, presented_at = case when v_name is null then null else now() end
  where id = p_event;
  perform log_admin_action(case when v_name is null then 'event.presenter.clear' else 'event.presenter.set' end, 'event', p_event::text,
          v_before, jsonb_build_object('presented_by', v_name));
end;
$$;
revoke execute on function admin_set_event_presenter(uuid, text) from public, anon;
grant execute on function admin_set_event_presenter(uuid, text) to authenticated;

-- The readers: same bodies as 20261102950000_events.sql plus presented_by.
create or replace function event_detail(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  e rider_events;
  v_host boolean;
begin
  e := event_for_caller(p_code);
  v_host := is_event_host(e.id, v_me);
  return jsonb_build_object(
    'id', e.id, 'share_code', e.share_code, 'title', e.title, 'details', e.details,
    'starts_at', e.starts_at, 'ends_at', e.ends_at,
    'location_name', e.location_name, 'location_address', e.location_address,
    'lat', e.area_lat, 'lng', e.area_lng, 'state', e.area_state, 'website_url', e.website_url,
    'visibility', e.visibility, 'status', e.status, 'hidden', e.hidden_at is not null,
    'hidden_reason', case when v_host then e.hidden_reason end,
    'presented_by', e.presented_by,
    'created_at', e.created_at, 'updated_at', e.updated_at,
    'am_owner', v_me is not null and e.owner_id = v_me,
    'am_host', v_host,
    'owner', event_person(e.owner_id),
    'hosts', case when v_me is null then '[]'::jsonb else coalesce((
      select jsonb_agg(event_person(h.user_id) order by h.created_at)
      from rider_event_hosts h where h.event_id = e.id and not riders_blocked(v_me, h.user_id)), '[]') end,
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object('id', ph.id, 'path', ph.path) order by ph.sort, ph.created_at)
      from rider_event_photos ph where ph.event_id = e.id), '[]'),
    'agenda', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind, 'title', a.title, 'starts_at', a.starts_at,
               'ends_at', a.ends_at, 'place', a.place, 'details', a.details) order by a.starts_at, a.created_at)
      from rider_event_agenda a where a.event_id = e.id), '[]'),
    'rides', coalesce((
      select jsonb_agg(x.j order by x.meet_at) from (
        select r.meet_at, jsonb_build_object(
          'ride_id', r.id, 'name', r.name, 'meet_at', r.meet_at, 'status', r.status, 'label', er.label,
          'meet_area_label', r.meet_area_label, 'visibility', r.visibility, 'join_policy', r.join_policy,
          'route_miles', r.route_miles, 'difficulty', r.difficulty,
          'invite_code', case when r.visibility <> 'private' or v_host or is_ride_member(r.id, v_me, '{joined,pending,waitlisted,invited}')
                              or r.organizer_id = v_me then r.invite_code end,
          'going', (select coalesce(sum(m.riders), 0) from ride_members m where m.ride_id = r.id and m.status = 'joined'),
          'manager', event_person(er.manager_id),
          'my_status', (select m.status from ride_members m where m.ride_id = r.id and m.user_id = v_me),
          'i_manage', v_me is not null and is_ride_manager(r.id, v_me)) as j
        from rider_event_rides er join rides r on r.id = er.ride_id
        where er.event_id = e.id
      ) x), '[]'),
    'rsvp', jsonb_build_object(
      'going', (select count(*) from rider_event_rsvps where event_id = e.id and status = 'going'),
      'interested', (select count(*) from rider_event_rsvps where event_id = e.id and status = 'interested'),
      'mine', (select status from rider_event_rsvps where event_id = e.id and user_id = v_me)),
    'going_riders', case when v_me is null then '[]'::jsonb else coalesce((
      select jsonb_agg(event_person(x.user_id) order by x.created_at) from (
        select v.user_id, v.created_at from rider_event_rsvps v
        where v.event_id = e.id and v.status = 'going' and not riders_blocked(v_me, v.user_id)
        order by v.created_at limit 60) x), '[]') end);
end;
$$;

create or replace function events_list(p_scope text default 'upcoming', p_lat double precision default null,
                                       p_lng double precision default null, p_miles int default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  return coalesce((
    select jsonb_agg(x.j order by x.ord, x.starts_at) from (
      select e.starts_at,
        case when p_scope = 'mine' and e.ends_at < now() then 1 else 0 end as ord,
        jsonb_build_object(
          'id', e.id, 'share_code', e.share_code, 'title', e.title, 'starts_at', e.starts_at, 'ends_at', e.ends_at,
          'location_name', e.location_name, 'state', e.area_state, 'lat', e.area_lat, 'lng', e.area_lng,
          'status', e.status, 'visibility', e.visibility, 'hidden', e.hidden_at is not null,
          'presented_by', e.presented_by,
          'cover_path', (select ph.path from rider_event_photos ph where ph.event_id = e.id order by ph.sort, ph.created_at limit 1),
          'going', (select count(*) from rider_event_rsvps v where v.event_id = e.id and v.status = 'going'),
          'rides', (select count(*) from rider_event_rides er where er.event_id = e.id),
          'agenda', (select count(*) from rider_event_agenda a where a.event_id = e.id),
          'mine', (select v.status from rider_event_rsvps v where v.event_id = e.id and v.user_id = v_me),
          'i_host', is_event_host(e.id, v_me),
          'distance_mi', case when p_lat is not null and p_lng is not null and e.area_lat is not null then
            round((3958.8 * 2 * asin(sqrt(power(sin(radians(e.area_lat - p_lat) / 2), 2)
              + cos(radians(p_lat)) * cos(radians(e.area_lat)) * power(sin(radians(e.area_lng - p_lng) / 2), 2))))::numeric) end
        ) as j
      from rider_events e
      where case when p_scope = 'mine' then
              v_me is not null and e.ends_at > now() - interval '30 days' and event_seen_by(e, v_me)
              and (is_event_host(e.id, v_me) or exists (select 1 from rider_event_rsvps v where v.event_id = e.id and v.user_id = v_me))
            else
              e.visibility = 'public' and e.hidden_at is null and e.status = 'scheduled' and e.ends_at > now()
              and (v_me is null or not riders_blocked(v_me, e.owner_id))
              and (p_miles is null or p_miles <= 0 or p_lat is null or p_lng is null or (e.area_lat is not null and
                3958.8 * 2 * asin(sqrt(power(sin(radians(e.area_lat - p_lat) / 2), 2)
                  + cos(radians(p_lat)) * cos(radians(e.area_lat)) * power(sin(radians(e.area_lng - p_lng) / 2), 2))) <= p_miles))
            end
      order by e.starts_at
      limit 200
    ) x), '[]');
end;
$$;

create or replace function admin_events(p_filter text default 'all', p_page int default 0, p_page_size int default 50)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_rows jsonb; v_total bigint;
begin
  perform require_admin();
  p_page_size := least(greatest(coalesce(p_page_size, 50), 1), 200);
  p_page := greatest(coalesce(p_page, 0), 0);
  with f as (
    select e.id, e.share_code, e.title, e.starts_at, e.ends_at, e.location_name, e.area_state as state, e.visibility,
           e.status, e.hidden_at, e.hidden_reason, e.presented_by, e.presented_at, e.created_at, e.owner_id, p.display_name as owner_name,
           (select count(*) from rider_event_rsvps v where v.event_id = e.id and v.status = 'going') as going,
           (select count(*) from rider_event_rides er where er.event_id = e.id) as rides,
           (select count(*) from rider_event_photos ph where ph.event_id = e.id) as photos,
           (select count(*) from reports x where x.event_id = e.id) as reports,
           (select count(*) from reports x where x.event_id = e.id and x.status in ('open', 'reviewing')) as open_reports
    from rider_events e left join profiles p on p.id = e.owner_id
    where case coalesce(p_filter, 'all')
      when 'reported' then exists (select 1 from reports x where x.event_id = e.id)
      when 'hidden' then e.hidden_at is not null
      when 'presented' then e.presented_by is not null
      when 'upcoming' then e.ends_at > now()
      else true end
  )
  select (select count(*) from f),
         coalesce((select jsonb_agg(to_jsonb(x) order by x.open_reports desc, x.created_at desc) from (
           select * from f order by open_reports desc, created_at desc offset p_page * p_page_size limit p_page_size) x), '[]')
    into v_total, v_rows;
  return jsonb_build_object('rows', v_rows, 'total', v_total);
end;
$$;
