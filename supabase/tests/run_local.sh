#!/usr/bin/env bash
# Runs the migration and privacy tests against a throwaway local Postgres database.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres ./supabase/tests/run_local.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
db="ride_test_$$"
createdb "$db"
trap 'dropdb "$db"' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$here/auth_stub.sql" "${@}" \
  $(for f in "$here"/../migrations/*.sql; do echo -f "$f"; done) \
  -f "$here/privacy_test.sql"
