-- New Pro rider emails (migration 20261123300000_pro_signup_alerts.sql). Runs after
-- play_billing_test.sql. Each block raises an exception if a rule is broken.

-- A1. Row level security is on with no policy, so only the service role (the edge functions) sees it.
do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'pro_signup_alerts'::regclass) then
    raise exception 'FAIL: pro_signup_alerts has no row level security';
  end if;
  if exists (select 1 from pg_policies where tablename = 'pro_signup_alerts') then
    raise exception 'FAIL: pro_signup_alerts has a policy';
  end if;
end $$;

-- A2. One claim per subscription and kind: a second claim does nothing.
do $$
declare n int;
begin
  insert into pro_signup_alerts (store, subscription_id, kind) values ('google', 'tok-new', 'paid') on conflict do nothing;
  insert into pro_signup_alerts (store, subscription_id, kind) values ('google', 'tok-new', 'paid') on conflict do nothing;
  insert into pro_signup_alerts (store, subscription_id, kind) values ('google', 'tok-new', 'trial') on conflict do nothing;
  select count(*) into n from pro_signup_alerts where subscription_id = 'tok-new';
  if n <> 2 then raise exception 'FAIL: expected 2 claims, got %', n; end if;
  begin
    insert into pro_signup_alerts (store, subscription_id, kind) values ('stripe', 'x', 'paid');
    raise exception 'FAIL: unknown store accepted';
  exception when check_violation then null;
  end;
  delete from pro_signup_alerts where subscription_id = 'tok-new';
end $$;
