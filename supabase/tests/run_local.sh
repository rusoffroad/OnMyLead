#!/usr/bin/env bash
# Runs the migrations, then the privacy, riding group, group chat, Pro, report, admin analytics, admin, clear/resolve, waypoint, planned stop, status button, block, social profile and contact form tests, against a throwaway local Postgres database.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres ./supabase/tests/run_local.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
db="ride_test_$$"
createdb "$db"
trap 'dropdb "$db"' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$here/auth_stub.sql" "${@}" \
  $(for f in "$here"/../migrations/*.sql; do echo -f "$f"; done) \
  -f "$here/privacy_test.sql" \
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
  -f "$here/contact_test.sql"
bash "$here/concurrency_test.sh" "$db"
