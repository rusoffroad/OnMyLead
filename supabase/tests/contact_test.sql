-- Contact form (20261023000000_contact_messages.sql). Runs after admin_test.sql, which sets up
-- as_admin_session() and the admin accounts. Each block raises an exception if a rule is broken.

-- C1. Riders and signed-out visitors can't call contact_submit() or list messages.
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
select expect_refused($q$select contact_submit('app', 'problem', 'Ben', 'ben@example.com', 'Hi')$q$, 'rider called contact_submit directly');
select expect_refused($q$select admin_contact_messages()$q$, 'rider listed contact messages');
reset role;
set role anon;
select expect_refused($q$select contact_submit('website', 'problem', null, 'x@example.com', 'Hi')$q$, 'visitor called contact_submit directly');
reset role;

-- C2. The function (service role, here the owner) saves a message, trimmed and lower-cased.
do $$
declare v uuid;
begin
  v := contact_submit('app', 'feature', ' Ben ', ' Ben@Example.com ', '  Add a fuel map  ',
                      '00000000-0000-0000-0000-00000000000b', 'ios 27.0', '1.0.0', 'ip-one');
  if not exists (select 1 from contact_messages where id = v and name = 'Ben' and email = 'ben@example.com'
                 and message = 'Add a fuel map' and status = 'new' and source = 'app') then
    raise exception 'FAIL: contact message not saved as sent';
  end if;
end $$;

-- C2b. The sender can't read it back, change it or delete it (row level security, no policies).
select as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
do $$ begin
  if (select count(*) from contact_messages) <> 0 then raise exception 'FAIL: sender read contact messages back'; end if;
end $$;
update contact_messages set status = 'closed';
delete from contact_messages;
select expect_refused($q$select contact_mark_emailed(gen_random_uuid(), true)$q$, 'rider called contact_mark_emailed');
reset role;
do $$ begin
  if (select count(*) from contact_messages where status = 'new') <> 1 then raise exception 'FAIL: sender changed their contact message'; end if;
end $$;

-- C3. Bad input is refused by the table.
select expect_refused($q$select contact_submit('fax', 'problem', null, 'a@example.com', 'Hi')$q$, 'unknown source saved');
select expect_refused($q$select contact_submit('website', 'lunch', null, 'a@example.com', 'Hi')$q$, 'unknown topic saved');
select expect_refused($q$select contact_submit('website', 'problem', null, 'not-an-email', 'Hi')$q$, 'bad email saved');
select expect_refused($q$select contact_submit('website', 'problem', null, 'a@example.com', '   ')$q$, 'empty message saved');

-- C4. Five an hour from one IP address, then the form says to wait.
do $$
declare i int;
begin
  for i in 1..5 loop
    perform contact_submit('website', 'other', null, 'visitor' || i || '@example.com', 'Message ' || i, null, null, null, 'ip-two');
  end loop;
  begin
    perform contact_submit('website', 'other', null, 'visitor9@example.com', 'One more', null, null, null, 'ip-two');
    raise exception 'FAIL: sixth message from one IP saved';
  exception when raise_exception then
    if sqlerrm <> 'rate_limited' then raise; end if;
  end;
  -- ...and the same for one email address from different IPs.
  for i in 1..4 loop
    perform contact_submit('website', 'other', null, 'ben@example.com', 'Again ' || i, null, null, null, 'ip-ben-' || i);
  end loop;
  begin
    perform contact_submit('website', 'other', null, 'BEN@example.com', 'Too many', null, null, null, 'ip-ben-9');
    raise exception 'FAIL: sixth message from one email saved';
  exception when raise_exception then
    if sqlerrm <> 'rate_limited' then raise; end if;
  end;
end $$;

-- C5. An admin with the authenticator code lists them and marks one replied; it is audit logged.
select as_admin_session('00000000-0000-0000-0000-00000000ad01', 'aal2');
set role authenticated;
do $$
declare r jsonb; v uuid;
begin
  r := admin_contact_messages('new', 0, 50);
  if (r ->> 'total')::int <> 10 or (r ->> 'new')::int <> 10 then raise exception 'FAIL: admin saw % new messages', r ->> 'total'; end if;
  if r -> 'rows' -> 0 ->> 'email' is null then raise exception 'FAIL: admin list missing the reply email'; end if;
  v := (select (x ->> 'id')::uuid from jsonb_array_elements(r -> 'rows') x where x ->> 'source' = 'app');
  perform admin_set_contact_status(v, 'replied');
  if (admin_contact_messages('replied') ->> 'total')::int <> 1 then raise exception 'FAIL: message not marked replied'; end if;
end $$;
reset role;
do $$ begin
  if not exists (select 1 from admin_audit_log where action = 'contact.replied') then raise exception 'FAIL: contact status change not audit logged'; end if;
end $$;

-- C6. An admin without the authenticator code is refused.
select as_admin_session('00000000-0000-0000-0000-00000000ad01', 'aal1');
set role authenticated;
select expect_refused($q$select admin_contact_messages()$q$, 'admin without two-factor listed contact messages');
reset role;

-- C7. Deleting the sender's account keeps the message but drops the link to the account.
delete from contact_messages where user_id is distinct from '00000000-0000-0000-0000-00000000000b';
delete from auth.users where id = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  if (select count(*) from contact_messages where user_id is null) <> 1 then raise exception 'FAIL: message lost or still linked after account delete'; end if;
end $$;

select 'ALL CONTACT FORM TESTS PASSED';
