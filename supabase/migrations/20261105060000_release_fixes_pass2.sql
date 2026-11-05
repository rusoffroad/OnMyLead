-- 2.1 release test, whole-app pass 2 fixes. Same signatures as before, so every app build already
-- in riders' hands keeps working.
--
-- 1. claim_referral_reward: a reward set to move a Google Play bill back, where the subscription
--    ended before the move happened, can be claimed again (the Play offer, or an Apple code)
--    instead of staying stuck.
-- 2. Shared waypoint push: once per waypoint, as 20261104150000 says. Switching a waypoint between
--    Just Me and Everyone on the Ride again no longer pushes everyone again.

create or replace function claim_referral_reward(p_store text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  w referral_rewards;
  v_code text;
  v_rules jsonb := referral_rules();
begin
  if v_me is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if p_store not in ('apple', 'google') then raise exception 'store must be apple or google'; end if;
  select * into w from referral_rewards where user_id = v_me for update;
  if not found then return jsonb_build_object('error', 'no_reward'); end if;
  if w.claimed_at is null and w.expires_at <= now() then return jsonb_build_object('error', 'expired'); end if;
  if w.redeemed_at is not null and w.claim_kind = 'google_offer' then return jsonb_build_object('error', 'used'); end if;

  -- Claimed before: hand back the same thing (the Apple code again, or the Play offer again
  -- until the rider buys it).
  if w.claim_kind = 'apple_code' then
    if p_store <> 'apple' then return jsonb_build_object('error', 'claimed_on_other_store', 'store', 'apple'); end if;
    return jsonb_build_object('kind', 'apple_code', 'code', w.apple_code,
      'url', 'https://apps.apple.com/redeem?ctx=offercodes&id=' || (v_rules ->> 'apple_app_id') || '&code=' || w.apple_code);
  elsif w.claim_kind = 'google_defer'
        and not (w.redeemed_at is null and w.deferred_at is null and referral_play_token(v_me) is null) then
    return jsonb_build_object('kind', 'google_defer', 'deferred_at', w.deferred_at);
  -- A deferral that never happened, for a Google Play subscription that has since ended: there's
  -- nothing left to move, so the reward is claimed afresh below (the offer, or an Apple code).
  elsif w.claim_kind = 'google_offer' and p_store = 'apple' then
    return jsonb_build_object('error', 'claimed_on_other_store', 'store', 'google');
  elsif w.claim_kind = 'google_offer' and p_store = 'google' then
    return jsonb_build_object('kind', 'google_offer', 'offer_id', v_rules ->> 'google_offer_id');
  end if;

  if p_store = 'apple' then
    select c.code into v_code from referral_offer_codes c
    where c.assigned_at is null and c.environment = 'Production' and c.expires_on > current_date
    order by c.expires_on, c.added_at
    limit 1
    for update skip locked;
    if v_code is null then return jsonb_build_object('error', 'no_codes'); end if;
    update referral_offer_codes set assigned_to = v_me, assigned_at = now() where code = v_code;
    update referral_rewards set claimed_at = now(), claim_store = 'apple', claim_kind = 'apple_code', apple_code = v_code
    where id = w.id;
    return jsonb_build_object('kind', 'apple_code', 'code', v_code,
      'url', 'https://apps.apple.com/redeem?ctx=offercodes&id=' || (v_rules ->> 'apple_app_id') || '&code=' || v_code);
  end if;

  if referral_play_token(v_me) is not null then
    -- The referral-defer Edge Function does the deferral and sets deferred_at.
    update referral_rewards set claimed_at = coalesce(claimed_at, now()), claim_store = 'google', claim_kind = 'google_defer'
    where id = w.id;
    return jsonb_build_object('kind', 'google_defer', 'deferred_at', null);
  end if;
  update referral_rewards set claimed_at = coalesce(claimed_at, now()), claim_store = 'google', claim_kind = 'google_offer'
  where id = w.id;
  return jsonb_build_object('kind', 'google_offer', 'offer_id', v_rules ->> 'google_offer_id');
end;
$$;

create table if not exists ride_waypoint_alerts (
  waypoint_id uuid primary key references ride_waypoints (id) on delete cascade,
  pushed_at timestamptz not null default now()
);
alter table ride_waypoint_alerts enable row level security;
revoke all on ride_waypoint_alerts from public, anon, authenticated;

create or replace function ride_waypoints_alert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.shared
     and (tg_op = 'INSERT' or not old.shared)
     and exists (select 1 from rides r where r.id = new.ride_id and r.status = 'live') then
    insert into ride_waypoint_alerts (waypoint_id) values (new.id) on conflict (waypoint_id) do nothing;
    if found then
      perform queue_push(jsonb_build_object('type', 'waypoint', 'id', new.id));
    end if;
  end if;
  return null;
exception when others then
  -- Never stop the save because of the push.
  raise warning 'ride_waypoints_alert: %', sqlerrm;
  return null;
end;
$$;
revoke execute on function ride_waypoints_alert() from public, anon, authenticated;
