-- Custom share codes (1.0.3): riders can type their own code for a ride link (/r/CODE), a riding
-- group link (/g/CODE) and their friend link (/friend/CODE), instead of the one OnMyLead made.
--
-- Backward compatible: every existing code and link keeps working (nothing is rewritten), the
-- made-up codes stay the default, and older app builds that never send a code are unaffected.
-- Lookups already match upper(btrim(code)); these triggers keep every new code in capitals, so
-- the existing unique constraints (rides.invite_code, riding_groups.invite_code,
-- friend_codes.code) make codes unique regardless of case.
--
-- The app mirrors these rules in app/src/core/share-code.ts to explain problems while the rider
-- types; core/__tests__/share-code.test.ts keeps the word lists below in sync with that file.

-- ---------------------------------------------------------------------------
-- Rules
-- ---------------------------------------------------------------------------

-- Why a code can't be used, or null when its shape and words are fine (it may still be taken).
-- too_short, too_long, bad_characters, reserved (brand and site words; admins may use them) or
-- not_allowed (profanity and slurs, including number-for-letter spellings).
create or replace function share_code_problem(p_code text, p_allow_reserved boolean default false)
returns text language plpgsql immutable set search_path = public as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_flat text;
  v_plain text;
  v_words text[];
begin
  if length(v_code) < 6 then return 'too_short'; end if;
  if length(v_code) > 20 then return 'too_long'; end if;
  if v_code !~ '^[A-Z0-9]+(-[A-Z0-9]+)*$' then return 'bad_characters'; end if;
  -- The codes OnMyLead makes (8 or 10 of 0-9 and A-F) are always fine.
  if v_code ~ '^[0-9A-F]{8,10}$' then return null; end if;
  v_flat := replace(v_code, '-', '');
  if not coalesce(p_allow_reserved, false) then
    if v_flat = any (array[
      -- reserved:start
      'ADMIN', 'ADMINS', 'ADMINISTRATOR', 'ANDROID', 'API', 'APPLE', 'APPSTORE', 'BILLING', 'CHANGELOG', 'CONTACT', 'DOWNLOAD',
      'FRIEND', 'FRIENDS', 'GOOGLE', 'GOOGLEPLAY', 'GROUP', 'GROUPS', 'HELP', 'HELPCENTER', 'INVITE', 'IPHONE', 'LOGIN', 'LOGOUT',
      'MODERATOR', 'NULL', 'OFFICIAL', 'ONMYLEAD', 'PASSWORD', 'PRIVACY', 'PRO', 'RELEASENOTES', 'RIDE', 'RIDES', 'RUSOFFROAD',
      'SETTINGS', 'SIGNIN', 'SIGNUP', 'STAFF', 'SUPPORT', 'SYSTEM', 'TERMS', 'TEST', 'UNDEFINED'
      -- reserved:end
    ]) then return 'reserved'; end if;
    if exists (select 1 from unnest(array[
      -- reserved-parts:start
      'ONMYLEAD', 'RUSOFFROAD', 'ADMIN'
      -- reserved-parts:end
    ]) w where position(w in v_flat) > 0) then return 'reserved'; end if;
  end if;
  v_plain := translate(v_flat, '013457', 'OIEAST');
  if exists (select 1 from unnest(array[
    -- blocked-parts:start
    'FUCK', 'SHIT', 'CUNT', 'BITCH', 'NIGGER', 'NIGGA', 'FAGGOT', 'WHORE', 'SLUT', 'PUSSY', 'ASSHOLE', 'MOTHERFUCK',
    'DICKHEAD', 'HITLER', 'NAZI', 'KKK', 'PORN', 'BLOWJOB', 'JIZZ', 'WANKER', 'TWAT'
    -- blocked-parts:end
  ]) w where position(w in v_flat) > 0 or position(w in v_plain) > 0) then return 'not_allowed'; end if;
  v_words := array[v_flat, v_plain]
    || string_to_array(v_code, '-')
    || array(select translate(x, '013457', 'OIEAST') from unnest(string_to_array(v_code, '-')) x);
  if v_words && array[
    -- blocked-words:start
    'ASS', 'ARSE', 'BOOB', 'BOOBS', 'COCK', 'CUM', 'DICK', 'DILDO', 'FAG', 'HOE', 'PENIS', 'PISS', 'RAPE', 'RAPIST', 'SEX',
    'SEXY', 'TIT', 'TITS', 'VAGINA', 'ANAL', 'NUDE', 'NUDES', 'DAMN', 'CRAP', 'BASTARD'
    -- blocked-words:end
  ] then return 'not_allowed'; end if;
  return null;
end;
$$;

-- A new or changed code, in capitals, or an error share_code_<reason>. An unchanged code passes
-- untouched, so rows saved before these rules (and every made-up code) keep working.
create or replace function clean_share_code(p_new text, p_old text)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_code text := upper(btrim(coalesce(p_new, '')));
  v_problem text;
begin
  if p_old is not null and (p_new = p_old or v_code = upper(p_old)) then return p_old; end if;
  v_problem := share_code_problem(v_code, is_admin(auth.uid()));
  if v_problem is not null then
    raise exception 'share_code_%', v_problem using errcode = '22023';
  end if;
  return v_code;
end;
$$;

create or replace function rides_share_code() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.invite_code := clean_share_code(new.invite_code, case when tg_op = 'UPDATE' then old.invite_code end);
  return new;
