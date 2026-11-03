-- Refer a friend (Chris 2026-11-03: "when someone refers the app to another person, they both get
-- 50% off a pro rider subscription"). Design: claude.ai/artifact/PzGJ12eWUkZCEvTVv6HBgz.
--
-- How it works, the same on iPhone, iPad, Android phones and tablets, and onmylead.com:
--   1. A rider shares their friend link (onmylead.com/friend/<code>, the link Friends already
--      uses). A brand-new account that opens it (or signs up right after opening it) calls
--      claim_referral(code), which records who invited them.
--   2. When the friend finishes their first ride (a ride that was live for at least 10 minutes and
--      ended after the invite), a trigger on rides marks the referral qualified and gives both
--      riders a reward: Pro Annual at 50% off for the first year, claimable for 6 months.
--   3. claim_referral_reward(store) hands out the discount the store way, never as free Pro from
--      this database (Apple guideline 3.1.1 forbids unlocking Pro outside in-app purchase):
--        * apple  -> one one-time Apple offer code from referral_offer_codes (the owner uploads
--                    batches made in App Store Connect), opened as Apple's redeem link.
--        * google -> the Google Play developer-determined offer 'referral-50' on the annual base
--                    plan; the app only shows it to riders this function says may buy it. A rider
--                    already paying through Google Play gets their next bill pushed back 6 months
--                    instead (referral-defer Edge Function), since Play offers are for new
--                    purchases only.
--   Each rider gets one reward, ever (Apple allows one code per person per offer). More invites
--   still show on their Invite Friends list.
--
-- The program is off until the owner turns it on in Admin > Settings (flag 'referrals'), after
-- the store offers exist. Rewards already earned stay claimable if it is switched off later.
--
-- Additive only: three new tables, new functions, one trigger on rides that never blocks a ride
-- from ending, and a new 'referrals' flag set to false. Older app builds keep working: they never
-- call these. Safe to run more than once.

create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references profiles (id) on delete cascade,
  friend_id uuid not null unique references profiles (id) on delete cascade,
  code text not null,
  created_at timestamptz not null default now(),
  qualified_at timestamptz,
  ride_id uuid references rides (id) on delete set null,
  check (referrer_id <> friend_id)
);
create index if not exists referrals_referrer_idx on referrals (referrer_id, created_at desc);

create table if not exists referral_rewards (
  id uuid primary key default gen_random_uuid(),
  -- One reward per rider, ever.
  user_id uuid not null unique references profiles (id) on delete cascade,
  referral_id uuid not null references referrals (id) on delete cascade,
  role text not null check (role in ('referrer', 'friend')),
  earned_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  claim_store text check (claim_store in ('apple', 'google')),
  -- How it was handed out: an Apple code, the Google Play offer, or a Google Play billing deferral.
  claim_kind text check (claim_kind in ('apple_code', 'google_offer', 'google_defer')),
  apple_code text,
  deferred_at timestamptz,
  redeemed_at timestamptz
);

create table if not exists referral_offer_codes (
  code text primary key check (code ~ '^[A-Z0-9]{6,64}$'),
  batch text not null,
  environment text not null default 'Production' check (environment in ('Production', 'Sandbox')),
  expires_on date not null,
  added_at timestamptz not null default now(),
  added_by uuid,
  assigned_to uuid references profiles (id) on delete set null,
  assigned_at timestamptz
);
create index if not exists referral_offer_codes_free_idx on referral_offer_codes (expires_on) where assigned_at is null;

alter table referrals enable row level security;
alter table referral_rewards enable row level security;
alter table referral_offer_codes enable row level security;
-- No policies: riders read and change these only through the functions below.
revoke all on referrals, referral_rewards, referral_offer_codes from anon, authenticated;

-- Off until the owner switches it on, so riders never see an offer the stores don't have yet.
update app_settings set value = value || '{"referrals": false}'::jsonb
where key = 'flags' and jsonb_typeof(value) = 'object' and not (value ? 'referrals');

-- The rules, in one place (mirrored in app/src/core/referrals.ts).
create or replace function referral_rules()
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'new_account_days', 7,        -- a friend's account must be at most this old to be referred
    'min_ride_minutes', 10,       -- the first ride must have been live this long
    'reward_days', 182,           -- a reward can be claimed for about 6 months
    'defer_days', 182,            -- Google Play subscribers: next bill pushed back this long
    'apple_app_id', '6822352321',
    'google_offer_id', 'referral-50'
  );
$$;

create or replace function referrals_on()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((setting('flags') ->> 'referrals')::boolean, false);
$$;

