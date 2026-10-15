-- Bug reports through the contact form (You > Report a Bug, or "Something Isn't Working").
--
-- A bug report carries what the team needs to reproduce it: the device and app version, the screen
-- the rider was on before, the app's own short activity log (screens, errors, failed requests; never
-- locations or anything typed, see app/src/core/app-log.ts) and an optional screenshot.
--
-- The contact-form edge function saves the message with contact_submit() as before, then adds these
-- with contact_attach_details(). The screenshot goes to the private contact-screenshots bucket,
-- written only by the function (service role); only admins can read it, for the Admin Dashboard.
--
-- Additive only: four nullable columns, one new function, admin_contact_messages() returns the new
-- columns too (same signature), and one private bucket. Older app builds keep working unchanged.

alter table contact_messages
  add column if not exists device text check (char_length(device) <= 120),
  add column if not exists screen text check (char_length(screen) <= 200),
  add column if not exists app_log text check (char_length(app_log) <= 40000),
  add column if not exists screenshot_path text check (char_length(screenshot_path) <= 200);

create or replace function contact_attach_details(
  p_id uuid, p_device text default null, p_screen text default null, p_app_log text default null, p_screenshot_path text default null
) returns void language plpgsql set search_path = public as $$
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'not allowed';
  end if;
  update contact_messages
     set device = nullif(left(btrim(coalesce(p_device, '')), 120), ''),
         screen = nullif(left(btrim(coalesce(p_screen, '')), 200), ''),
         app_log = nullif(left(coalesce(p_app_log, ''), 40000), ''),
         screenshot_path = nullif(left(btrim(coalesce(p_screenshot_path, '')), 200), '')
   where id = p_id;
end;
$$;

revoke execute on function contact_attach_details(uuid, text, text, text, text) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function contact_attach_details(uuid, text, text, text, text) to service_role;
  end if;
end $$;

-- Admin Dashboard: the Contact page, now with the bug report details.
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
           p.display_name as user_name, c.platform, c.app_version, c.status, c.emailed_at, c.email_note, c.handled_at,
           c.device, c.screen, c.app_log, c.screenshot_path
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

-- The screenshots: private, images only, 5 MB. No rider policies: the function writes with the
-- service role, and only admins read (signed URLs on the Contact page). Skipped where Storage isn't
-- installed (the local test database).
do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    return;
  end if;
  insert into storage.buckets (id, name, public) values ('contact-screenshots', 'contact-screenshots', false)
  on conflict (id) do update set public = false;
  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit') then
    execute $q$update storage.buckets set file_size_limit = 5242880 where id = 'contact-screenshots'$q$;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    execute $q$update storage.buckets set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
               where id = 'contact-screenshots'$q$;
  end if;
  execute 'drop policy if exists contact_screenshots_admin_read on storage.objects';
  execute $p$create policy contact_screenshots_admin_read on storage.objects for select to authenticated
    using (bucket_id = 'contact-screenshots' and public.is_admin() and coalesce(auth.jwt() ->> 'aal', '') = 'aal2')$p$;
end $$;
