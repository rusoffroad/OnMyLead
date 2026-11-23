-- Black Friday 2026 (Chris, 2026-11-23): the in-app announcement for the Pro Annual deal
-- ($14.99 for the first year, new Pro subscribers, through December 1). The app hides an
-- announcement once its "until" time passes (core/app-settings.ts liveNotice), so this ends on
-- its own at midnight US Central after December 1. Only set when no other announcement is up,
-- so an announcement the owner wrote in Admin is never replaced.
update app_settings
set value = jsonb_build_object(
  'text', 'Black Friday: OnMyLead Pro Annual is $14.99 for your first year instead of $29.99. For new Pro subscribers, through December 1. On iPhone and iPad the App Store shows the $14.99 price when you subscribe.',
  'until', '2026-12-02T06:00:00Z'
)
where key = 'announcement' and (value is null or value = 'null'::jsonb);
