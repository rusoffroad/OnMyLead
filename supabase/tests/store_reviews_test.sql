-- Admin Dashboard Store Reviews page (migration 20261101000000_store_reviews.sql): the review list,
-- its filters and per-store totals, and replies recorded in the audit log. Runs after
-- admin_growth_test.sql (run_local.sh), which leaves as_user, as_session and expect_error in place.
-- Each block raises an exception if a rule is broken.

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000fa1', 'owner-r@example.test', '{"full_name":"Rita Owner"}'),
  ('00000000-0000-0000-0000-000000000fa2', 'rider-r@example.test', '{"full_name":"Ron Rider"}');
insert into admin_users (user_id) values ('00000000-0000-0000-0000-000000000fa1');

-- Rows the edge function writes with the service role.
insert into store_reviews (store, review_id, rating, title, body, author, territory, language, app_version, device, created_at, updated_at, reply_body, reply_at, reply_state) values
  ('apple', 'a1', 5, 'Best group ride app', 'Kept six Jeeps together on Black Bear Pass.', 'trailboss', 'USA', null, null, null, now() - interval '2 days', now() - interval '2 days', null, null, null),
  ('apple', 'a2', 4, 'Solid', 'Would like ride editing.', 'mud', 'CAN', null, null, null, now() - interval '40 days', now() - interval '40 days', 'Coming soon!', now() - interval '39 days', 'PUBLISHED'),
  ('google', 'g1', 2, null, 'Map froze on my Pixel', 'Dana', null, 'en_US', '1.0.1', 'Google Pixel 8', now() - interval '1 day', now() - interval '1 day', null, null, null),
  ('google', 'report:1:x', 5, null, null, null, null, 'en', '1.0.1', 'a52q', now() - interval '3 days', now() - interval '3 days', null, null, null);
insert into store_review_imports (store, checked_at, ok_at) values ('apple', now(), now());

select as_session('00000000-0000-0000-0000-000000000fa1', 'aal2');
set role authenticated;
do $$
declare
  v jsonb := admin_reviews();
begin
  if (v ->> 'total')::int <> 4 then raise exception 'FAIL: total %', v ->> 'total'; end if;
  if v -> 'rows' -> 0 ->> 'review_id' <> 'g1' then raise exception 'FAIL: not newest first: %', v -> 'rows' -> 0; end if;
  if (v #>> '{stores,apple,count}')::int <> 2 or (v #>> '{stores,apple,average}')::numeric <> 4.5 then raise exception 'FAIL: apple totals %', v #> '{stores,apple}'; end if;
  if v #> '{stores,google,stars}' <> '[1, 0, 0, 1, 0]'::jsonb then raise exception 'FAIL: google stars %', v #> '{stores,google,stars}'; end if;
  -- Star-only ratings don't need a reply; written ones without a reply do.
  if (v #>> '{stores,google,unanswered}')::int <> 1 or (v #>> '{stores,apple,unanswered}')::int <> 1 then raise exception 'FAIL: unanswered'; end if;
  if (v #>> '{stores,apple,recent_count}')::int <> 1 then raise exception 'FAIL: recent count'; end if;
  if v #>> '{stores,apple,ok_at}' is null or v #>> '{stores,google,ok_at}' is not null then raise exception 'FAIL: import status'; end if;
  if v -> 'rows' -> 0 ? 'imported_at' then raise exception 'FAIL: internal column leaked'; end if;

  -- Filters, and totals that ignore them.
  v := admin_reviews('google');
  if (v ->> 'total')::int <> 2 or (v #>> '{stores,apple,count}')::int <> 2 then raise exception 'FAIL: store filter'; end if;
  if (admin_reviews('all', 5) ->> 'total')::int <> 2 then raise exception 'FAIL: stars filter'; end if;
  if (admin_reviews('all', null, 'unanswered') ->> 'total')::int <> 2 then raise exception 'FAIL: unanswered filter'; end if;
  if (admin_reviews('all', null, 'answered') ->> 'total')::int <> 1 then raise exception 'FAIL: answered filter'; end if;
  if (admin_reviews('all', null, 'all', 'pixel') ->> 'total')::int <> 1 then raise exception 'FAIL: search'; end if;
  v := admin_reviews('all', null, 'all', '', 1, 3);
  if jsonb_array_length(v -> 'rows') <> 1 or (v ->> 'total')::int <> 4 then raise exception 'FAIL: paging'; end if;

  -- A reply the store accepted is saved and logged; editing it is logged as a change.
  perform admin_review_replied('google', 'g1', '  Thanks Dana, fixed in 1.0.2.  ', 'PUBLISHED');
  perform admin_review_replied('google', 'g1', 'Thanks Dana, fixed in 1.0.3.', null);
  if (admin_reviews('google', null, 'unanswered') ->> 'total')::int <> 0 then raise exception 'FAIL: reply not saved'; end if;
end $$;
select expect_error($q$select admin_review_replied('google', 'nope', 'Hi')$q$, '%no such review%', 'reply to a missing review');
select expect_error($q$select admin_review_replied('google', 'g1', '   ')$q$, '%empty reply%', 'empty reply');
select expect_error($q$select admin_reviews('amazon')$q$, '%bad store%', 'bad store filter');
reset role;
do $$ begin
  if (select reply_body from store_reviews where review_id = 'g1') <> 'Thanks Dana, fixed in 1.0.3.' then raise exception 'FAIL: reply text'; end if;
  if (select reply_state from store_reviews where review_id = 'g1') <> 'PUBLISHED' then raise exception 'FAIL: reply state'; end if;
  if (select count(*) from admin_audit_log where target_id = 'google:g1' and action in ('review.reply', 'review.reply_edit')) <> 2 then
    raise exception 'FAIL: replies not in the audit log';
  end if;
end $$;

-- Riders can't read reviews or record replies; an admin without the second factor can't either.
select as_user('00000000-0000-0000-0000-000000000fa2');
set role authenticated;
select expect_error($q$select admin_reviews()$q$, '%admin%', 'rider reads reviews');
select expect_error($q$select admin_review_replied('apple', 'a1', 'Hi')$q$, '%admin%', 'rider replies');
do $$ begin
  if exists (select 1 from store_reviews) or exists (select 1 from store_review_imports) then raise exception 'FAIL: rider reads review tables'; end if;
end $$;
reset role;
select as_session('00000000-0000-0000-0000-000000000fa1', 'aal1');
set role authenticated;
select expect_error($q$select admin_reviews()$q$, '%two-factor%', 'reviews without aal2');
reset role;
select as_user(null);
select set_config('request.jwt.claims', '', false);
