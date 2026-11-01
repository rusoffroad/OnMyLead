-- Admin Dashboard Reviews page (onmylead.com/admin/reviews): ratings and reviews from the App
-- Store and Google Play in one list, with replies written from the dashboard.
--
-- Builds on 20261018300000_admin_dashboard.sql (require_admin(), log_admin_action()).
--
-- Backward compatible: two new tables and new functions only. Reviews are written by the
-- store-reviews edge function with the service role; until it is deployed with its keys the page
-- says "Not Connected Yet". Google Play's live feed only covers the last seven days, so saving
-- every review here is what keeps the history.

create table if not exists store_reviews (
  store text not null check (store in ('apple', 'google')),
  review_id text not null,
  rating smallint not null check (rating between 1 and 5),
  title text,
  body text,
  author text,
  territory text,            -- App Store country (USA)
  language text,             -- Google Play reviewer language (en_US)
  app_version text,
  device text,
  created_at timestamptz not null,
  updated_at timestamptz,    -- when the rider last changed the review
  reply_body text,
  reply_at timestamptz,
  reply_state text,          -- PUBLISHED, or PENDING_PUBLISH while Apple checks a new reply
  link text,
  imported_at timestamptz not null default now(),
  primary key (store, review_id)
);
create index if not exists store_reviews_created on store_reviews (created_at desc);
alter table store_reviews enable row level security;

-- The last time each store was read, and what went wrong.
create table if not exists store_review_imports (
  store text primary key check (store in ('apple', 'google')),
  checked_at timestamptz,
  ok_at timestamptz,
  error text
);
alter table store_review_imports enable row level security;
-- No policies on either table: the edge function writes with the service role; admins read
-- through admin_reviews().

-- One page of reviews, newest first, and the totals for each store (totals ignore the filters).
-- p_store: all, apple, google. p_stars: 1-5 or null. p_reply: all, unanswered (has text, no
-- reply), answered. p_q: words in the title, text, author, device or version.
create or replace function admin_reviews(
  p_store text default 'all', p_stars int default null, p_reply text default 'all', p_q text default '',
  p_page int default 0, p_page_size int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_rows jsonb; v_total bigint; v_q text := nullif(btrim(coalesce(p_q, '')), '');
begin
  perform require_admin();
  if coalesce(p_store, 'all') not in ('all', 'apple', 'google') then raise exception 'bad store'; end if;
  if coalesce(p_reply, 'all') not in ('all', 'unanswered', 'answered') then raise exception 'bad reply filter'; end if;
  p_page_size := least(greatest(coalesce(p_page_size, 30), 1), 200);
  p_page := greatest(coalesce(p_page, 0), 0);

  with f as (
    select r.* from store_reviews r
    where (coalesce(p_store, 'all') = 'all' or r.store = p_store)
      and (p_stars is null or r.rating = p_stars)
      and (coalesce(p_reply, 'all') = 'all'
           or (p_reply = 'answered' and r.reply_body is not null)
           or (p_reply = 'unanswered' and r.reply_body is null and coalesce(btrim(r.body), '') <> ''))
      and (v_q is null or concat_ws(' ', r.title, r.body, r.author, r.device, r.app_version, r.territory, r.language) ilike '%' || v_q || '%')
  )
  select (select count(*) from f),
         (select coalesce(jsonb_agg(to_jsonb(x) - 'imported_at' order by x.created_at desc, x.review_id), '[]')
          from (select * from f order by created_at desc, review_id limit p_page_size offset p_page * p_page_size) x)
  into v_total, v_rows;

  return jsonb_build_object(
    'rows', v_rows,
    'total', v_total,
    'stores', (select jsonb_object_agg(s.store, jsonb_build_object(
        'checked_at', i.checked_at, 'ok_at', i.ok_at, 'error', i.error,
        'count', (select count(*) from store_reviews r where r.store = s.store),
        'average', (select round(avg(r.rating), 2) from store_reviews r where r.store = s.store),
        'written', (select count(*) from store_reviews r where r.store = s.store and coalesce(btrim(r.body), '') <> ''),
        'unanswered', (select count(*) from store_reviews r where r.store = s.store and r.reply_body is null and coalesce(btrim(r.body), '') <> ''),
        'recent_count', (select count(*) from store_reviews r where r.store = s.store and r.created_at >= now() - interval '30 days'),
        'recent_average', (select round(avg(r.rating), 2) from store_reviews r where r.store = s.store and r.created_at >= now() - interval '30 days'),
        'stars', (select jsonb_agg((select count(*) from store_reviews r where r.store = s.store and r.rating = n) order by n desc)
                  from generate_series(1, 5) n)))
      from (values ('apple'), ('google')) s (store) left join store_review_imports i on i.store = s.store)
  );
end;
$$;

-- Records a reply the store has accepted (the edge function posts it first, then calls this as
-- the signed-in admin so it lands in the audit log under their name).
create or replace function admin_review_replied(p_store text, p_review_id text, p_body text, p_state text default 'PUBLISHED')
returns void language plpgsql security definer set search_path = public as $$
declare
  v_before text;
begin
  perform require_admin();
  select reply_body into v_before from store_reviews where store = p_store and review_id = p_review_id;
  if not found then raise exception 'no such review'; end if;
  if nullif(btrim(coalesce(p_body, '')), '') is null then raise exception 'empty reply'; end if;
  update store_reviews set reply_body = btrim(p_body), reply_at = now(), reply_state = coalesce(nullif(p_state, ''), 'PUBLISHED')
  where store = p_store and review_id = p_review_id;
  perform log_admin_action(case when v_before is null then 'review.reply' else 'review.reply_edit' end, 'review',
    p_store || ':' || p_review_id, jsonb_build_object('reply', v_before), jsonb_build_object('reply', btrim(p_body)));
end;
$$;

revoke all on function admin_reviews(text, int, text, text, int, int), admin_review_replied(text, text, text, text) from public, anon;
grant execute on function admin_reviews(text, int, text, text, int, int), admin_review_replied(text, text, text, text) to authenticated;