-- ---------------------------------------------------------------------------
-- 1. A new rider records who invited them.
-- ---------------------------------------------------------------------------
create or replace function claim_referral(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_owner uuid;
  v_created timestamptz;
begin
  if v_me is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if not referrals_on() then return 'off'; end if;
  if exists (select 1 from referrals where friend_id = v_me) then return 'already'; end if;
  select c.user_id into v_owner from friend_codes c where c.code = v_code;
  if v_owner is null then return 'not_found'; end if;
  if v_owner = v_me then return 'self'; end if;
  select coalesce(u.created_at, p.created_at) into v_created
  from profiles p left join auth.users u on u.id = p.id where p.id = v_me;
  if v_created is null or v_created < now() - make_interval(days => (referral_rules() ->> 'new_account_days')::int) then
    return 'not_new';
  end if;
  -- Someone who invited this rider earlier can't be invited back by them.
  if exists (select 1 from referrals where referrer_id = v_me and friend_id = v_owner) then return 'self'; end if;
  insert into referrals (referrer_id, friend_id, code) values (v_owner, v_me, v_code)
  on conflict (friend_id) do nothing;
  return 'linked';
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. A friend's first ride earns both rewards.
-- ---------------------------------------------------------------------------
create or replace function referral_give_reward(p_user uuid, p_referral uuid, p_role text, p_other uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  insert into referral_rewards (user_id, referral_id, role, expires_at)
  values (p_user, p_referral, p_role, now() + make_interval(days => (referral_rules() ->> 'reward_days')::int))
  on conflict (user_id) do nothing;
  if not found then return; end if;
  select nullif(btrim(display_name), '') into v_name from profiles where id = p_other;
  -- Inbox only (no push): "You earned 50% off Pro Annual". Never undoes the reward.
  begin
  insert into rider_notifications (user_id, kind, title, body, data)
  values (
    p_user, 'referral', 'You Earned 50% Off Pro Annual',
    case when p_role = 'referrer'
      then coalesce(v_name, 'Your friend') || ' finished their first ride. Claim your discount on the Invite Friends screen.'
      else 'Thanks for riding with ' || coalesce(v_name, 'your friend') || '. Claim your discount on the Invite Friends screen.' end,
    jsonb_build_object('type', 'referral')
  );
  exception when others then
    raise warning 'referral_give_reward inbox: %', sqlerrm;
  end;
end;
$$;

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
    and x.ended_at - coalesce(x.started_at, x.meet_at) >= make_interval(mins => (referral_rules() ->> 'min_ride_minutes')::int)
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

create or replace function referrals_on_ride_end()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_friend uuid;
begin
  for v_friend in
    select f.friend_id from referrals f
    where f.qualified_at is null
      and (f.friend_id = new.organizer_id
           or exists (select 1 from ride_members m where m.ride_id = new.id and m.user_id = f.friend_id and m.status = 'joined'))
  loop
    perform referral_settle(v_friend);
  end loop;
  return null;
exception when others then
  -- Never stop a ride from ending.
  raise warning 'referrals_on_ride_end: %', sqlerrm;
  return null;
end;
$$;
drop trigger if exists referrals_on_ride_end on rides;
create trigger referrals_on_ride_end after update of status on rides
  for each row when (new.status = 'ended' and old.status is distinct from 'ended')
  execute function referrals_on_ride_end();

-- ---------------------------------------------------------------------------
-- 3. What the Invite Friends screen and the Pro screen show.
-- ---------------------------------------------------------------------------
create or replace function my_referrals()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_code text;
  w referral_rewards;
  v_from text;
begin
  if v_me is null then raise exception 'sign in first' using errcode = '42501'; end if;
  -- A friend whose first ride ended before this ran (or before the trigger existed).
  perform referral_settle(v_me);
  insert into friend_codes (user_id) values (v_me) on conflict (user_id) do nothing;
  select code into v_code from friend_codes where user_id = v_me;
  select * into w from referral_rewards where user_id = v_me;
  if found then
    select nullif(btrim(p.display_name), '') into v_from
    from referrals f join profiles p on p.id = case when w.role = 'referrer' then f.friend_id else f.referrer_id end
    where f.id = w.referral_id;
  end if;
  return jsonb_build_object(
    'enabled', referrals_on(),
    'code', v_code,
    'rules', referral_rules(),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', coalesce(nullif(btrim(p.display_name), ''), 'Rider'),
        'joined_at', f.created_at,
        'rode_at', f.qualified_at
      ) order by f.created_at desc)
      from (select * from referrals where referrer_id = v_me order by created_at desc limit 50) f
      join profiles p on p.id = f.friend_id
    ), '[]'::jsonb),
    'invited', (select count(*) from referrals where referrer_id = v_me),
    'rode', (select count(*) from referrals where referrer_id = v_me and qualified_at is not null),
    'invited_by', (
      select jsonb_build_object('name', coalesce(nullif(btrim(p.display_name), ''), 'Rider'), 'rode_at', f.qualified_at)
      from referrals f join profiles p on p.id = f.referrer_id where f.friend_id = v_me
    ),
    'reward', case when w.id is null then null else jsonb_build_object(
      'role', w.role,
      'from', coalesce(v_from, 'Rider'),
      'earned_at', w.earned_at,
      'expires_at', w.expires_at,
      'claimed_at', w.claimed_at,
      'claim_store', w.claim_store,
      'claim_kind', w.claim_kind,
      'apple_code', w.apple_code,
      'deferred_at', w.deferred_at,
      'redeemed_at', w.redeemed_at
    ) end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Claiming the reward the store way.
