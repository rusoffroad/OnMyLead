-- Radio Sharing (Meshtastic) off until it has been tested with real radios (Chris 2026-11-19:
-- "lets switch the meshtastic off now until we can test it").
--
-- 4.0 builds treat radio_sharing as on unless this flag says false, so it is set to false here.
-- It hides You > Radio Sharing and drops any radio link in those builds with no app update. The
-- owner turns it back on in Admin > Settings. Older builds have no radio code and ignore the key.
update app_settings set value = value || '{"radio_sharing": false}'::jsonb
where key = 'flags' and jsonb_typeof(value) = 'object';
insert into app_settings (key, value) values ('flags', '{"radio_sharing": false}'::jsonb)
on conflict (key) do nothing;
