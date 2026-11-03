#!/usr/bin/env bash
# Runs the migrations, then the privacy, approval and ride limit, riding group, group chat, Pro, report, admin analytics, admin, clear/resolve, waypoint, planned stop, status button, block, social profile, contact form, Help Center, Google Play Billing, admin growth, store reviews, release controls, badge, Out Riding, Navigation Mode trail, custom share code, profile photo, notification inbox, ride miles, home feed, rider agreement, abuse report and event tests, against a throwaway local Postgres database.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres ./supabase/tests/run_local.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
db="ride_test_$$"
createdb "$db"
trap 'dropdb "$db"' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$here/auth_stub.sql" "${@}" \
  $(for f in "$here"/../migrations/*.sql; do echo -f "$f"; done) \
  -f "$here/privacy_test.sql" \
  -f "$here/approval_test.sql" \
  -f "$here/groups_test.sql" \
  -f "$here/group_chat_test.sql" \
  -f "$here/pro_test.sql" \
  -f "$here/reports_test.sql" \
  -f "$here/admin_analytics_test.sql" \
  -f "$here/admin_test.sql" \
  -f "$here/messages_test.sql" \
  -f "$here/waypoints_test.sql" \
  -f "$here/planned_stops_test.sql" \
  -f "$here/status_broadcast_test.sql" \
  -f "$here/blocks_test.sql" \
  -f "$here/social_profiles_test.sql" \
  -f "$here/contact_test.sql" \
  -f "$here/help_test.sql" \
  -f "$here/play_billing_test.sql" \
  -f "$here/admin_growth_test.sql" \
  -f "$here/store_reviews_test.sql" \
  -f "$here/release_controls_test.sql" \
  -f "$here/badges_test.sql" \
  -f "$here/out_riding_test.sql" \
  -f "$here/friends_test.sql" \
  -f "$here/nav_trails_test.sql" \
  -f "$here/share_codes_test.sql" \
  -f "$here/profile_photos_test.sql" \
  -f "$here/notification_inbox_test.sql" \
  -f "$here/ride_miles_test.sql" \
  -f "$here/home_feed_test.sql" \
  -f "$here/rider_agreement_test.sql" \
  -f "$here/abuse_reports_test.sql" \
  -f "$here/events_test.sql"
bash "$here/concurrency_test.sh" "$db"