-- ---------------------------------------------------------------------------
-- Pro billed by Google Play right now (running, grace, or paused): Play offers are for new
-- purchases, so this rider gets a deferral instead.
create or replace function referral_play_token(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select s.purchase_token from play_subscriptions s
  where s.user_id = p_user and s.status in ('active', 'grace', 'paused')
    and (s.expires_at is null or s.expires_at > now())
  order by s.expires_at desc nulls last
  limit 1;
$$;

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
  elsif w.claim_kind = 'google_defer' then
    return jsonb_build_object('kind', 'google_defer', 'deferred_at', w.deferred_at);
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

-- Called by the referral-defer Edge Function (service role) once Google Play accepted the
-- deferral; also returns the purchase token and product it needs.
create or replace function referral_defer_target(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('reward_id', w.id, 'deferred_at', w.deferred_at, 'purchase_token', s.purchase_token,
                            'product_id', s.product_id, 'expires_at', s.expires_at, 'defer_days', (referral_rules() ->> 'defer_days')::int)
  from referral_rewards w
  left join play_subscriptions s on s.purchase_token = referral_play_token(p_user)
  where w.user_id = p_user and w.claim_kind = 'google_defer';
$$;

create or replace function referral_mark_deferred(p_user uuid, p_new_expiry timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  update referral_rewards set deferred_at = now(), redeemed_at = now()
  where user_id = p_user and claim_kind = 'google_defer' and deferred_at is null;
  update play_subscriptions set expires_at = p_new_expiry, updated_at = now()
  where purchase_token = referral_play_token(p_user) and (expires_at is null or expires_at < p_new_expiry);
end;
$$;

-- A Google Play purchase of the referral offer (play-verify and play-notifications store the
-- offer id) marks the Google reward used, so the offer isn't shown again.
create or replace function referral_mark_play_redeemed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null and new.offer_id = (referral_rules() ->> 'google_offer_id') then
    update referral_rewards set redeemed_at = coalesce(redeemed_at, now())
    where user_id = new.user_id and claim_kind = 'google_offer';
  end if;
  return null;
exception when others then
  raise warning 'referral_mark_play_redeemed: %', sqlerrm;
  return null;
end;
$$;
drop trigger if exists referral_mark_play_redeemed on play_subscriptions;
create trigger referral_mark_play_redeemed after insert or update of offer_id, user_id on play_subscriptions
  for each row execute function referral_mark_play_redeemed();

-- ---------------------------------------------------------------------------
-- 5. Admin > Referrals.
-- ---------------------------------------------------------------------------
create or replace function admin_referrals()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  return jsonb_build_object(
    'enabled', referrals_on(),
    'rules', referral_rules(),
    'totals', jsonb_build_object(
      'invited', (select count(*) from referrals),
      'rode', (select count(*) from referrals where qualified_at is not null),
      'rewards', (select count(*) from referral_rewards),
      'claimed_apple', (select count(*) from referral_rewards where claim_kind = 'apple_code'),
      'claimed_google', (select count(*) from referral_rewards where claim_kind = 'google_offer'),
      'deferred_google', (select count(*) from referral_rewards where claim_kind = 'google_defer'),
      'redeemed', (select count(*) from referral_rewards where redeemed_at is not null),
      'expired', (select count(*) from referral_rewards where claimed_at is null and expires_at <= now())
    ),
    'codes', jsonb_build_object(
      'left', (select count(*) from referral_offer_codes where assigned_at is null and environment = 'Production' and expires_on > current_date),
      'expiring_soon', (select count(*) from referral_offer_codes where assigned_at is null and environment = 'Production' and expires_on > current_date and expires_on <= current_date + 30),
      'given', (select count(*) from referral_offer_codes where assigned_at is not null),
      'batches', coalesce((
        select jsonb_agg(b order by b ->> 'added_at' desc) from (
          select jsonb_build_object('batch', batch, 'environment', environment, 'added_at', min(added_at), 'expires_on', min(expires_on),
                                    'total', count(*), 'given', count(assigned_at)) b
          from referral_offer_codes group by batch, environment
        ) x
      ), '[]'::jsonb)
    ),
    'top', coalesce((
      select jsonb_agg(t order by (t ->> 'invited')::int desc) from (
        select jsonb_build_object('user_id', f.referrer_id, 'name', coalesce(nullif(btrim(p.display_name), ''), 'Rider'),
                                  'invited', count(*), 'rode', count(f.qualified_at)) t
        from referrals f join profiles p on p.id = f.referrer_id
        group by f.referrer_id, p.display_name
        order by count(*) desc limit 20
      ) y
    ), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(r order by r ->> 'created_at' desc) from (
        select jsonb_build_object(
          'id', f.id, 'created_at', f.created_at, 'qualified_at', f.qualified_at,
          'referrer_id', f.referrer_id, 'referrer', coalesce(nullif(btrim(a.display_name), ''), 'Rider'),
          'friend_id', f.friend_id, 'friend', coalesce(nullif(btrim(b.display_name), ''), 'Rider'),
          'referrer_reward', (select jsonb_build_object('claim_kind', w.claim_kind, 'claimed_at', w.claimed_at, 'redeemed_at', w.redeemed_at)
                              from referral_rewards w where w.referral_id = f.id and w.role = 'referrer'),
          'friend_reward', (select jsonb_build_object('claim_kind', w.claim_kind, 'claimed_at', w.claimed_at, 'redeemed_at', w.redeemed_at)
                            from referral_rewards w where w.referral_id = f.id and w.role = 'friend'),
          -- One rider inviting many accounts that never ride is worth a look.
          'referrer_unridden', (select count(*) from referrals z where z.referrer_id = f.referrer_id and z.qualified_at is null)
        ) r
        from referrals f join profiles a on a.id = f.referrer_id join profiles b on b.id = f.friend_id
        order by f.created_at desc limit 100
      ) z
    ), '[]'::jsonb)
  );
end;
$$;

-- Adds a batch of one-time Apple offer codes (the CSV App Store Connect downloads). Returns how
-- many were new.
create or replace function admin_add_referral_codes(p_codes text[], p_batch text, p_expires_on date, p_environment text default 'Production')
returns int language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := require_admin();
  v_added int;
begin
  if coalesce(btrim(p_batch), '') = '' or length(p_batch) > 80 then raise exception 'name the batch (up to 80 characters)'; end if;
  if p_expires_on is null or p_expires_on <= current_date then raise exception 'the codes must expire in the future'; end if;
  if p_environment not in ('Production', 'Sandbox') then raise exception 'environment must be Production or Sandbox'; end if;
  if coalesce(array_length(p_codes, 1), 0) = 0 or array_length(p_codes, 1) > 50000 then raise exception 'add 1 to 50,000 codes at a time'; end if;
  if exists (select 1 from unnest(p_codes) c where upper(btrim(c)) !~ '^[A-Z0-9]{6,64}$') then
    raise exception 'every code must be 6 to 64 letters and numbers';
  end if;
  insert into referral_offer_codes (code, batch, environment, expires_on, added_by)
  select distinct upper(btrim(c)), btrim(p_batch), p_environment, p_expires_on, v_admin from unnest(p_codes) c
  on conflict (code) do nothing;
  get diagnostics v_added = row_count;
  perform log_admin_action('referrals.add_codes', 'referral_codes', btrim(p_batch), null,
    jsonb_build_object('added', v_added, 'environment', p_environment, 'expires_on', p_expires_on));
  return v_added;
end;
$$;

-- Removes the codes of a batch nobody has been given yet (a batch uploaded by mistake).
create or replace function admin_remove_referral_codes(p_batch text)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_removed int;
begin
  perform require_admin();
  delete from referral_offer_codes where batch = p_batch and assigned_at is null;
  get diagnostics v_removed = row_count;
  perform log_admin_action('referrals.remove_codes', 'referral_codes', p_batch, null, jsonb_build_object('removed', v_removed));
  return v_removed;
end;
$$;

revoke execute on function referral_rules(), referrals_on(), referral_give_reward(uuid, uuid, text, uuid), referral_settle(uuid),
  referrals_on_ride_end(), referral_play_token(uuid), referral_defer_target(uuid), referral_mark_deferred(uuid, timestamptz),
  referral_mark_play_redeemed(), claim_referral(text), my_referrals(), claim_referral_reward(text), admin_referrals(),
  admin_add_referral_codes(text[], text, date, text), admin_remove_referral_codes(text)
  from public, anon, authenticated;
grant execute on function claim_referral(text), my_referrals(), claim_referral_reward(text), admin_referrals(),
  admin_add_referral_codes(text[], text, date, text), admin_remove_referral_codes(text) to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function referral_defer_target(uuid), referral_mark_deferred(uuid, timestamptz) to service_role;
  end if;
end $$;
