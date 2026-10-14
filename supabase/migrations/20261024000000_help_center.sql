-- Help Center (onmylead.com/help): manual edits and audit runs from the Admin Dashboard's Help page.
--
-- The articles themselves live in the repository (help/articles/*.md) and are rebuilt into the
-- website on every change to main. This adds what can't live there:
--   * help_article_edits: the owner's own edits and restores, every version kept. At most one per
--     article is live; a live edit is shown instead of the automatic version, so automated
--     updates never overwrite it. The public reads live edits through help_live_edits() (the
--     website build and the help pages themselves), nothing else.
--   * help_audit_runs: each "Run Audit Now" from the dashboard, with what it found.
--
-- Additive only: two new tables and seven functions. Admin functions start with require_admin()
-- and log through log_admin_action(), like the rest of the dashboard.

create table help_article_edits (
  id uuid primary key default gen_random_uuid(),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  title text check (char_length(title) <= 120),
  summary text check (char_length(summary) <= 300),
  body text not null check (char_length(btrim(body)) between 1 and 60000),
  -- Fingerprint of the repository version this edit started from (core/help.ts contentHash), so
  -- the dashboard can say when the automatic version changed since.
  base_hash text check (char_length(base_hash) <= 40),
  note text check (char_length(note) <= 500),
  kind text not null default 'edit' check (kind in ('edit', 'restore')),
  live boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  -- When this version last went live (shown as Last Updated on the website).
  updated_at timestamptz not null default now()
);
create unique index help_article_edits_one_live on help_article_edits (slug) where live;
create index help_article_edits_slug_idx on help_article_edits (slug, created_at desc);
alter table help_article_edits enable row level security;
revoke all on help_article_edits from anon, authenticated;

create table help_audit_runs (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  ran_by uuid references auth.users (id) on delete set null,
  errors int not null default 0,
  warnings int not null default 0,
  result jsonb not null check (pg_column_size(result) <= 500000)
);
create index help_audit_runs_ran_idx on help_audit_runs (ran_at desc);
alter table help_audit_runs enable row level security;
revoke all on help_audit_runs from anon, authenticated;

-- Public: the live edits, all or one article's. Only what the website shows anyway.
create or replace function help_live_edits(p_slug text default null)
returns table (id uuid, slug text, title text, summary text, body text, base_hash text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select e.id, e.slug, e.title, e.summary, e.body, e.base_hash, e.updated_at
  from help_article_edits e
  where e.live and (p_slug is null or e.slug = p_slug)
  order by e.slug;
$$;
grant execute on function help_live_edits(text) to anon, authenticated;

-- Dashboard: every saved version, newest first (one article, or all).
create or replace function admin_help_edits(p_slug text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
      select e.id, e.slug, e.title, e.summary, e.body, e.base_hash, e.note, e.kind, e.live,
             e.created_at, e.updated_at, p.display_name as created_by_name
      from help_article_edits e left join profiles p on p.id = e.created_by
      where p_slug is null or e.slug = p_slug
      order by e.created_at desc limit 500) x), '[]');
end;
$$;

-- Dashboard: save a version. With p_publish it goes live at once (replacing any live edit).
create or replace function admin_help_save(
  p_slug text, p_body text, p_title text default null, p_summary text default null,
  p_base_hash text default null, p_note text default null, p_kind text default 'edit', p_publish boolean default true
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_before uuid;
begin
  perform require_admin();
  perform pg_advisory_xact_lock(hashtext('help_edit:' || coalesce(p_slug, '')));
  select id into v_before from help_article_edits where slug = p_slug and live;
  if p_publish then
    update help_article_edits set live = false where slug = p_slug and live;
  end if;
  insert into help_article_edits (slug, title, summary, body, base_hash, note, kind, live, created_by)
  values (p_slug, nullif(btrim(coalesce(p_title, '')), ''), nullif(btrim(coalesce(p_summary, '')), ''), p_body,
          p_base_hash, nullif(btrim(coalesce(p_note, '')), ''), coalesce(p_kind, 'edit'), coalesce(p_publish, true), auth.uid())
  returning id into v_id;
  perform log_admin_action('help.' || coalesce(p_kind, 'edit') || case when p_publish then '' else '_draft' end,
          'help_article', p_slug, jsonb_build_object('live_edit', v_before),
          jsonb_build_object('live_edit', case when p_publish then v_id else v_before end, 'saved', v_id, 'note', p_note));
  return v_id;
end;
$$;

-- Dashboard: put an earlier saved version back live.
create or replace function admin_help_set_live(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_slug text; v_before uuid;
begin
  perform require_admin();
  select slug into v_slug from help_article_edits where id = p_id;
  if v_slug is null then raise exception 'version not found'; end if;
  perform pg_advisory_xact_lock(hashtext('help_edit:' || v_slug));
  select id into v_before from help_article_edits where slug = v_slug and live;
  update help_article_edits set live = false where slug = v_slug and live and id <> p_id;
  update help_article_edits set live = true, updated_at = now() where id = p_id;
  perform log_admin_action('help.set_live', 'help_article', v_slug,
          jsonb_build_object('live_edit', v_before), jsonb_build_object('live_edit', p_id));
end;
$$;

-- Dashboard: drop the live edit, so the automatic (repository) version shows again.
create or replace function admin_help_use_automatic(p_slug text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_before uuid;
begin
  perform require_admin();
  select id into v_before from help_article_edits where slug = p_slug and live;
  if v_before is null then return; end if;
  update help_article_edits set live = false where id = v_before;
  perform log_admin_action('help.use_automatic', 'help_article', p_slug,
          jsonb_build_object('live_edit', v_before), jsonb_build_object('live_edit', null));
end;
$$;

-- Dashboard: keep the result of a "Run Audit Now".
create or replace function admin_help_log_audit(p_result jsonb, p_errors int, p_warnings int)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  perform require_admin();
  insert into help_audit_runs (ran_by, errors, warnings, result)
  values (auth.uid(), greatest(coalesce(p_errors, 0), 0), greatest(coalesce(p_warnings, 0), 0), coalesce(p_result, '{}'))
  returning id into v_id;
  delete from help_audit_runs where id in (select id from help_audit_runs order by ran_at desc offset 100);
  perform log_admin_action('help.audit', 'help_audit', v_id::text, null,
          jsonb_build_object('errors', p_errors, 'warnings', p_warnings));
  return v_id;
end;
$$;

create or replace function admin_help_audits(p_limit int default 20)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.ran_at desc) from (
      select r.id, r.ran_at, r.errors, r.warnings, r.result
      from help_audit_runs r order by r.ran_at desc limit least(greatest(coalesce(p_limit, 20), 1), 100)) x), '[]');
end;
$$;

revoke execute on function admin_help_edits(text), admin_help_save(text, text, text, text, text, text, text, boolean),
  admin_help_set_live(uuid), admin_help_use_automatic(text), admin_help_log_audit(jsonb, int, int), admin_help_audits(int)
  from public, anon;
grant execute on function admin_help_edits(text), admin_help_save(text, text, text, text, text, text, text, boolean),
  admin_help_set_live(uuid), admin_help_use_automatic(text), admin_help_log_audit(jsonb, int, int), admin_help_audits(int)
  to authenticated;
