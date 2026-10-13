-- Contact form: onmylead.com/contact and You > Contact Us in the app.
--
-- The contact-form edge function saves every message here first, then emails it to the owner
-- (CONTACT_TO) through Resend when that is set up. Saving first means nothing is lost while email
-- is off or Resend is down, and the Admin Dashboard's Contact page lists every message.
--
-- Privacy and abuse:
--   * Riders can't read, change or delete messages, their own included: there are no policies, and
--     only the service role (the edge function) writes through contact_submit().
--   * Signed-out visitors can send from the website, so contact_submit() rate limits by a hash of
--     the sender's IP address (never the address itself), by email and by account, with a cap on
--     the whole form per day.
--   * The sender's account link is cleared if they delete their account; the message stays so the
--     owner can still answer it.
--
-- Additive only: one new table and four functions.

create table contact_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null check (source in ('website', 'app')),
  topic text not null check (topic in ('problem', 'feature', 'billing', 'account', 'safety', 'feedback', 'other')),
  name text check (char_length(name) <= 80),
  email text not null check (char_length(email) between 3 and 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  message text not null check (char_length(message) between 1 and 5000),
  user_id uuid references auth.users (id) on delete set null,
  platform text check (char_length(platform) <= 40),
  app_version text check (char_length(app_version) <= 40),
  ip_hash text check (char_length(ip_hash) <= 128),
  status text not null default 'new' check (status in ('new', 'replied', 'closed')),
  emailed_at timestamptz,
  email_note text check (char_length(email_note) <= 300),
  handled_at timestamptz,
  handled_by uuid references auth.users (id) on delete set null
);

create index contact_messages_created_idx on contact_messages (created_at desc);
create index contact_messages_ip_idx on contact_messages (ip_hash, created_at desc);

alter table contact_messages enable row level security;
revoke all on contact_messages from anon, authenticated;

-- Saves one message after the rate limits pass. Service role only (the contact-form function),
-- which writes past row level security, so these two run as the caller, not as definer.
-- Raises 'rate_limited' (P0001) when the sender has sent too many.
create or replace function contact_submit(
  p_source text, p_topic text, p_name text, p_email text, p_message text,
  p_user uuid default null, p_platform text default null, p_app_version text default null, p_ip_hash text default null
) returns uuid language plpgsql set search_path = public as $$
declare
  v_id uuid;
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'not allowed';
  end if;
  -- One sender at a time, so two quick sends can't both slip under a limit.
  perform pg_advisory_xact_lock(hashtext('contact_submit:' || coalesce(p_ip_hash, v_email)));
  if (select count(*) from contact_messages where created_at > now() - interval '1 day') >= 300
     or (p_ip_hash is not null and (select count(*) from contact_messages
           where ip_hash = p_ip_hash and created_at > now() - interval '1 hour') >= 5)
     or (select count(*) from contact_messages
           where lower(email) = v_email and created_at > now() - interval '1 hour') >= 5
     or (p_user is not null and (select count(*) from contact_messages
           where user_id = p_user and created_at > now() - interval '1 hour') >= 5) then
    raise exception 'rate_limited';
  end if;
  insert into contact_messages (source, topic, name, email, message, user_id, platform, app_version, ip_hash)
  values (p_source, p_topic, nullif(btrim(coalesce(p_name, '')), ''), v_email, btrim(p_message), p_user,
          nullif(btrim(coalesce(p_platform, '')), ''), nullif(btrim(coalesce(p_app_version, '')), ''), p_ip_hash)
  returning id into v_id;
  return v_id;
end;
$$;

-- Admin Dashboard: the Contact page. p_status: new, replied, closed, all.
create or replace function admin_contact_messages(p_status text default 'new', p_page int default 0, p_page_size int default 50)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_rows jsonb; v_total bigint;
begin
  perform require_admin();
  p_page_size := least(greatest(coalesce(p_page_size, 50), 1), 200);
  p_page := greatest(coalesce(p_page, 0), 0);
  with f as (
    select c.id, c.created_at, c.source, c.topic, c.name, c.email, c.message, c.user_id,
           p.display_name as user_name, c.platform, c.app_version, c.status, c.emailed_at, c.email_note, c.handled_at
    from contact_messages c
    left join profiles p on p.id = c.user_id
    where coalesce(p_status, 'new') = 'all' or c.status = coalesce(p_status, 'new')
  )
  select (select count(*) from f),
         coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
           select * from f order by created_at desc offset p_page * p_page_size limit p_page_size) x), '[]')
    into v_total, v_rows;
  return jsonb_build_object('rows', v_rows, 'total', v_total,
    'new', (select count(*) from contact_messages where status = 'new'));
end;
$$;

create or replace function admin_set_contact_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_before text;
begin
  perform require_admin();
  if p_status not in ('new', 'replied', 'closed') then raise exception 'bad status'; end if;
  select status into v_before from contact_messages where id = p_id for update;
  if v_before is null then raise exception 'message not found'; end if;
  update contact_messages set status = p_status,
         handled_at = case when p_status = 'new' then null else now() end,
         handled_by = case when p_status = 'new' then null else auth.uid() end
   where id = p_id;
  perform log_admin_action('contact.' || p_status, 'contact_message', p_id::text,
          jsonb_build_object('status', v_before), jsonb_build_object('status', p_status));
end;
$$;

-- The edge function records whether the email went out, so the dashboard can say so.
create or replace function contact_mark_emailed(p_id uuid, p_ok boolean, p_note text default null)
returns void language plpgsql set search_path = public as $$
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'not allowed';
  end if;
  update contact_messages
     set emailed_at = case when p_ok then now() end,
         email_note = left(p_note, 300)
   where id = p_id;
end;
$$;

revoke execute on function
  contact_submit(text, text, text, text, text, uuid, text, text, text), contact_mark_emailed(uuid, boolean, text),
  admin_contact_messages(text, int, int), admin_set_contact_status(uuid, text)
from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function contact_submit(text, text, text, text, text, uuid, text, text, text), contact_mark_emailed(uuid, boolean, text)
    to service_role;
  end if;
end $$;
grant execute on function admin_contact_messages(text, int, int), admin_set_contact_status(uuid, text) to authenticated;
