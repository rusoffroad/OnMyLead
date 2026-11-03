-- Brand Ambassador and OnMyLead Founder (migrations 20261103700000 and 20261103900000): only an admin with the
-- authenticator code can give or take it back, riders can't add it themselves, riding never earns
-- it, and the push text for earned badges is unchanged. Runs after admin_test.sql and
-- badges_test.sql (run_local.sh), which set up as_user, expect_refused, as_admin_session and the riders.

-- Riders can't give themselves the badge, and a plain rider can't call the admin functions.
select as_user('00000000-0000-0000-0000-0000000007a1');
set role authenticated;
select expect_refused($q$insert into rider_badges (user_id, badge, level) values (auth.uid(), 'ambassador', 1)$q$, 'typed in Brand Ambassador');
select expect_refused($q$select admin_grant_badge(auth.uid(), 'ambassador')$q$, 'rider granted a badge');
select expect_refused($q$select admin_badge_holders('ambassador')$q$, 'rider listed ambassadors');
reset role;

-- An admin without the authenticator code is refused.
do $$ begin
  perform as_admin_session('00000000-0000-0000-0000-00000000ad01', 'aal1');
  begin
    perform admin_grant_badge('00000000-0000-0000-0000-0000000007a1', 'ambassador');
    raise exception 'FAIL: aal1 admin granted a badge';
  exception when insufficient_privilege then null;
  end;
end $$;

-- With the code: give it, giving twice changes nothing, earned badges can't be given.
do $$
declare v jsonb;
begin
  perform as_admin_session('00000000-0000-0000-0000-00000000ad01', 'aal2');
  if not admin_grant_badge('00000000-0000-0000-0000-0000000007a1', 'ambassador') then raise exception 'FAIL: grant returned false'; end if;
  if admin_grant_badge('00000000-0000-0000-0000-0000000007a1', 'ambassador') then raise exception 'FAIL: second grant returned true'; end if;
  begin
    perform admin_grant_badge('00000000-0000-0000-0000-0000000007a1', 'trail_boss');
    raise exception 'FAIL: gave an earned badge';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  if (select count(*) from rider_badges where user_id = '00000000-0000-0000-0000-0000000007a1' and badge = 'ambassador' and level = 1) <> 1 then
    raise exception 'FAIL: ambassador row';
  end if;
  v := admin_badge_holders('ambassador');
  if jsonb_array_length(v) <> 1 or v -> 0 ->> 'user_id' <> '00000000-0000-0000-0000-0000000007a1' then raise exception 'FAIL: holders %', v; end if;
  if not admin_user_badges('00000000-0000-0000-0000-0000000007a1') @> '[{"badge":"ambassador","level":1}]' then raise exception 'FAIL: user badges'; end if;
  if not exists (select 1 from admin_audit_log where action = 'badge.grant' and target_id = '00000000-0000-0000-0000-0000000007a1') then
    raise exception 'FAIL: grant not audited';
  end if;
end $$;

-- Honors have one level; riding never adds or removes it.
do $$ begin
  begin
    insert into rider_badges (user_id, badge, level) values ('00000000-0000-0000-0000-0000000007b1', 'ambassador', 2);
    raise exception 'FAIL: ambassador level 2';
  exception when check_violation then null;
  end;
  perform award_rider_badges('00000000-0000-0000-0000-0000000007a1', true);
  perform award_rider_badges('00000000-0000-0000-0000-0000000007b1', true);
  if exists (select 1 from rider_badges where user_id = '00000000-0000-0000-0000-0000000007b1' and badge = 'ambassador') then
    raise exception 'FAIL: riding earned ambassador';
  end if;
  if not exists (select 1 from rider_badges where user_id = '00000000-0000-0000-0000-0000000007a1' and badge = 'ambassador') then
    raise exception 'FAIL: riding removed ambassador';
  end if;
end $$;

-- Other riders can read it (it shows beside the name); the rider sees it as New in my_badges.
select set_config('request.jwt.claims', '', false);
select as_user('00000000-0000-0000-0000-0000000007b1');
set role authenticated;
do $$ begin
  if not exists (select 1 from rider_badges where user_id = '00000000-0000-0000-0000-0000000007a1' and badge = 'ambassador') then
    raise exception 'FAIL: ambassador not readable by other riders';
  end if;
