#!/usr/bin/env bash
# Two ride creations at the same moment by a Free rider: exactly one may succeed.
# Usage: concurrency_test.sh <database> (run_local.sh calls it after the SQL tests).
set -uo pipefail
db="$1"
user=00000000-0000-0000-0000-0000000002c1
psql -q -v ON_ERROR_STOP=1 -d "$db" -c "
  update app_settings set value = 'false' where key = 'auto_trial';
  insert into auth.users (id, raw_user_meta_data) values ('$user', '{\"full_name\":\"Cora Concurrent\"}');
  update app_settings set value = 'true' where key = 'auto_trial';"
create_ride() {
  psql -q -d "$db" -c "
    begin;
    select set_config('request.jwt.claim.sub', '$user', true);
    set local role authenticated;
    insert into rides (organizer_id, name, meet_at, meet_area_lat, meet_area_lng)
      values (auth.uid(), 'Race $1', now() + interval '1 day', 38.5, -109.5);
    select pg_sleep(1);
    commit;" >/dev/null 2>&1
}
create_ride 1 & create_ride 2 & wait
n=$(psql -tA -d "$db" -c "select count(*) from rides where organizer_id = '$user'")
if [ "$n" != "1" ]; then echo "FAIL: $n rides created by two simultaneous requests (expected 1)"; exit 1; fi
echo "CONCURRENT RIDE LIMIT TEST PASSED"
