-- 2.1 release test, whole-app pass 1 fixes. Same signatures as before, so every app build
-- already in riders' hands keeps working.
--
-- 1. referral_settle: only a ride that actually went live counts as the friend's first ride.
-- 2. bluetooth_relay_upload: an item with a time far out of range is skipped instead of failing
--    the whole upload.
-- 3. badge_leaderboard: builds rows (with their badges) only for the top of the board and you.
-- 4. feed_item_thread: "replying to" names a rider only when that reply is shown to you
--    (not hidden, and neither of you blocked the other).

create or replace function referral_settle(p_friend uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  r referrals;
  v_ride uuid;
begin
  select * into r from referrals where friend_id = p_friend and qualified_at is null for update;
  if not found then return false; end if;
  select x.id into v_ride
  from rides x
  where x.status = 'ended'
    and x.ended_at >= r.created_at
    and x.started_at is not null
    and x.ended_at - x.started_at >= make_interval(mins => (referral_rules() ->> 'min_ride_minutes')::int)
    and (x.organizer_id = p_friend
         or exists (select 1 from ride_members m where m.ride_id = x.id and m.user_id = p_friend and m.status = 'joined'))
  order by x.ended_at
  limit 1;
  if v_ride is null then return false; end if;
  update referrals set qualified_at = now(), ride_id = v_ride where id = r.id;
  perform referral_give_reward(r.friend_id, r.id, 'friend', r.referrer_id);
  perform referral_give_reward(r.referrer_id, r.id, 'referrer', r.friend_id);
  return true;
end;
$$;

create or replace function bluetooth_relay_upload(p_ride uuid, p_items jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_user uuid;
  v_key bytea;
  v_at bigint;
  v_lat bigint;
  v_lng bigint;
  v_acc bigint;
  v_speed bigint;
  v_heading bigint;
  v_text text;
  v_count integer := 0;
  v_n integer;
  v_flags integer;
  v_id uuid;
  v_body text;
  v_state integer;
  v_sender uuid;
begin
  if v_uid is null or not is_ride_member(p_ride, v_uid) then
    raise exception 'not a rider on this ride' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' then return 0; end if;

  for v_item in select value from jsonb_array_elements(p_items) limit 200 loop
    begin
      v_user := (v_item ->> 'user_id')::uuid;
      v_at := (v_item ->> 'at')::bigint;
      v_lat := (v_item ->> 'lat_e7')::bigint;
      v_lng := (v_item ->> 'lng_e7')::bigint;
      v_flags := coalesce((v_item ->> 'flags')::int, 0);
      v_id := null;
      if (v_item ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        v_id := (v_item ->> 'id')::uuid;
      end if;
    exception when others then
      continue;
    end;
    -- A phone uploads its own spots, taps, messages and receipts itself.
    continue when v_user is null or v_user = v_uid or v_at is null;
    -- Compared as seconds, so a time far out of range skips the item instead of failing the upload.
    continue when v_at > extract(epoch from now())::bigint + 300 or v_at < extract(epoch from now())::bigint - 86400;
    continue when not is_ride_member(p_ride, v_user);
    select rider_key into v_key from ride_member_bluetooth_keys where ride_id = p_ride and user_id = v_user;
    continue when v_key is null;

    if v_item ->> 'k' = 'p' then
      continue when v_lat is null or v_lng is null or abs(v_lat) > 900000000 or abs(v_lng) > 1800000000;
      begin
        v_acc := (v_item ->> 'accuracy_m')::bigint;
        v_speed := (v_item ->> 'speed_cms')::bigint;
        v_heading := (v_item ->> 'heading_dd')::bigint;
      exception when others then
        continue;
      end;
      v_text := 'p|' || p_ride || '|' || v_user || '|' || v_lat || '|' || v_lng || '|'
        || coalesce(v_acc::text, '') || '|' || coalesce(v_speed::text, '') || '|' || coalesce(v_heading::text, '') || '|' || v_at;
      continue when bluetooth_mac(v_key, v_text) <> lower(coalesce(v_item ->> 'mac', ''));
      -- Only while that rider is sharing with this ride, as for a spot they send themselves.
      continue when not exists (
        select 1 from location_shares s
        where s.user_id = v_user and s.scope = 'ride' and s.ride_id = p_ride and share_is_active(s)
      );
      insert into positions_latest (user_id, lat, lng, speed_mps, heading_deg, accuracy_m, recorded_at)
      values (v_user, v_lat / 1e7, v_lng / 1e7, v_speed / 100.0, v_heading / 10.0, v_acc, to_timestamp(v_at))
      on conflict (user_id) do update
        set lat = excluded.lat, lng = excluded.lng, speed_mps = excluded.speed_mps,
            heading_deg = excluded.heading_deg, accuracy_m = excluded.accuracy_m, recorded_at = excluded.recorded_at
        -- Never older than what the server already has (the rider's own phone may have sent a newer one).
        where positions_latest.recorded_at < excluded.recorded_at;
      get diagnostics v_n = row_count;
      v_count := v_count + v_n;

    elsif v_item ->> 'k' = 's' then
      continue when v_id is null;
      continue when (v_item ->> 'status') is null
        or not (v_item ->> 'status') = any (enum_range(null::rider_status_kind)::text[]);
      v_text := 's|' || p_ride || '|' || v_user || '|' || v_id || '|' || (v_item ->> 'status') || '|'
        || v_flags || '|' || coalesce(v_lat::text, '') || '|' || coalesce(v_lng::text, '') || '|' || v_at;
      continue when bluetooth_mac(v_key, v_text) <> lower(coalesce(v_item ->> 'mac', ''));
      -- The tap keeps the id the rider's phone gave it, so when that phone later sends it itself
      -- it counts as the same tap, never a second one.
      insert into rider_statuses (id, ride_id, user_id, status, lat, lng, tapped_at)
      values (v_id, p_ride, v_user, (v_item ->> 'status')::rider_status_kind,
              v_lat / 1e7, v_lng / 1e7, to_timestamp(v_at))
      on conflict (id) do nothing;
      get diagnostics v_n = row_count;
      v_count := v_count + v_n;

    elsif v_item ->> 'k' = 'r' then
      continue when v_id is null;
      v_body := v_item ->> 'body';
      continue when v_body is null or length(v_body) = 0 or length(v_body) > 500;
      v_text := 'r|' || p_ride || '|' || v_user || '|' || v_id || '|' || v_body || '|' || v_at;
      continue when bluetooth_mac(v_key, v_text) <> lower(coalesce(v_item ->> 'mac', ''));
      -- Already there (the sender's own phone, or another relay, got there first).
      continue when exists (select 1 from ride_messages where id = v_id);
      begin
        insert into ride_messages (id, ride_id, user_id, kind, body, sent_at)
        values (v_id, p_ride, v_user, 'status', v_body, to_timestamp(v_at));
        v_count := v_count + 1;
      exception when unique_violation or check_violation or raise_exception then
        -- A race with the sender's own send, or the chat's own limits (length, rate): skipped.
        continue;
      end;

    elsif v_item ->> 'k' = 'a' then
      continue when v_id is null;
      v_state := case when (v_item ->> 'state') ~ '^[0-9]{1,2}$' then (v_item ->> 'state')::integer end;
      continue when v_state is null or v_state not in (1, 2);
      v_text := 'a|' || p_ride || '|' || v_user || '|' || v_id || '|' || v_state || '|' || v_at;
      continue when bluetooth_mac(v_key, v_text) <> lower(coalesce(v_item ->> 'mac', ''));
      -- Only "seen" reaches the sender's card from the server, the way ack_ride_items does it.
      continue when v_state <> 2;
      select x.user_id into v_sender from (
        select s.user_id from rider_statuses s where s.id = v_id and s.ride_id = p_ride and s.cancelled_at is null
        union all
        select m.user_id from ride_messages m where m.id = v_id and m.ride_id = p_ride and m.kind = 'status'
      ) x limit 1;
      continue when v_sender is null or v_sender = v_user;
      insert into ride_receipts (item_id, user_id, ride_id, sender_id, seen_at)
      values (v_id, v_user, p_ride, v_sender, to_timestamp(v_at))
      on conflict (item_id, user_id) do update set seen_at = coalesce(ride_receipts.seen_at, excluded.seen_at)
        where ride_receipts.seen_at is null;
      get diagnostics v_n = row_count;
      v_count := v_count + v_n;
    end if;
  end loop;
  return v_count;
end $$;

revoke execute on function bluetooth_relay_upload(uuid, jsonb) from public, anon;
grant execute on function bluetooth_relay_upload(uuid, jsonb) to authenticated;

create or replace function badge_leaderboard(p_country text default null, p_state text default null, p_limit int default 50)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_country text := nullif(upper(btrim(coalesce(p_country, ''))), '');
  v_state text := nullif(upper(btrim(coalesce(p_state, ''))), '');
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_out jsonb;
begin
  if v_me is null then raise exception 'sign in first'; end if;
  if v_state is not null and v_country is null then raise exception 'pick a country first'; end if;
  with board as (
    select s.*, row_number() over (order by s.levels desc, s.gold desc, s.silver desc, s.reached_at asc, s.user_id) as place
    from leaderboard_standings() s
    where (v_country is null or s.country = v_country)
      and (v_state is null or s.state = v_state)
      and (s.user_id = v_me or not riders_blocked(v_me, s.user_id))
  ),
  shown as (
    select b.*, jsonb_build_object(
      'place', b.place, 'user_id', b.user_id,
      'name', coalesce(nullif(btrim(p.display_name), ''), 'Rider'),
      'levels', b.levels, 'gold', b.gold, 'silver', b.silver, 'bronze', b.bronze,
      'country', b.country, 'state', b.state, 'me', b.user_id = v_me,
      'badges', (
        select coalesce(jsonb_agg(jsonb_build_object('badge', x.badge, 'level', x.level) order by x.badge), '[]'::jsonb)
        from (select r.badge, max(r.level) as level from rider_badges r where r.user_id = b.user_id group by r.badge) x)
    ) as row
    from board b join profiles p on p.id = b.user_id
    -- Only the rows the answer holds: the top of the board and you.
    where b.place <= v_limit or b.user_id = v_me
  )
  select jsonb_build_object(
    'total', (select count(*) from board),
    'rows', coalesce((select jsonb_agg(row order by place) from shown where place <= v_limit), '[]'::jsonb),
    'me', (select row from shown where user_id = v_me))
  into v_out;
  return v_out;
end;
$$;

create or replace function feed_item_thread(p_key text)
returns table (
  id uuid, author_id uuid, author_name text, body text, at timestamptz, mine boolean, can_delete boolean,
  parent_id uuid, reply_to_name text, like_count int, liked boolean
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'sign in first'; end if;
  if not feed_can_interact(v_me, p_key) then return; end if;
  return query
  select c.id, c.author_id, coalesce(nullif(btrim(p.display_name), ''), 'Rider'), c.body, c.created_at,
         c.author_id = v_me, c.author_id = v_me or c.owner_id = v_me,
         c.parent_id,
         case when c.reply_to_id is not null and c.reply_to_id <> c.parent_id and rt.author_id <> c.author_id
                   and feed_comment_shown(v_me, rt)
              then coalesce(nullif(btrim(rp.display_name), ''), 'Rider') end,
         (select count(*)::int from feed_comment_likes l where l.comment_id = c.id and not riders_blocked(v_me, l.user_id)),
         exists (select 1 from feed_comment_likes l where l.comment_id = c.id and l.user_id = v_me)
  from feed_comments c
  join profiles p on p.id = c.author_id
  left join feed_comments rt on rt.id = c.reply_to_id
  left join profiles rp on rp.id = rt.author_id
  where c.item_key = p_key and feed_comment_shown(v_me, c)
  order by c.created_at
  limit 300;
end;
$$;