end $$;
select as_user('00000000-0000-0000-0000-0000000007a1');
do $$ begin
  if not (my_badges() -> 'badges') @> '[{"badge":"ambassador","level":1,"seen":false}]' then raise exception 'FAIL: my_badges ambassador'; end if;
end $$;
reset role;

-- Push text: the honor, and earned badges exactly as before.
do $$ begin
  if (select title from badge_push_text('ambassador', 1, 1)) <> 'You''re an OnMyLead Brand Ambassador' then raise exception 'FAIL: ambassador push title'; end if;
  if (select title from badge_push_text('trail_boss', 2, 1)) <> 'New Badge: Trail Boss Silver' then raise exception 'FAIL: badge push title'; end if;
  if (select body from badge_push_text('trail_boss', 2, 1)) <> 'For leading rides. See it on the You tab.' then raise exception 'FAIL: badge push body'; end if;
  if (select body from badge_push_text('ambassador', 1, 2)) <> 'Including Brand Ambassador. See them on the You tab.' then raise exception 'FAIL: multi honor body'; end if;
  if (select count(*) from badge_levels()) <> 21 then raise exception 'FAIL: badge_levels changed'; end if;
end $$;

-- Revoke: gone, audited, and revoking again changes nothing.
do $$ begin
  perform as_admin_session('00000000-0000-0000-0000-00000000ad01', 'aal2');
  if not admin_revoke_badge('00000000-0000-0000-0000-0000000007a1', 'ambassador') then raise exception 'FAIL: revoke returned false'; end if;
  if admin_revoke_badge('00000000-0000-0000-0000-0000000007a1', 'ambassador') then raise exception 'FAIL: second revoke returned true'; end if;
  if exists (select 1 from rider_badges where user_id = '00000000-0000-0000-0000-0000000007a1' and badge = 'ambassador') then raise exception 'FAIL: still held'; end if;
  if not exists (select 1 from admin_audit_log where action = 'badge.revoke') then raise exception 'FAIL: revoke not audited'; end if;
end $$;
select set_config('request.jwt.claims', '', false), set_config('request.jwt.claim.sub', '', false);

-- OnMyLead Founder (migration 20261103900000_founder_badge.sql): the same rules as Brand Ambassador.
do $$ begin
  perform as_admin_session('00000000-0000-0000-0000-00000000ad01', 'aal2');
  if not admin_grant_badge('00000000-0000-0000-0000-00000000ad01', 'founder') then raise exception 'FAIL: founder grant'; end if;
  if admin_grant_badge('00000000-0000-0000-0000-00000000ad01', 'founder') then raise exception 'FAIL: founder second grant'; end if;
  if not admin_user_badges('00000000-0000-0000-0000-00000000ad01') @> '[{"badge":"founder","level":1}]' then raise exception 'FAIL: founder user badges'; end if;
  if jsonb_array_length(admin_badge_holders('founder')) <> 1 then raise exception 'FAIL: founder holders'; end if;
  begin
    insert into rider_badges (user_id, badge, level) values ('00000000-0000-0000-0000-0000000007b1', 'founder', 3);
    raise exception 'FAIL: founder level 3';
  exception when check_violation then null;
  end;
  if (select title from badge_push_text('founder', 1, 1)) <> 'You''re the OnMyLead Founder' then raise exception 'FAIL: founder push title'; end if;
  if (select title from badge_push_text('ambassador', 1, 1)) <> 'You''re an OnMyLead Brand Ambassador' then raise exception 'FAIL: ambassador push title after founder'; end if;
  if (select title from badge_push_text('mile_eater', 3, 1)) <> 'New Badge: Mile Eater Gold' then raise exception 'FAIL: earned push title after founder'; end if;
  if not admin_revoke_badge('00000000-0000-0000-0000-00000000ad01', 'founder') then raise exception 'FAIL: founder revoke'; end if;
end $$;
select as_user('00000000-0000-0000-0000-0000000007a1');
set role authenticated;
select expect_refused($q$insert into rider_badges (user_id, badge, level) values (auth.uid(), 'founder', 1)$q$, 'typed in Founder');
reset role;
select set_config('request.jwt.claims', '', false), set_config('request.jwt.claim.sub', '', false);