end;
$$;
create or replace function riding_groups_share_code() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.invite_code := clean_share_code(new.invite_code, case when tg_op = 'UPDATE' then old.invite_code end);
  return new;
end;
$$;
create or replace function friend_codes_share_code() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.code := clean_share_code(new.code, case when tg_op = 'UPDATE' then old.code end);
  return new;
end;
$$;

drop trigger if exists rides_share_code on rides;
create trigger rides_share_code before insert or update of invite_code on rides
  for each row execute function rides_share_code();
drop trigger if exists riding_groups_share_code on riding_groups;
create trigger riding_groups_share_code before insert or update of invite_code on riding_groups
  for each row execute function riding_groups_share_code();
drop trigger if exists friend_codes_share_code on friend_codes;
create trigger friend_codes_share_code before insert or update of code on friend_codes
  for each row execute function friend_codes_share_code();

-- ---------------------------------------------------------------------------
-- Live check while typing
-- ---------------------------------------------------------------------------

-- What the app shows under the code box: available, yours (already this ride's/group's/your
-- friend link's code), taken, or one of share_code_problem's reasons. p_kind: ride, group or
-- friend. p_id: the ride or group being edited (null while creating one, and for friend links).
-- Signed-in riders only. It tells no more than opening the link would (ride_by_code and
-- group_preview already answer for any code), and nothing about who owns a taken code.
create or replace function share_code_status(p_kind text, p_code text, p_id uuid default null)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_problem text;
  v_owner uuid;
begin
  if v_me is null then raise exception 'sign in first'; end if;
  if p_kind = 'ride' then
    select id into v_owner from rides where invite_code = v_code;
  elsif p_kind = 'group' then
    select id into v_owner from riding_groups where invite_code = v_code;
  elsif p_kind = 'friend' then
    select user_id into v_owner from friend_codes where code = v_code;
    p_id := v_me;
  else
    raise exception 'unknown code kind';
  end if;
  if v_owner is not null and v_owner = p_id then return 'yours'; end if;
  v_problem := share_code_problem(v_code, is_admin(v_me));
  if v_problem is not null then return v_problem; end if;
  if v_owner is not null then return 'taken'; end if;
  return 'available';
end;
$$;

-- ---------------------------------------------------------------------------
-- Changing a code (the old link and QR code stop working, like Reset Link)
-- ---------------------------------------------------------------------------

-- A ride's organizers (or an admin) give the ride a new code. Not for ended or cancelled rides.
create or replace function set_ride_code(p_ride uuid, p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_status ride_status;
  v_code text;
begin
  if v_me is null then raise exception 'sign in first'; end if;
  select status into v_status from rides where id = p_ride;
  if not found then raise exception 'ride not found'; end if;
  if not (is_ride_manager(p_ride, v_me) or is_admin(v_me)) then
    raise exception 'only the ride''s organizers can change its code' using errcode = '42501';
  end if;
  if v_status in ('ended', 'cancelled') then raise exception 'this ride is over, so its code can''t change'; end if;
  begin
    update rides set invite_code = p_code where id = p_ride returning invite_code into v_code;
  exception when unique_violation then
    raise exception 'share_code_taken' using errcode = '23505';
  end;
  return v_code;
end;
$$;

-- A riding group's owner gives the group a new code.
create or replace function set_group_code(p_group uuid, p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_code text;
begin
  if not is_group_owner(p_group, auth.uid()) then
    raise exception 'only the group''s owner can do that' using errcode = '42501';
  end if;
  begin
    update riding_groups set invite_code = p_code where id = p_group returning invite_code into v_code;
  exception when unique_violation then
    raise exception 'share_code_taken' using errcode = '23505';
  end;
  return v_code;
end;
$$;

-- A rider picks their own friend link code.
create or replace function set_friend_code(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_code text;
begin
  if v_me is null then raise exception 'sign in first'; end if;
  begin
    insert into friend_codes (user_id, code) values (v_me, p_code)
    on conflict (user_id) do update set code = excluded.code
    returning code into v_code;
  exception when unique_violation then
    raise exception 'share_code_taken' using errcode = '23505';
  end;
  return v_code;
end;
$$;

-- Admin: give a ride a fresh made-up code, for a code that breaks the rules or is being misused.
create or replace function admin_reset_ride_code(p_id uuid, p_reason text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_old text;
  v_code text;
begin
  perform require_admin();
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'a reason is required'; end if;
  select invite_code into v_old from rides where id = p_id for update;
  if v_old is null then raise exception 'ride not found'; end if;
  loop
    v_code := upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8));
    exit when not exists (select 1 from rides where invite_code = v_code);
  end loop;
  update rides set invite_code = v_code where id = p_id;
  perform log_admin_action('ride.reset_code', 'ride', p_id::text,
    jsonb_build_object('invite_code', v_old), jsonb_build_object('invite_code', v_code, 'reason', btrim(p_reason)));
  return v_code;
end;
$$;

revoke execute on function share_code_problem(text, boolean), clean_share_code(text, text),
  rides_share_code(), riding_groups_share_code(), friend_codes_share_code(),
  share_code_status(text, text, uuid), set_ride_code(uuid, text), set_group_code(uuid, text),
  set_friend_code(text), admin_reset_ride_code(uuid, text)
from public, anon;
revoke execute on function clean_share_code(text, text) from authenticated;
grant execute on function share_code_problem(text, boolean), share_code_status(text, text, uuid),
  set_ride_code(uuid, text), set_group_code(uuid, text), set_friend_code(text), admin_reset_ride_code(uuid, text)
to authenticated;
