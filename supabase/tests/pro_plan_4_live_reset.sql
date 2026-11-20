-- 4.0 went live and migration 20261123000000_pro_plan_4_on.sql switched the 4.0 Free and Pro plan
-- on. Check that, then put the database back to the plan as it was before the switch (flag off, no
-- start time), which is what the older tests below and pro_plan_4_test.sql were written for.
-- Turning the flag off runs the same trigger as Admin > Features, so the feature rows go back too.
do $$ begin
  if not pro_plan_4_on() then raise exception 'FAIL: pro_plan_4 not on after the go-live migration'; end if;
  if pro_plan_4_start() is null then raise exception 'FAIL: pro_plan_4 start time not recorded'; end if;
end $$;
update app_settings set value = value || '{"pro_plan_4": false}'::jsonb where key = 'flags';
delete from app_settings where key = 'pro_plan_4_start';
do $$ begin
  if pro_plan_4_on() or pro_plan_4_start() is not null then raise exception 'FAIL: reset did not switch the plan off'; end if;
end $$;
