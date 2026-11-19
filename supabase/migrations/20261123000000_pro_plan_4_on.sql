-- 4.0 is live on the App Store and Google Play: switch on the 4.0 Free and Pro plan
-- (Chris, 2026-11-19: "turn them on for me when it ships"). Same as flipping `pro_plan_4` on
-- Admin > Features; the app_settings_pro_plan_4 trigger (20261122000000_pro_plan_4.sql) records
-- the start time once and applies the plan. Turning it back off in Admin undoes it.
update app_settings
set value = value || '{"pro_plan_4": true}'::jsonb
where key = 'flags' and jsonb_typeof(value) = 'object';

insert into app_settings (key, value) values ('flags', '{"pro_plan_4": true}'::jsonb)
on conflict (key) do nothing;
